# Prdikt LinkedIn Agent

Apify Actor that ghostwrites and publishes LinkedIn posts for Tarek Zaghloul (founder of [Prdikt](https://www.prdikt.com)). Works with **Anthropic (Claude), OpenAI (GPT), or Google (Gemini)** — switch providers/models from the bundled dashboard (see below) or the actor input.

Each run it:

1. Fetches prdikt.com + /blog to refresh product knowledge (live site wins over the built-in knowledge base).
2. Researches the **last 7 days** of AI / product-management news with Claude's server-side web search (AI for PM, agile/sprint planning, PRD tooling, model releases, competitor moves).
3. Picks the one story with the strongest bridge to Prdikt's thesis that doesn't overlap the last 10 posts, rotating formats (hot take → practical insight → news reaction → founder lesson → product story; evergreen fallback).
4. Writes ONE post in Tarek's founder voice (hook under the "...see more" fold, 600–1,200 chars, 3–5 hashtags, sourced claims, Prdikt mentioned ≤ 1 in 3 posts), then self-reviews it.
5. Publishes via the LinkedIn UGC Posts API — unless `reviewMode` is on.
6. Appends `{date, topic, format, hook, source_urls, linkedin_post_id, status}` to the persistent history so future runs avoid duplicate topics.

**Guardrails:** exactly one post per run; never publishes more than once even on retry; 401 from LinkedIn stops immediately (token expired); other errors retry once after 30s then log `status: "failed"`.

## Setup

### 1. Environment variables (Actor → Settings → Environment variables, mark as secret)

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | when provider is `anthropic` | Claude API key from platform.claude.com |
| `OPENAI_API_KEY` | when provider is `openai` | OpenAI API key (Responses API + web search) |
| `GEMINI_API_KEY` | when provider is `gemini` | Google AI Studio key (Search grounding + URL context) |
| `LINKEDIN_ACCESS_TOKEN` | only when `reviewMode=false` | OAuth token with `w_member_social` scope |
| `LINKEDIN_AUTHOR_URN` | only when `reviewMode=false` | `urn:li:person:<id>` of the posting account |

You can set all three AI keys and switch providers freely from the dashboard.

Getting the LinkedIn credentials:

1. Create an app at <https://developer.linkedin.com/> and add the **Share on LinkedIn** product (grants `w_member_social`).
2. Run the 3-legged OAuth flow with scopes `openid profile w_member_social` to get an access token (tokens last ~60 days — expect to rotate them).
3. Get your person ID from `GET https://api.linkedin.com/v2/userinfo` (the `sub` field) → `LINKEDIN_AUTHOR_URN=urn:li:person:<sub>`.

### 2. Configuration: dashboard or input

Every setting resolves as **actor input → dashboard-saved config → default**. Leave the actor input empty on your schedule so the dashboard stays in control.

| Field | Default | Notes |
|---|---|---|
| `provider` | `anthropic` | `anthropic` \| `openai` \| `gemini`. |
| `model` | per provider | `claude-opus-4-8` / `gpt-5` / `gemini-2.5-pro`. |
| `reviewMode` | `true` | Writes the draft and stops. Flip to `false` to actually publish. |
| `maxWebSearches` | `8` | Cost control on web searches per run (Anthropic provider). |
| `maxWebFetches` | `6` | Cost control on page fetches per run (Anthropic provider). |

### The dashboard

`dashboard/` contains a small control panel to switch provider/model, toggle review mode, trigger a run, and see recent posts:

```bash
cd linkedin-agent/dashboard
npm install
APIFY_TOKEN=<your apify token> APIFY_ACTOR_ID=<username>~linkedin-agent npm start
# open http://localhost:3300
```

- **With `APIFY_TOKEN`**: settings are saved to the Apify key-value store `linkedin-agent-config`, which the actor reads on every run — so a schedule set up once follows whatever you last saved. `APIFY_ACTOR_ID` additionally enables the "Run now" button, and the Recent Posts table shows the shared history.
- **Without a token** (local mode): settings save to `dashboard/local-config.json` so you can preview the UI, but they won't reach the actor on Apify.

### 3. Frequency (Apify Schedule)

Scheduling is external — the actor runs once per invocation and never loops. In the Apify Console: **Schedules → Create new → attach this actor** and set a cron expression, e.g.:

- `0 9 * * 1,3,5` — Mon/Wed/Fri at 09:00 (Prdikt spec default)
- `0 9 * * 1-5` — every weekday at 09:00

Timezone is configurable on the schedule.

## Post history

Stored in the named key-value store **`linkedin-post-history`** under key `history` (persists across runs). The last 10 entries are passed to the model for topic dedupe and format rotation. Drafts and failed publishes are logged too, so retried topics don't duplicate.

## Run output

Each run pushes the full result (post text, topic, format, sources, publish status, LinkedIn post id) to the default dataset and to the `OUTPUT` record of the run's key-value store.

## Recommended rollout

1. Run manually with `reviewMode=true` a few times; read the drafts in the run output.
2. Tune `system-prompt.js` (voice, knowledge base) if needed.
3. Set the two LinkedIn env vars, flip `reviewMode=false`, run once manually, verify the post on LinkedIn.
4. Attach the schedule.

## Cost note

Each run makes one Claude call with adaptive thinking plus up to `maxWebSearches` web searches — with `claude-opus-4-8` expect roughly $0.20–$1 per run depending on how much it reads. Lower `maxWebSearches` or switch `model` to `claude-sonnet-5` to cut cost.
