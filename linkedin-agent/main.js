import { Actor, log } from 'apify';
import { SYSTEM_PROMPT } from './system-prompt.js';
import * as anthropicProvider from './providers/anthropic.js';
import * as openaiProvider from './providers/openai.js';
import * as geminiProvider from './providers/gemini.js';

/**
 * Prdikt LinkedIn Agent
 * Researches the last 7 days of AI / product-management news, writes ONE
 * LinkedIn post in Tarek's founder voice, and (unless reviewMode) publishes it
 * via the LinkedIn UGC Posts API.
 *
 * Model provider (Anthropic / OpenAI / Gemini) is switchable — either via the
 * actor input, or via the config saved by the dashboard (linkedin-agent/dashboard)
 * into the 'linkedin-agent-config' key-value store. Input wins over dashboard config.
 *
 * Scheduling is external: attach an Apify Schedule (cron) to this actor.
 *
 * Env vars (set as secret actor environment variables):
 *   ANTHROPIC_API_KEY | OPENAI_API_KEY | GEMINI_API_KEY  - key for the selected provider
 *   LINKEDIN_ACCESS_TOKEN  - w_member_social token (only when reviewMode=false)
 *   LINKEDIN_AUTHOR_URN    - urn:li:person:<id>          (only when reviewMode=false)
 */

const PROVIDERS = {
    anthropic: anthropicProvider,
    openai: openaiProvider,
    gemini: geminiProvider,
};

const CONFIG_STORE_NAME = 'linkedin-agent-config';
const CONFIG_KEY = 'config';
const HISTORY_STORE_NAME = 'linkedin-post-history';
const HISTORY_KEY = 'history';

await Actor.init();

const input = (await Actor.getInput()) ?? {};

// Dashboard-saved config is the fallback for anything the input doesn't set.
const configStore = await Actor.openKeyValueStore(CONFIG_STORE_NAME);
const savedConfig = (await configStore.getValue(CONFIG_KEY)) ?? {};

const providerName = input.provider ?? savedConfig.provider ?? 'anthropic';
const provider = PROVIDERS[providerName];
if (!provider) {
    throw new Error(`Unknown provider "${providerName}". Valid: ${Object.keys(PROVIDERS).join(', ')}.`);
}
const model = input.model || savedConfig.model || provider.DEFAULT_MODEL;
const reviewMode = input.reviewMode ?? savedConfig.reviewMode ?? true;
const maxWebSearches = input.maxWebSearches ?? savedConfig.maxWebSearches ?? 8;
const maxWebFetches = input.maxWebFetches ?? savedConfig.maxWebFetches ?? 6;

log.info(`Config: provider=${providerName}, model=${model}, reviewMode=${reviewMode}`);

const linkedinToken = process.env.LINKEDIN_ACCESS_TOKEN;
const linkedinAuthorUrn = process.env.LINKEDIN_AUTHOR_URN;
if (!reviewMode && (!linkedinToken || !linkedinAuthorUrn)) {
    throw new Error(
        'reviewMode is false but LINKEDIN_ACCESS_TOKEN and/or LINKEDIN_AUTHOR_URN are not set. '
        + 'Set both env vars, or run with reviewMode=true.',
    );
}

// --- Load post history (named store persists across runs) ---
const historyStore = await Actor.openKeyValueStore(HISTORY_STORE_NAME);
const history = (await historyStore.getValue(HISTORY_KEY)) ?? [];
const recentHistory = history.slice(-10);
log.info(`Loaded post history: ${history.length} entries (${recentHistory.length} passed to the model).`);

// --- Research + write via the selected provider ---
const userPrompt = [
    `Today's date is ${new Date().toISOString().slice(0, 10)}.`,
    '',
    'Start by fetching https://www.prdikt.com and https://www.prdikt.com/blog to refresh the product knowledge, then research this week\'s news and write today\'s post.',
    '',
    'Recent post history (most recent last) — do not repeat these topics, and do not use the same format as the last entry:',
    recentHistory.length > 0
        ? JSON.stringify(recentHistory.map(({ date, topic, format, hook, status }) => ({ date, topic, format, hook, status })), null, 2)
        : '(no previous posts — this is the first run)',
].join('\n');

