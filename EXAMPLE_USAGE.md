# Example Usage

Complete examples for using the Real Estate & Architecture Apify Actors.

## Example 1: Basic Real Estate Scraping

### Input
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

### Output (Sample Property)
```json
{
  "address": "123 Main St, San Francisco, CA 94102",
  "price": 1500000,
  "beds": 3,
  "baths": 2,
  "sqFt": 2500,
  "lotSize": 5000,
  "lotDimensions": {
    "width": 50,
    "depth": 100
  },
  "yearBuilt": 1920,
  "zoning": "RH-3",
  "zestimate": 1520000,
  "daysOnMarket": 15,
  "latitude": 37.7749,
  "longitude": -122.4194,
  "rankScore": 85,
  "source": "zillow",
  "scrapedAt": "2024-01-15T10:30:00.000Z",
  "images": [
    "https://photos.zillowstatic.com/...",
    "https://photos.zillowstatic.com/..."
  ],
  "comps": [
    {
      "address": "125 Main St",
      "price": 1480000
    }
  ],
  "salesHistory": [
    {
      "date": "2020-05-15",
      "price": "$1,200,000",
      "event": "Sold"
    }
  ],
  "agentInfo": {
    "name": "John Doe",
    "phone": "(415) 555-1234"
  }
}
```

## Example 2: Architecture Scraping with Suggestions

### Input (Chained from Real Estate Scraper)
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

### Output (Sample Property with Architecture Data)
```json
{
  "address": "123 Main St, San Francisco, CA 94102",
  "price": 1500000,
  "sqFt": 2500,
  "lotDimensions": {
    "width": 50,
    "depth": 100
  },
  "zoning": "RH-3",
  "style": "Victorian",
  "facadeType": "Brick",
  "materials": ["Brick", "Wood", "Stone"],
  "roofType": "Gabled",
  "floors": 2,
  "buildingHeightMax": 40,
  "setbacks": 5,
  "neighborhoodStyle": "Victorian",
  "floorPlans": [
    {
      "url": "https://example.com/floorplan.pdf",
      "text": "First Floor Plan"
    }
  ],
  "suggestions": [
    {
      "id": "modern-glass",
      "name": "Modern Glass Facade",
      "description": "50x100ft lot: 2-story Modern glass facade (65% lot coverage), open-plan layout",
      "style": "Modern",
      "facadeType": "Glass",
      "materials": ["Glass", "Steel", "Concrete"],
      "roofType": "Flat",
      "floors": 2,
      "lotCoverage": 0.65,
      "estimatedSqFt": 6500,
      "estimatedCost": 1625000,
      "layout": {
        "type": "Open-plan",
        "features": [
          "Large windows",
          "Open kitchen-living",
          "Minimal walls",
          "Indoor-outdoor flow"
        ]
      },
      "pros": [
        "Maximum natural light",
        "Modern aesthetic",
        "Energy efficient with proper glazing"
      ],
      "cons": [
        "Higher construction cost",
        "Privacy considerations",
        "Maintenance of glass"
      ]
    },
    {
      "id": "traditional-modern",
      "name": "Traditional with Modern Elements",
      "description": "50x100ft lot: 2-story traditional design with modern interior, 50% coverage",
      "style": "Traditional/Modern Hybrid",
      "facadeType": "Mixed",
      "materials": ["Brick", "Wood siding", "Stone accents", "Modern windows"],
      "roofType": "Gabled",
      "floors": 2,
      "lotCoverage": 0.50,
      "estimatedSqFt": 5000,
      "estimatedCost": 900000,
      "layout": {
        "type": "Traditional with open spaces",
        "features": [
          "Formal entry",
          "Open kitchen-family room",
          "Separate living room",
          "Master suite"
        ]
      },
      "pros": [
        "Curb appeal",
        "Resale value",
        "Flexible interior layout"
      ],
      "cons": [
        "Higher material costs",
        "More complex design",
        "Longer construction time"
      ]
    }
  ]
}
```

## Example 3: API Usage

### Rank Land Endpoint

