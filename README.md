# Apify Actors: property data, land ranking and an AI LinkedIn writer

A set of Apify Actors (cloud scraping and automation jobs) plus a small API. Two Actors collect property listings and score each lot, a third suggests building designs for a lot, and a fourth drafts and publishes LinkedIn posts with an AI model.

## What's here

| Folder | What it does |
| :--- | :--- |
| `real-estate-scraper/` | Collects listings from Zillow, Redfin and Realtor.com and gives each property a 0 to 100 rank score |
| `architecture-scraper/` | Reads property pages for style, facade, materials and roof type, and suggests building layouts that fit the lot |
| `website-api/` | An Express API that serves rankings and suggestions from the Actors' results to a website |
| `linkedin-agent/` | Researches recent news and drafts a LinkedIn post in a founder's voice with Claude, GPT or Gemini, then publishes it or holds it for review. See its [own README](linkedin-agent/README.md) |

## How the rank score works

The real estate scraper scores each property from four parts, each scaled to 0 to 100:

- **Price per square foot** (30%)
- **Comparables:** how the average price of comparable homes compares with this one (30%)
- **Lot value:** price relative to lot size (20%)
- **Condition:** a base score raised for newer buildings, fewer days on the market, and a Zestimate close to the asking price (20%)

The weights and ranges are fixed in `real-estate-scraper/main.js`. They are a starting heuristic, not a tested valuation model.

## Design suggestions

The architecture scraper generates layout ideas from the lot's width, depth and zoning, using built-in templates (for example a modern glass-facade house for a wide lot, or a narrow vertical build with a rooftop terrace for an urban plot). Each suggestion includes floors, lot coverage, estimated square footage and cost, and pros and cons. These are rule-based examples, not architectural advice.

## The API

`website-api/server.js` exposes:

| Endpoint | Returns |
| :--- | :--- |
| `GET /rank-land?address=...&datasetId=...&limit=10` | Properties from a scraper run, sorted by rank score |
| `GET /architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1` | Layout suggestions for a lot |
| `GET /property/:address` | Combined listing and architecture data for one address |
| `GET /health` | A health check |

## Run it

You need Node.js 18 or newer and an Apify account with an API token.

```bash
git clone https://github.com/moazzanimran2007/apify-actor.git
cd apify-actor

# An Actor: install, then run with the Apify CLI or deploy it to Apify
cd real-estate-scraper && npm install
apify run        # or: apify push

# The API
cd ../website-api && npm install
cp env.example .env    # add your APIFY_API_TOKEN
npm start
```

[`QUICKSTART.md`](QUICKSTART.md), [`DEPLOYMENT.md`](DEPLOYMENT.md) and [`EXAMPLE_USAGE.md`](EXAMPLE_USAGE.md) have step-by-step deployment and usage examples.

## Tech stack

Node.js, the Apify SDK and Crawlee with Playwright (plus a stealth plugin), Apify proxies, Express, and Docker for each Actor. The LinkedIn agent uses the Anthropic, OpenAI or Google Gemini APIs and the LinkedIn posting API.

## Things to know

- The scrapers wait a few seconds between requests and rotate user agents, but the listing sites' terms limit automated collection. Check them before running at any scale.
- Site layouts change, so the page selectors in each `main.js` may need updating.

## License

ISC
