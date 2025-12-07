# Real Estate & Architecture Apify Actors

Production-ready Apify Actors for scraping comprehensive real estate and architecture data, computing land rankings, and generating architect layout/facade suggestions.

## 📁 Project Structure

```
apifyagent/
├── real-estate-scraper/      # Real Estate Scraper Actor
│   ├── main.js
│   ├── package.json
│   ├── input_schema.json
│   └── Dockerfile
├── architecture-scraper/     # Architecture Scraper Actor
│   ├── main.js
│   ├── package.json
│   ├── input_schema.json
│   └── Dockerfile
└── website-api/              # Website Integration API
    ├── server.js
    ├── package.json
    ├── .env.example
    └── Dockerfile
```

## 🏠 Real Estate Scraper Actor

Scrapes comprehensive property data from **Zillow**, **Redfin**, and **Realtor.com**.

### Features

- ✅ Scrapes: address, price, beds/baths, sqFt, lotSize/dimensions, yearBuilt, zoning, salesHistory, zestimate, daysOnMarket, comps, images, agentInfo, lat/lng
- ✅ Computes **rankScore** (0-100) using weighted formula:
  - `rankScore = (price/sqft * 0.3 + compsRatio * 0.3 + lotValue * 0.2 + conditionScore * 0.2)`
- ✅ Handles pagination, anti-bot detection (stealth mode, proxy rotation)
- ✅ Respects robots.txt, adds delays (2-5s), user-agent rotation

### Input Schema

```json
{
  "startUrls": ["https://www.zillow.com/homes/for_sale/"],
  "location": "San Francisco, CA",
  "maxRequestsPerCrawl": 100,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  },
  "maxConcurrency": 5,
  "requestDelay": 3,
  "followDetailPages": true
}
```

### Output

JSON dataset with all property fields + `rankScore` for land ranking API.

---

## 🏗️ Architecture Scraper Actor

Scrapes architecture-specific data and generates layout/facade suggestions.

### Features

- ✅ Scrapes: style (Victorian/Modern/etc), facadeType, materials, roofType, floors/stories, permits, floorPlans, lotDimensions, setbacks, buildingHeightMax, neighborhoodStyle
- ✅ Generates **3-5 architect suggestions** with:
  - Layout recommendations
  - Facade design options
  - Cost estimates
  - SqFt yields
  - Pros/cons

### Input Schema

```json
{
  "propertyUrls": ["https://www.zillow.com/homedetails/..."],
  "realEstateDatasetId": "abc123...",
  "maxRequestsPerCrawl": 50,
  "proxyConfiguration": {
    "useApifyProxy": true,
    "apifyProxyGroups": ["RESIDENTIAL"]
  },
  "generateSuggestions": true
}
```

### Output

JSON dataset merging real estate + architecture data + `suggestions[]` array.

---

## 🌐 Website Integration API

Express.js API endpoints for querying Apify datasets.

### Endpoints

#### 1. `GET /rank-land?address=...&datasetId=...&limit=10`

Returns top 10 ranked plots with comps.

**Example:**
```bash
curl "http://localhost:3000/rank-land?address=San%20Francisco&datasetId=abc123&limit=10"
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "total": 150,
  "results": [
    {
      "address": "123 Main St, San Francisco, CA",
      "price": 1500000,
      "rankScore": 85,
      "sqFt": 2500,
      "lotSize": 5000,
      "comps": [...],
      ...
    }
  ]
}
```

#### 2. `GET /architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1`

Returns layout/facade options based on lot parameters.

**Example:**
```bash
curl "http://localhost:3000/architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1"
```

**Response:**
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
      "style": "Modern",
      "facadeType": "Glass",
      "estimatedSqFt": 10400,
      "estimatedCost": 2600000,
      "layout": {...}
    }
  ]
}
```

#### 3. `GET /property/:address?realEstateDatasetId=...&architectureDatasetId=...`

Get full property data including architecture suggestions.

#### 4. `GET /health`

Health check endpoint.

---

## 🚀 Deployment

### Prerequisites

- Node.js 18+
- Apify account with API token
- Apify CLI (optional, for local testing)

### 1. Deploy Real Estate Scraper Actor

```bash
cd real-estate-scraper

# Install dependencies
npm install