const fullText = await provider.generatePost({
    model,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    maxWebSearches,
    maxWebFetches,
});

const post = extractPostJson(fullText);
log.info(`Draft ready — topic: "${post.topic}", format: "${post.format}", ${post.post_text.length} chars.`);
log.info(`\n----- POST -----\n${post.post_text}\n----------------`);

// --- Publish (or stop in review mode) ---
let status = 'draft';
let linkedinPostId = null;

if (reviewMode) {
    log.info('reviewMode=true — not publishing. The draft is in the run output.');
} else {
    ({ status, linkedinPostId } = await publishToLinkedIn(post.post_text));
}

// --- Log to history + run output ---
const entry = {
    date: new Date().toISOString(),
    provider: providerName,
    model,
    topic: post.topic,
    format: post.format,
    hook: post.hook,
    source_urls: post.source_urls,
    linkedin_post_id: linkedinPostId,
    status,
};
history.push(entry);
await historyStore.setValue(HISTORY_KEY, history);

const output = { ...entry, post_text: post.post_text, prdikt_mentioned: post.prdikt_mentioned, self_review_notes: post.self_review_notes };
await Actor.pushData(output);
await Actor.setValue('OUTPUT', output);

if (status === 'failed') {
    throw new Error('Post was written but publishing to LinkedIn failed — see log above. Logged as failed so the next run avoids the topic.');
}

await Actor.exit();

// --- Helpers ---

function extractPostJson(text) {
    const match = text.match(/<post_json>\s*([\s\S]*?)\s*<\/post_json>/);
    if (!match) {
        log.error(`Model output did not contain <post_json> tags. Full text:\n${text}`);
        throw new Error('Could not find <post_json> block in the model output.');
    }
    // Some models wrap the JSON in a markdown code fence — strip it.
    const raw = match[1].replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch (err) {
        throw new Error(`Failed to parse post JSON: ${err.message}`);
    }
    for (const field of ['topic', 'format', 'hook', 'post_text']) {
        if (!parsed[field] || typeof parsed[field] !== 'string') {
            throw new Error(`Post JSON is missing required string field "${field}".`);
        }
    }
    parsed.source_urls = Array.isArray(parsed.source_urls) ? parsed.source_urls : [];
    return parsed;
}

/**
 * Publishes exactly one post via the LinkedIn UGC Posts API.
 * 401 -> stop and report (token expired), no retry.
 * Other non-2xx -> retry once after 30s, then report failure.
 */
async function publishToLinkedIn(postText) {
    const body = JSON.stringify({
        author: linkedinAuthorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: { text: postText },
                shareMediaCategory: 'NONE',
            },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
        const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${linkedinToken}`,
                'X-Restli-Protocol-Version': '2.0.0',
                'Content-Type': 'application/json',
            },
            body,
        });

        if (res.ok) {
            const resBody = await res.json().catch(() => ({}));
            const id = res.headers.get('x-restli-id') ?? resBody.id ?? null;
            log.info(`Published to LinkedIn. Post id: ${id}`);
            return { status: 'published', linkedinPostId: id };
        }

        const errText = await res.text().catch(() => '');
        if (res.status === 401) {
            log.error(`LinkedIn returned 401 — access token expired or invalid. Not retrying. Body: ${errText}`);
            return { status: 'failed', linkedinPostId: null };
        }
        log.warning(`LinkedIn returned ${res.status} (attempt ${attempt}/2). Body: ${errText}`);
        if (attempt === 1) {
            log.info('Waiting 30s before the single retry...');
            await new Promise((resolve) => setTimeout(resolve, 30_000));
        }
    }
    return { status: 'failed', linkedinPostId: null };
}
