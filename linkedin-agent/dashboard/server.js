import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Dashboard server for the Prdikt LinkedIn agent.
 *
 * Two modes:
 *  - Apify mode (APIFY_TOKEN set): config + history live in Apify named
 *    key-value stores, shared with the actor. "Run now" triggers the actor.
 *  - Local mode (no token): config is saved to ./local-config.json so you can
 *    try the UI; history is empty and runs are disabled.
 *
 * Env vars:
 *   APIFY_TOKEN     - Apify API token (Console -> Settings -> Integrations)
 *   APIFY_ACTOR_ID  - actor to trigger, e.g. "your-username~linkedin-agent"
 *   PORT            - default 3300
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3300;
const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_ACTOR_ID = process.env.APIFY_ACTOR_ID;
const APIFY_BASE = 'https://api.apify.com/v2';

const CONFIG_STORE_NAME = 'linkedin-agent-config';
const HISTORY_STORE_NAME = 'linkedin-post-history';
const LOCAL_CONFIG_PATH = path.join(here, 'local-config.json');

const DEFAULT_CONFIG = {
    provider: 'anthropic',
    model: '',
    reviewMode: true,
    maxWebSearches: 8,
    maxWebFetches: 6,
};

const app = express();
app.use(express.json());
app.use(express.static(path.join(here, 'public')));

// --- Apify API helpers ---

const storeIdCache = new Map();

async function apifyFetch(url, options = {}) {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${APIFY_BASE}${url}${sep}token=${APIFY_TOKEN}`, options);
    return res;
}

async function getOrCreateStoreId(name) {
    if (storeIdCache.has(name)) return storeIdCache.get(name);
    const res = await apifyFetch(`/key-value-stores?name=${encodeURIComponent(name)}`, { method: 'POST' });
    if (!res.ok) throw new Error(`Apify store lookup failed (${res.status}): ${await res.text()}`);
    const { data } = await res.json();
    storeIdCache.set(name, data.id);
    return data.id;
}

async function getRecord(storeName, key) {
    const storeId = await getOrCreateStoreId(storeName);
    const res = await apifyFetch(`/key-value-stores/${storeId}/records/${key}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Apify record read failed (${res.status}): ${await res.text()}`);
    return res.json();
}

async function setRecord(storeName, key, value) {
    const storeId = await getOrCreateStoreId(storeName);
    const res = await apifyFetch(`/key-value-stores/${storeId}/records/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
    });
    if (!res.ok) throw new Error(`Apify record write failed (${res.status}): ${await res.text()}`);
}

// --- Config storage (Apify store or local file) ---

async function readConfig() {
    if (APIFY_TOKEN) {
        return { ...DEFAULT_CONFIG, ...((await getRecord(CONFIG_STORE_NAME, 'config')) ?? {}) };
    }
    if (fs.existsSync(LOCAL_CONFIG_PATH)) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8')) };
    }
    return { ...DEFAULT_CONFIG };
}

async function writeConfig(config) {
    if (APIFY_TOKEN) {
        await setRecord(CONFIG_STORE_NAME, 'config', config);
    } else {
        fs.writeFileSync(LOCAL_CONFIG_PATH, JSON.stringify(config, null, 2));
    }
}

// --- API routes ---

app.get('/api/status', (_req, res) => {
    res.json({
        mode: APIFY_TOKEN ? 'apify' : 'local',
        runEnabled: Boolean(APIFY_TOKEN && APIFY_ACTOR_ID),
        actorId: APIFY_ACTOR_ID ?? null,
    });
});

app.get('/api/config', async (_req, res) => {
    try {
        res.json(await readConfig());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/config', async (req, res) => {
    try {
        const { provider, model, reviewMode, maxWebSearches, maxWebFetches } = req.body ?? {};
        if (!['anthropic', 'openai', 'gemini'].includes(provider)) {
            return res.status(400).json({ error: `Invalid provider "${provider}".` });
        }
        const config = {
            provider,
            model: typeof model === 'string' ? model.trim() : '',
            reviewMode: Boolean(reviewMode),
            maxWebSearches: clampInt(maxWebSearches, 1, 20, 8),
            maxWebFetches: clampInt(maxWebFetches, 1, 20, 6),
            updatedAt: new Date().toISOString(),
        };
        await writeConfig(config);
        res.json(config);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/history', async (_req, res) => {
    try {
        if (!APIFY_TOKEN) return res.json([]);
        const history = (await getRecord(HISTORY_STORE_NAME, 'history')) ?? [];
        res.json(history.slice(-25).reverse());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/run', async (_req, res) => {
    try {
        if (!APIFY_TOKEN || !APIFY_ACTOR_ID) {
            return res.status(400).json({ error: 'Set APIFY_TOKEN and APIFY_ACTOR_ID env vars to trigger runs.' });
        }
        // Empty input -> the actor falls back to the dashboard-saved config.
        const runRes = await apifyFetch(`/acts/${APIFY_ACTOR_ID}/runs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
        });
        if (!runRes.ok) throw new Error(`Apify run trigger failed (${runRes.status}): ${await runRes.text()}`);
        const { data } = await runRes.json();
        res.json({
            runId: data.id,
            url: `https://console.apify.com/actors/runs/${data.id}`,
            status: data.status,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

app.listen(PORT, () => {
    console.log(`LinkedIn agent dashboard running at http://localhost:${PORT}`);
    console.log(`Mode: ${APIFY_TOKEN ? 'apify (shared config store)' : 'local (config saved to local-config.json)'}`);
});