# Test locally (requires Apify CLI)
apify run

# Deploy to Apify
apify push
```

### 2. Deploy Architecture Scraper Actor

```bash
cd architecture-scraper

# Install dependencies
npm install

# Test locally
apify run

# Deploy to Apify
apify push
```

### 3. Deploy Website API

```bash
cd website-api

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env and add your APIFY_API_TOKEN

# Run locally
npm start

# Or with Docker
docker build -t real-estate-api .
docker run -p 3000:3000 --env-file .env real-estate-api
```

---

## 🔗 Actor-to-Actor Integration

Chain the actors together:

1. **Run RealEstateScraper** → Get `datasetId`
2. **Run ArchitectureScraper** with `realEstateDatasetId` → Get architecture `datasetId`
3. **Use both dataset IDs** in website API queries

### Example Workflow

```javascript
// 1. Run Real Estate Scraper
const realEstateRun = await apifyClient.actor('your-username/real-estate-scraper').call({
  startUrls: [{ url: 'https://www.zillow.com/homes/for_sale/' }],
  location: 'San Francisco, CA',
  maxRequestsPerCrawl: 100,
});

const realEstateDatasetId = realEstateRun.defaultDatasetId;

// 2. Run Architecture Scraper (chained)
const archRun = await apifyClient.actor('your-username/architecture-scraper').call({
  realEstateDatasetId: realEstateDatasetId,
  maxRequestsPerCrawl: 50,
  generateSuggestions: true,
});

const archDatasetId = archRun.defaultDatasetId;

// 3. Query via Website API
const response = await fetch(
  `http://localhost:3000/rank-land?datasetId=${realEstateDatasetId}&limit=10`
);
```

---

## 🛠️ Configuration

### Environment Variables

**Website API (.env):**
```env
APIFY_API_TOKEN=your_apify_api_token_here
PORT=3000
```

### Proxy Configuration

Both actors support Apify's residential proxy groups:
- `RESIDENTIAL` - Residential proxies (recommended)
- `SHADER` - Datacenter proxies (faster, cheaper)

### Rate Limiting

- **Real Estate Scraper**: 3-5 second delays between requests
- **Architecture Scraper**: 4-6 second delays (more careful)
- Both use stealth mode and user-agent rotation

---

## 📊 Data Schema

### Real Estate Data

```typescript
{
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqFt: number;
  lotSize: number;
  lotDimensions: { width: number; depth: number };
  yearBuilt: number;
  zoning: string;
  salesHistory: Array<{ date: string; price: string }>;
  zestimate: number;
  daysOnMarket: number;
  comps: Array<any>;
  images: string[];
  agentInfo: { name: string; phone: string };
  latitude: number;
  longitude: number;
  rankScore: number; // 0-100
  source: 'zillow' | 'redfin' | 'realtor';
  scrapedAt: string;
}
```

### Architecture Data

```typescript
{
  ...realEstateData,
  style: string; // Victorian, Modern, Colonial, etc.
  facadeType: string;
  materials: string[];
  roofType: string;
  floors: number;
  permits: any[];
  floorPlans: Array<{ url: string; text: string }>;
  buildingHeightMax: number;
  setbacks: number;
  neighborhoodStyle: string;
  suggestions: Array<{
    id: string;
    name: string;
    description: string;
    style: string;
    facadeType: string;
    materials: string[];
    roofType: string;
    floors: number;
    lotCoverage: number;
    estimatedSqFt: number;
    estimatedCost: number;
    layout: {
      type: string;
      features: string[];
    };
    pros: string[];
    cons: string[];
  }>;
}
```

---

## 🐛 Troubleshooting

### Common Issues

1. **"Dataset not found"**
   - Verify dataset ID is correct
   - Check API token has access to the dataset

2. **"Rate limited"**
   - Increase `requestDelay` in actor input
   - Use residential proxies

3. **"Selector not found"**
   - Website structure may have changed
   - Update selectors in `main.js`

4. **"Proxy error"**
   - Check proxy configuration
   - Verify Apify proxy groups are enabled

---

## 📝 License

ISC

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

---

## 📞 Support

For issues or questions:
- Check Apify documentation: https://docs.apify.com
- Apify Community: https://forum.apify.com

