# Deployment Guide

Complete guide for deploying the Real Estate & Architecture Apify Actors and Website API.

## Prerequisites

1. **Apify Account**
   - Sign up at https://apify.com
   - Get your API token from https://console.apify.com/account/integrations

2. **Node.js 18+** (for local development)
3. **Docker** (optional, for containerized deployment)
4. **Apify CLI** (optional, for local testing)

## Step 1: Deploy Real Estate Scraper Actor

### Using Apify Console

1. Go to https://console.apify.com/actors
2. Click "Create new" → "Create Actor"
3. Upload the `real-estate-scraper` folder
4. Configure:
   - Name: `real-estate-scraper`
   - Runtime: Node.js 18
   - Build: `npm install`
   - Start: `node main.js`
5. Save and test with sample input

### Using Apify CLI

```bash
cd real-estate-scraper

# Login to Apify
apify login

# Test locally
apify run

# Push to Apify
apify push
```

### Input Example

```json
{
  "startUrls": [
    {
      "url": "https://www.zillow.com/homes/for_sale/San-Francisco-CA/"
    }
  ],
  "location": "San Francisco, CA",
  "maxRequestsPerCrawl": 100,
  "maxConcurrency": 5,
  "requestDelay": 3,
  "followDetailPages": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

## Step 2: Deploy Architecture Scraper Actor

### Using Apify Console

1. Go to https://console.apify.com/actors
2. Click "Create new" → "Create Actor"
3. Upload the `architecture-scraper` folder
4. Configure same as Real Estate Scraper
5. Save and test

### Using Apify CLI

```bash
cd architecture-scraper

# Test locally
apify run

# Push to Apify
apify push
```

### Input Example (Chained from Real Estate Scraper)

```json
{
  "realEstateDatasetId": "abc123xyz...",
  "maxRequestsPerCrawl": 50,
  "maxConcurrency": 3,
  "requestDelay": 4,
  "generateSuggestions": true,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  }
}
```

## Step 3: Deploy Website API

### Option A: Local Development

```bash
cd website-api

# Install dependencies
npm install

# Create .env file
echo "APIFY_API_TOKEN=your_token_here" > .env
echo "PORT=3000" >> .env

# Run server
npm start
```

### Option B: Docker

```bash
cd website-api

# Build image
docker build -t real-estate-api .

# Run container
docker run -d \
  -p 3000:3000 \
  -e APIFY_API_TOKEN=your_token_here \
  -e PORT=3000 \
  --name real-estate-api \
  real-estate-api
```

### Option C: Cloud Deployment (Heroku, Railway, etc.)

1. **Heroku:**
   ```bash
   heroku create your-app-name
   heroku config:set APIFY_API_TOKEN=your_token_here
   git push heroku main
   ```

2. **Railway:**
   - Connect GitHub repo
   - Add environment variables
   - Deploy automatically

3. **AWS/GCP/Azure:**
   - Use Dockerfile
   - Deploy to container service (ECS, Cloud Run, Container Instances)

## Step 4: Chain Actors Together

### Manual Workflow

1. Run Real Estate Scraper → Get `datasetId`
2. Copy dataset ID
3. Run Architecture Scraper with `realEstateDatasetId`
4. Get architecture `datasetId`
5. Use both IDs in API queries

### Automated Workflow (Using Apify API)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
  token: 'your_apify_token',
});

// 1. Run Real Estate Scraper
const realEstateRun = await client.actor('your-username/real-estate-scraper').call({
  startUrls: [{ url: 'https://www.zillow.com/homes/for_sale/' }],
  location: 'San Francisco, CA',
  maxRequestsPerCrawl: 100,
});

console.log('Real Estate Dataset ID:', realEstateRun.defaultDatasetId);

// Wait for run to complete
await client.run(realEstateRun.id).waitForFinish();

// 2. Run Architecture Scraper (chained)
const archRun = await client.actor('your-username/architecture-scraper').call({
  realEstateDatasetId: realEstateRun.defaultDatasetId,
  maxRequestsPerCrawl: 50,
  generateSuggestions: true,
});

console.log('Architecture Dataset ID:', archRun.defaultDatasetId);
```

## Step 5: Test API Endpoints

### Test Rank Land Endpoint

```bash
curl "http://localhost:3000/rank-land?address=San%20Francisco&datasetId=YOUR_DATASET_ID&limit=10"
```

### Test Architect Suggestions Endpoint

```bash
curl "http://localhost:3000/architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1"
```

### Test Property Endpoint

```bash
curl "http://localhost:3000/property/123%20Main%20St?realEstateDatasetId=YOUR_DATASET_ID&architectureDatasetId=YOUR_ARCH_DATASET_ID"
```

## Environment Variables

### Website API

| Variable | Description | Required |
|----------|-------------|----------|
| `APIFY_API_TOKEN` | Your Apify API token | Yes |
| `PORT` | Server port | No (default: 3000) |

### Actors

Actors use Apify's built-in environment variables:
- `APIFY_PROXY_PASSWORD` (auto-set)
- `APIFY_TOKEN` (auto-set)

## Monitoring & Logs

### View Actor Logs

1. Go to https://console.apify.com/actors
2. Click on your actor
3. Go to "Runs" tab
4. Click on a run to see logs

### View API Logs

If running locally:
```bash
# Logs appear in console
npm start
```

If running in Docker:
```bash
docker logs real-estate-api
```

## Troubleshooting

### Actor Issues

1. **"Proxy error"**
   - Enable residential proxies in input
   - Check proxy groups are available

2. **"Selector not found"**
   - Website structure changed
   - Update selectors in `main.js`

3. **"Rate limited"**
   - Increase `requestDelay`
   - Reduce `maxConcurrency`

### API Issues

1. **"Dataset not found"**
   - Verify dataset ID is correct
   - Check API token has access

2. **"Unauthorized"**
   - Verify `APIFY_API_TOKEN` is set correctly
   - Check token hasn't expired

## Cost Estimation

### Apify Costs

- **Compute**: ~$0.25 per 1000 requests
- **Residential Proxies**: ~$0.50 per GB
- **Storage**: Free for datasets (up to limit)

### Example Monthly Cost

- 10,000 properties scraped/month
- ~50,000 requests total
- ~$12.50 compute + $5 proxy = **~$17.50/month**

## Scaling

### Horizontal Scaling (API)

- Use load balancer (AWS ALB, nginx)
- Deploy multiple API instances
- Use Redis for caching

### Vertical Scaling (Actors)

- Increase `maxConcurrency` for faster scraping
- Use datacenter proxies for speed (cheaper, less stealth)

## Security

1. **API Token**: Never commit to git
2. **Rate Limiting**: Add rate limiting middleware
3. **CORS**: Configure CORS for production
4. **HTTPS**: Use HTTPS in production

## Next Steps

1. Set up scheduled runs (daily/weekly)
2. Add caching layer (Redis)
3. Set up monitoring (Sentry, DataDog)
4. Add authentication to API
5. Create frontend dashboard

