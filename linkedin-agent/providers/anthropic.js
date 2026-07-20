import Anthropic from '@anthropic-ai/sdk';
import { log } from 'apify';

const MAX_PAUSE_TURN_RESTARTS = 5;

export const DEFAULT_MODEL = 'claude-opus-4-8';

/**
 * Research + write via Claude with the server-side web search / web fetch tools.
 * Returns the model's full text output.
 */
export async function generatePost({ model, systemPrompt, userPrompt, maxWebSearches, maxWebFetches }) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('provider=anthropic but ANTHROPIC_API_KEY is not set.');

    const client = new Anthropic({ apiKey });
    const messages = [{ role: 'user', content: userPrompt }];
    let response;
    let restarts = 0;

    while (true) {
        const stream = client.messages.stream({
            model,
            max_tokens: 64000,
            thinking: { type: 'adaptive' },
            system: systemPrompt,
            tools: [
                { type: 'web_search_20260209', name: 'web_search', max_uses: maxWebSearches },
                { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: maxWebFetches },
            ],
            messages,
        });
        response = await stream.finalMessage();

        // Server-side tool loop hit its iteration limit — resume where it left off.
        if (response.stop_reason === 'pause_turn') {
            restarts += 1;
            if (restarts > MAX_PAUSE_TURN_RESTARTS) {
                throw new Error(`Turn still paused after ${MAX_PAUSE_TURN_RESTARTS} restarts — giving up.`);
            }
            log.info(`stop_reason=pause_turn — resuming (restart ${restarts}/${MAX_PAUSE_TURN_RESTARTS}).`);
            messages.push({ role: 'assistant', content: response.content });
            continue;
        }
        break;
    }

    if (response.stop_reason === 'refusal') {
        throw new Error('Claude refused the request (stop_reason=refusal).');
    }

    return response.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
}