```bash
# Get top 10 ranked properties in San Francisco
curl "http://localhost:3000/rank-land?address=San%20Francisco&datasetId=abc123&limit=10"
```

```javascript
// JavaScript example
const response = await fetch(
  'http://localhost:3000/rank-land?address=San%20Francisco&datasetId=abc123&limit=10'
);
const data = await response.json();

console.log(`Found ${data.count} properties`);
data.results.forEach(property => {
  console.log(`${property.address}: Rank ${property.rankScore}`);
});
```

### Architect Suggestions Endpoint

```bash
# Get suggestions for 80x100ft lot with R1 zoning
curl "http://localhost:3000/architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1"
```

```javascript
// JavaScript example
const response = await fetch(
  'http://localhost:3000/architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1'
);
const data = await response.json();

data.suggestions.forEach(suggestion => {
  console.log(`${suggestion.name}: $${suggestion.estimatedCost.toLocaleString()}`);
  console.log(`  ${suggestion.description}`);
});
```

### Property Endpoint

```bash
# Get full property data with architecture suggestions
curl "http://localhost:3000/property/123%20Main%20St?realEstateDatasetId=abc123&architectureDatasetId=xyz789"
```

```javascript
// JavaScript example
const address = encodeURIComponent('123 Main St, San Francisco, CA');
const response = await fetch(
  `http://localhost:3000/property/${address}?realEstateDatasetId=abc123&architectureDatasetId=xyz789`
);
const data = await response.json();

const property = data.property;
console.log(`Property: ${property.address}`);
console.log(`Price: $${property.price.toLocaleString()}`);
console.log(`Rank Score: ${property.rankScore}`);

if (property.architecture?.suggestions) {
  console.log(`\nArchitecture Suggestions:`);
  property.architecture.suggestions.forEach(s => {
    console.log(`  - ${s.name}: $${s.estimatedCost.toLocaleString()}`);
  });
}
```

## Example 4: Complete Workflow (Actor-to-Actor Chaining)

```javascript
import { ApifyClient } from 'apify-client';

const client = new ApifyClient({
  token: process.env.APIFY_API_TOKEN,
});

async function scrapeAndAnalyze(location) {
  // Step 1: Scrape real estate data
  console.log('Step 1: Scraping real estate data...');
  const realEstateRun = await client.actor('your-username/real-estate-scraper').call({
    startUrls: [{ url: `https://www.zillow.com/homes/for_sale/${location}/` }],
    location: location,
    maxRequestsPerCrawl: 100,
    maxConcurrency: 5,
    requestDelay: 3,
    followDetailPages: true,
  });

  // Wait for completion
  await client.run(realEstateRun.id).waitForFinish();
  console.log(`Real Estate Dataset ID: ${realEstateRun.defaultDatasetId}`);

  // Step 2: Scrape architecture data
  console.log('Step 2: Scraping architecture data...');
  const archRun = await client.actor('your-username/architecture-scraper').call({
    realEstateDatasetId: realEstateRun.defaultDatasetId,
    maxRequestsPerCrawl: 50,
    maxConcurrency: 3,
    requestDelay: 4,
    generateSuggestions: true,
  });

  // Wait for completion
  await client.run(archRun.id).waitForFinish();
  console.log(`Architecture Dataset ID: ${archRun.defaultDatasetId}`);

  // Step 3: Query top ranked properties
  console.log('Step 3: Querying top ranked properties...');
  const response = await fetch(
    `http://localhost:3000/rank-land?address=${encodeURIComponent(location)}&datasetId=${realEstateRun.defaultDatasetId}&limit=10`
  );
  const rankedData = await response.json();

  console.log(`\nTop ${rankedData.count} Properties:`);
  rankedData.results.forEach((prop, index) => {
    console.log(`${index + 1}. ${prop.address} - Rank: ${prop.rankScore}`);
  });

  return {
    realEstateDatasetId: realEstateRun.defaultDatasetId,
    architectureDatasetId: archRun.defaultDatasetId,
    topProperties: rankedData.results,
  };
}

