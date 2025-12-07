# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites

- Apify account: https://apify.com (free tier available)
- Node.js 18+ (for local testing)
- Apify API token: https://console.apify.com/account/integrations

## Step 1: Deploy Actors to Apify

### Real Estate Scraper

1. Go to https://console.apify.com/actors
2. Click "Create new" → "Create Actor"
3. Upload the `real-estate-scraper` folder
4. Set:
   - **Name**: `real-estate-scraper`
   - **Runtime**: Node.js 18
   - **Build**: `npm install`
   - **Start**: `node main.js`
5. Click "Save" and "Test run"

### Architecture Scraper

Repeat steps 1-5 for `architecture-scraper` folder.

## Step 2: Run Real Estate Scraper

1. Open your `real-estate-scraper` actor
2. Click "Start" tab
3. Use this input:

```json
{
  "startUrls": [
    {
      "url": "https://www.zillow.com/homes/for_sale/San-Francisco-CA/"
    }
  ],
  "location": "San Francisco, CA",
  "maxRequestsPerCrawl": 50,
  "maxConcurrency": 3,
  "requestDelay": 4,
  "followDetailPages": true
}
```

4. Click "Start" and wait for completion
5. **Copy the Dataset ID** from the run results

## Step 3: Run Architecture Scraper

1. Open your `architecture-scraper` actor
2. Click "Start" tab
3. Use this input (replace `YOUR_DATASET_ID`):

```json
{
  "realEstateDatasetId": "YOUR_DATASET_ID",
  "maxRequestsPerCrawl": 25,
  "maxConcurrency": 2,
  "requestDelay": 5,
  "generateSuggestions": true
}
```

4. Click "Start" and wait for completion
5. **Copy the Architecture Dataset ID**

## Step 4: Set Up Website API

```bash
cd website-api

# Install dependencies
npm install

# Create .env file
echo "APIFY_API_TOKEN=your_token_here" > .env
echo "PORT=3000" >> .env

# Start server
npm start
```

## Step 5: Test API

### Test Rank Land Endpoint

```bash
curl "http://localhost:3000/rank-land?address=San%20Francisco&datasetId=YOUR_REAL_ESTATE_DATASET_ID&limit=5"
```

### Test Architect Suggestions

```bash
curl "http://localhost:3000/architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1"
```

## Example Response

### Rank Land Response

```json
{
  "success": true,
  "count": 5,
  "results": [
    {
      "address": "123 Main St, San Francisco, CA",
      "price": 1500000,
      "rankScore": 85,
      "sqFt": 2500,
      "lotSize": 5000,
      "beds": 3,
      "baths": 2,
      "zestimate": 1520000,
      "daysOnMarket": 15
    }
  ]
}
```

### Architect Suggestions Response

```json
{
  "success": true,
  "lotParameters": {
    "width": 80,
    "depth": 100,
    "area": 8000,
    "zoning": "R1"
  },
  "suggestions": [
    {
      "id": "modern-glass",
      "name": "Modern Glass Facade",
      "description": "80x100ft lot: 2-story Modern glass facade (65% lot coverage), open-plan layout",
      "estimatedSqFt": 10400,
      "estimatedCost": 2600000,
      "style": "Modern",
      "facadeType": "Glass"
    }
  ]
}
```

## Next Steps

- Set up scheduled runs (daily/weekly)
- Deploy API to production (Heroku, Railway, etc.)
- Build frontend dashboard
- Add caching (Redis)
- Set up monitoring

## Troubleshooting

**"Dataset not found"**
- Verify dataset ID is correct
- Check API token has access

**"Actor failed"**
- Check actor logs
- Verify input schema
- Increase request delays

**"API error"**
- Verify `APIFY_API_TOKEN` in `.env`
- Check dataset IDs are correct

## Support

- Apify Docs: https://docs.apify.com
- Apify Forum: https://forum.apify.com