// Usage
scrapeAndAnalyze('San-Francisco-CA')
  .then(result => {
    console.log('\nWorkflow complete!');
    console.log(`Real Estate Dataset: ${result.realEstateDatasetId}`);
    console.log(`Architecture Dataset: ${result.architectureDatasetId}`);
  })
  .catch(error => {
    console.error('Error:', error);
  });
```

## Example 5: Frontend Integration

### React Component Example

```jsx
import React, { useState, useEffect } from 'react';

function PropertyRanking({ datasetId }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProperties() {
      try {
        const response = await fetch(
          `http://localhost:3000/rank-land?datasetId=${datasetId}&limit=20`
        );
        const data = await response.json();
        setProperties(data.results);
      } catch (error) {
        console.error('Error fetching properties:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchProperties();
  }, [datasetId]);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>Top Ranked Properties</h2>
      {properties.map(property => (
        <div key={property.address} className="property-card">
          <h3>{property.address}</h3>
          <p>Price: ${property.price.toLocaleString()}</p>
          <p>Rank Score: {property.rankScore}/100</p>
          <p>Size: {property.sqFt} sqft</p>
          <p>Lot: {property.lotSize} sqft</p>
        </div>
      ))}
    </div>
  );
}

function ArchitectSuggestions({ lotWidth, lotDepth, zoning }) {
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    async function fetchSuggestions() {
      const response = await fetch(
        `http://localhost:3000/architect-suggestions?lotWidth=${lotWidth}&lotDepth=${lotDepth}&zoning=${zoning}`
      );
      const data = await response.json();
      setSuggestions(data.suggestions);
    }

    fetchSuggestions();
  }, [lotWidth, lotDepth, zoning]);

  return (
    <div>
      <h2>Architecture Suggestions</h2>
      {suggestions.map(suggestion => (
        <div key={suggestion.id} className="suggestion-card">
          <h3>{suggestion.name}</h3>
          <p>{suggestion.description}</p>
          <p>Estimated Cost: ${suggestion.estimatedCost.toLocaleString()}</p>
          <p>Estimated SqFt: {suggestion.estimatedSqFt.toLocaleString()}</p>
          <div>
            <h4>Pros:</h4>
            <ul>
              {suggestion.pros.map((pro, i) => (
                <li key={i}>{pro}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Example 6: Scheduled Runs

### Using Apify Schedules

1. Go to https://console.apify.com/schedules
2. Create new schedule
3. Configure:
   - **Actor**: `real-estate-scraper`
   - **Frequency**: Daily at 2 AM
   - **Input**: Your standard input JSON
4. Save schedule

### Using Cron Jobs (Local/Server)

```bash
# Run daily at 2 AM
0 2 * * * curl -X POST https://api.apify.com/v2/acts/YOUR_ACTOR_ID/runs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startUrls":[...]}'
```

## Example 7: Error Handling

```javascript
async function safeScrape(location) {
  try {
    const run = await client.actor('your-username/real-estate-scraper').call({
      startUrls: [{ url: `https://www.zillow.com/homes/for_sale/${location}/` }],
      maxRequestsPerCrawl: 100,
    });

    // Wait with timeout
    const runResult = await Promise.race([
      client.run(run.id).waitForFinish(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 3600000) // 1 hour
      ),
    ]);

    if (runResult.status === 'SUCCEEDED') {
      return runResult.defaultDatasetId;
    } else {
      throw new Error(`Run failed with status: ${runResult.status}`);
    }
  } catch (error) {
    console.error('Scraping failed:', error);
    // Retry logic, fallback, etc.
    throw error;
  }
}
```

## Best Practices

1. **Rate Limiting**: Always use appropriate delays (3-5 seconds)
2. **Proxy Rotation**: Use residential proxies for better success rates
3. **Error Handling**: Implement retries and fallbacks
4. **Caching**: Cache API responses to reduce dataset queries
5. **Monitoring**: Set up alerts for failed runs
6. **Data Validation**: Validate scraped data before using
7. **Respect ToS**: Follow website terms of service

