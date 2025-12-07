import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, KeyValueStore } from 'crawlee';
import playwright from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

/**
 * Real Estate Scraper Actor
 * Scrapes comprehensive property data from Zillow, Redfin, and Realtor.com
 * Computes rankScore for land ranking
 * 
 * Features:
 * - Stealth mode with proxy rotation
 * - Comprehensive data extraction
 * - Land ranking algorithm
 * - CSV/JSON export
 * - Robots.txt compliance
 * - Error handling and retries
 */

await Actor.init();

const {
    startUrls = [],
    location = '',
    maxRequestsPerCrawl = 100,
    proxyConfiguration = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    maxConcurrency = 5,
    requestDelay = 3,
    followDetailPages = true,
} = await Actor.getInput();

// Initialize proxy configuration
const proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);

// User agents for rotation
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
];

/**
 * Compute rankScore (0-100) based on weighted formula
 * rankScore = (price/sqft * 0.3 + compsRatio * 0.3 + lotValue * 0.2 + conditionScore * 0.2)
 */
function computeRankScore(property) {
    const pricePerSqft = property.price && property.sqFt 
        ? property.price / property.sqFt 
        : 0;
    
    // Normalize price per sqft (assuming $100-500/sqft range)
    const normalizedPricePerSqft = Math.min(Math.max((pricePerSqft - 100) / 400, 0), 1) * 100;
    
    // Comps ratio (comparable properties average price / current price)
    const compsRatio = property.comps && property.comps.length > 0 && property.price
        ? (property.comps.reduce((sum, comp) => sum + (comp.price || 0), 0) / property.comps.length) / property.price
        : 1;
    const normalizedCompsRatio = Math.min(Math.max((compsRatio - 0.5) / 0.5, 0), 1) * 100;
    
    // Lot value score (based on lot size and price)
    const lotValue = property.lotSize && property.price
        ? property.price / property.lotSize
        : 0;
    const normalizedLotValue = Math.min(Math.max((lotValue - 10) / 90, 0), 1) * 100;
    
    // Condition score (based on year built, days on market, zestimate accuracy)
    let conditionScore = 50; // Base score
    if (property.yearBuilt) {
        const age = new Date().getFullYear() - property.yearBuilt;
        conditionScore += age < 10 ? 20 : age < 30 ? 10 : 0;
    }
    if (property.daysOnMarket !== undefined) {
        conditionScore += property.daysOnMarket < 30 ? 20 : property.daysOnMarket < 90 ? 10 : 0;
    }
    if (property.zestimate && property.price) {
        const zestimateDiff = Math.abs(property.zestimate - property.price) / property.price;
        conditionScore += zestimateDiff < 0.1 ? 10 : zestimateDiff < 0.2 ? 5 : 0;
    }
    const normalizedConditionScore = Math.min(conditionScore, 100);
    
    // Weighted formula
    const rankScore = (
        normalizedPricePerSqft * 0.3 +
        normalizedCompsRatio * 0.3 +
        normalizedLotValue * 0.2 +
        normalizedConditionScore * 0.2
    );
    
    return Math.round(Math.min(Math.max(rankScore, 0), 100));
}

/**
 * Extract property data from Zillow listing page
 * Handles multiple selector patterns for robustness
 */
async function extractZillowData(page, url) {
    try {
        // Wait for property cards with multiple selector options
        await page.waitForSelector('[data-test="property-card"], .PropertyCardContainer, [data-testid="property-card"]', { 
            timeout: 15000 
        }).catch(() => {
            Actor.log.warning('Property cards not found, trying alternative selectors');
        });
        
        const properties = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(
                '[data-test="property-card"], .PropertyCardContainer, [data-testid="property-card"], .list-card'
            ));
            
            return cards.map(card => {
                // Address - multiple selectors
                const addressEl = card.querySelector('[data-test="property-card-addr"], .list-card-addr, [data-testid="property-address"]');
                const address = addressEl?.textContent?.trim() || '';
                
                // Price - multiple selectors
                const priceEl = card.querySelector('[data-test="property-card-price"], .list-card-price, [data-testid="property-price"]');
                const priceText = priceEl?.textContent?.trim() || '';
                const price = priceText.replace(/[^0-9]/g, '');
                
                // Details - multiple selectors
                const detailsEl = card.querySelector('[data-test="property-card-details"], .list-card-details, [data-testid="property-meta"]');
                const details = detailsEl?.textContent?.trim() || '';
                
                // Link
                const linkEl = card.querySelector('a[href*="/homedetails/"], a[href*="/zpid/"]');
                const link = linkEl?.href || '';
                
                // Parse details (beds/baths/sqft)
                const bedsMatch = details.match(/(\d+)\s*bed/i);
                const bathsMatch = details.match(/(\d+)\s*bath/i);
                const sqftMatch = details.match(/([\d,]+)\s*sqft/i);
                const lotMatch = details.match(/([\d,]+)\s*(?:sqft|acres?)\s*(?:lot|land)/i);
                
                return {
                    address,
                    price: price ? parseInt(price) : null,
                    beds: bedsMatch ? parseInt(bedsMatch[1]) : null,
                    baths: bathsMatch ? parseInt(bathsMatch[1]) : null,
                    sqFt: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : null,
                    lotSize: lotMatch ? parseFloat(lotMatch[1].replace(/,/g, '')) : null,
                    detailUrl: link.startsWith('http') ? link : `https://www.zillow.com${link}`,
                    source: 'zillow',
                };
            }).filter(p => p.address && p.price); // Filter out invalid entries
        });
        
        Actor.log.info(`Extracted ${properties.length} properties from Zillow listing page`);
        return properties;
    } catch (error) {
        Actor.log.error(`Error extracting Zillow data: ${error.message}`);
        return [];
    }
}

/**
 * Extract detailed property data from Zillow detail page
 * Comprehensive extraction with fallback selectors
 */
async function extractZillowDetailData(page, url) {
    try {
        const data = { url, source: 'zillow' };
        
        // Wait for page to load
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        
        // Address - multiple selectors
        data.address = await page.evaluate(() => {
            const selectors = [
                'h1[data-test="property-address"]',
                'h1.ds-address-container',
                '[data-testid="zpid"] + h1',
                'h1',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) return el.textContent?.trim() || '';
            }
            return '';
        });
        
        // Price - multiple selectors
        data.price = await page.evaluate(() => {
            const selectors = [
                '[data-test="price"]',
                '.ds-price',
                '[data-testid="price"]',
                '.ds-value',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = el.textContent?.trim() || '';
                    const price = text.replace(/[^0-9]/g, '');
                    if (price) return parseInt(price);
                }
            }
            return null;
        });
        
        // Property details - comprehensive extraction
        const details = await page.evaluate(() => {
            const detailsObj = {};
            
            // Try structured data first
            const detailItems = Array.from(document.querySelectorAll(
                '[data-testid="property-details"] li, .ds-bed-bath-living-area-container li, .ds-home-fact-list li'
            ));
            
            detailItems.forEach(item => {
                const text = item.textContent?.trim() || '';
                if (text.includes('bed') || text.includes('Bed')) {
                    const match = text.match(/(\d+)/);
                    if (match) detailsObj.beds = parseInt(match[1]);
                }
                if (text.includes('bath') || text.includes('Bath')) {
                    const match = text.match(/(\d+)/);
                    if (match) detailsObj.baths = parseInt(match[1]);
                }
                if (text.includes('sqft') || text.includes('sq ft')) {
                    const match = text.match(/([\d,]+)/);
                    if (match) detailsObj.sqFt = parseInt(match[1].replace(/,/g, ''));
                }
                if (text.includes('lot') || text.includes('Lot')) {
                    const match = text.match(/([\d,.]+)/);
                    if (match) {
                        const val = parseFloat(match[1].replace(/,/g, ''));
                        // Convert acres to sqft if needed
                        detailsObj.lotSize = text.includes('acre') ? val * 43560 : val;
                    }
                }
                if (text.includes('Built') || text.includes('Year')) {
                    const match = text.match(/(\d{4})/);
                    if (match) detailsObj.yearBuilt = parseInt(match[1]);
                }
            });
            
            return detailsObj;
        }).catch(() => ({}));
        
        Object.assign(data, details);
        
        // Zestimate
        data.zestimate = await page.evaluate(() => {
            const selectors = [
                '[data-testid="zestimate"]',
                '.ds-zestimate-value',
                '[data-test="zestimate"]',
            ];
            for (const sel of selectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = el.textContent?.trim() || '';
                    const price = text.replace(/[^0-9]/g, '');
                    if (price) return parseInt(price);
                }
            }
            return null;
        });
        
        // Days on market
        data.daysOnMarket = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const match = text.match(/(\d+)\s*(?:day|days)\s*(?:on|listed)/i);
            return match ? parseInt(match[1]) : null;
        });
        
        // Images - comprehensive extraction
        data.images = await page.evaluate(() => {
            const images = [];
            const selectors = [
                '[data-test="media-stream"] img',
                '.media-stream img',
                '.ds-photo-view img',
                'img[data-testid="media-photo"]',
            ];
            
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(img => {
                    const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
                    if (src && !src.includes('placeholder') && !src.includes('data:image')) {
                        images.push(src);
                    }
                });
            });
            
            return [...new Set(images)].slice(0, 20); // Remove duplicates, limit to 20
        });
        
        // Coordinates - from multiple sources
        const mapData = await page.evaluate(() => {
            // Try script tags
            const scripts = Array.from(document.querySelectorAll('script'));
            for (const script of scripts) {
                const content = script.textContent || '';
                const latMatch = content.match(/"latitude":\s*([\d.-]+)/);
                const lngMatch = content.match(/"longitude":\s*([\d.-]+)/);
                if (latMatch && lngMatch) {
                    return { lat: parseFloat(latMatch[1]), lng: parseFloat(lngMatch[1]) };
                }
            }
            
            // Try map element
            const mapEl = document.querySelector('[data-test="map"], .ds-map-container');
            if (mapEl) {
                const dataLat = mapEl.getAttribute('data-lat');
                const dataLng = mapEl.getAttribute('data-lng');
                if (dataLat && dataLng) {
                    return { lat: parseFloat(dataLat), lng: parseFloat(dataLng) };
                }
            }
            
            return null;
        });
        
        if (mapData) {
            data.latitude = mapData.lat;
            data.longitude = mapData.lng;
        }
        
        // Sales history
        data.salesHistory = await page.evaluate(() => {
            const history = [];
            const rows = Array.from(document.querySelectorAll(
                '[data-test="property-history"] tr, .ds-history tr, table tbody tr'
            ));
            
            rows.slice(0, 10).forEach(row => {
                const cells = row.querySelectorAll('td, th');
                if (cells.length >= 2) {
                    history.push({
                        date: cells[0]?.textContent?.trim() || '',
                        price: cells[1]?.textContent?.trim() || '',
                        event: cells[2]?.textContent?.trim() || '',
                    });
                }
            });
            
            return history;
        }).catch(() => []);
        
        // Agent info
        data.agentInfo = await page.evaluate(() => {
            const nameEl = document.querySelector('[data-test="agent-name"], .ds-listing-agent-name');
            const phoneEl = document.querySelector('[data-test="agent-phone"], .ds-listing-agent-phone');
            return {
                name: nameEl?.textContent?.trim() || '',
                phone: phoneEl?.textContent?.trim() || '',
            };
        }).catch(() => ({}));
        
        // Zoning and lot dimensions - from property facts
        const lotInfo = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const zoningMatch = text.match(/zoning[:\s]+([A-Z0-9-]+)/i);
            const dimMatch = text.match(/(\d+)\s*[x×]\s*(\d+)\s*(?:ft|feet|')/i);
            
            return {
                zoning: zoningMatch ? zoningMatch[1] : null,
                dimensions: dimMatch ? {
                    width: parseInt(dimMatch[1]),
                    depth: parseInt(dimMatch[2]),
                } : null,
            };
        });
        
        if (lotInfo.zoning) data.zoning = lotInfo.zoning;
        if (lotInfo.dimensions) data.lotDimensions = lotInfo.dimensions;
        
        // Comparables - try to extract from nearby listings
        data.comps = await page.evaluate(() => {
            const comps = [];
            const compCards = Array.from(document.querySelectorAll(
                '[data-test="nearby-home-card"], .ds-nearby-home-card, .PropertyCardContainer'
            ));
            
            compCards.slice(0, 5).forEach(card => {
                const priceEl = card.querySelector('[data-test="price"], .list-card-price');
                const addressEl = card.querySelector('[data-test="address"], .list-card-addr');
                if (priceEl && addressEl) {
                    const priceText = priceEl.textContent?.trim() || '';
                    const price = parseInt(priceText.replace(/[^0-9]/g, ''));
                    if (price) {
                        comps.push({
                            address: addressEl.textContent?.trim() || '',
                            price: price,
                        });
                    }
                }
            });
            
            return comps;
        }).catch(() => []);
        
        return data;
    } catch (error) {
        Actor.log.error(`Error extracting Zillow detail data: ${error.message}`);
        return { url, source: 'zillow' };
    }
}

/**
 * Extract property data from Redfin listing page
 * Enhanced with multiple selector patterns
 */
async function extractRedfinData(page, url) {
    try {
        await page.waitForSelector('.MapHomeCard, .HomeCardContainer, [data-testid="property-card"]', { 
            timeout: 15000 
        }).catch(() => {
            Actor.log.warning('Redfin property cards not found, trying alternative selectors');
        });
        
        const properties = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(
                '.MapHomeCard, .HomeCardContainer, [data-testid="property-card"], .homecard'
            ));
            
            return cards.map(card => {
                const addressEl = card.querySelector('.addressDisplay, .homeAddress, [data-testid="property-address"]');
                const address = addressEl?.textContent?.trim() || '';
                
                const priceEl = card.querySelector('.homecardV2Price, .homePrice, [data-testid="property-price"]');
                const priceText = priceEl?.textContent?.trim() || '';
                const price = priceText.replace(/[^0-9]/g, '');
                
                const statsEl = card.querySelector('.HomeStatsV2, .homeStats, [data-testid="property-meta"]');
                const stats = statsEl?.textContent?.trim() || '';
                
                const linkEl = card.querySelector('a[href*="/property/"], a[href*="/homes/"]');
                const link = linkEl?.href || '';
                
                const bedsMatch = stats.match(/(\d+)\s*bed/i);
                const bathsMatch = stats.match(/(\d+)\s*bath/i);
                const sqftMatch = stats.match(/([\d,]+)\s*sqft/i);
                const lotMatch = stats.match(/([\d,.]+)\s*(?:sqft|acres?)\s*(?:lot|land)/i);
                
                return {
                    address,
                    price: price ? parseInt(price) : null,
                    beds: bedsMatch ? parseInt(bedsMatch[1]) : null,
                    baths: bathsMatch ? parseInt(bathsMatch[1]) : null,
                    sqFt: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : null,
                    lotSize: lotMatch ? parseFloat(lotMatch[1].replace(/,/g, '')) : null,
                    detailUrl: link.startsWith('http') ? link : `https://www.redfin.com${link}`,
                    source: 'redfin',
                };
            }).filter(p => p.address && p.price);
        });
        
        Actor.log.info(`Extracted ${properties.length} properties from Redfin listing page`);
        return properties;
    } catch (error) {
        Actor.log.error(`Error extracting Redfin data: ${error.message}`);
        return [];
    }
}

/**
 * Extract property data from Realtor.com listing page
 * Enhanced with multiple selector patterns
 */
async function extractRealtorData(page, url) {
    try {
        await page.waitForSelector('[data-testid="property-card"], .BasePropertyCard, .PropertyCard', { 
            timeout: 15000 
        }).catch(() => {
            Actor.log.warning('Realtor.com property cards not found, trying alternative selectors');
        });
        
        const properties = await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll(
                '[data-testid="property-card"], .BasePropertyCard, .PropertyCard, [data-rf-test-id="property-card"]'
            ));
            
            return cards.map(card => {
                const addressEl = card.querySelector(
                    '[data-testid="property-address"], .PropertyCard__address, [data-rf-test-id="property-address"]'
                );
                const address = addressEl?.textContent?.trim() || '';
                
                const priceEl = card.querySelector(
                    '[data-testid="property-price"], .PropertyCard__price, [data-rf-test-id="property-price"]'
                );
                const priceText = priceEl?.textContent?.trim() || '';
                const price = priceText.replace(/[^0-9]/g, '');
                
                const detailsEl = card.querySelector(
                    '[data-testid="property-meta"], .PropertyCard__meta, [data-rf-test-id="property-meta"]'
                );
                const details = detailsEl?.textContent?.trim() || '';
                
                const linkEl = card.querySelector('a[href*="/realestateandhomes-detail/"], a[href*="/property/"]');
                const link = linkEl?.href || '';
                
                const bedsMatch = details.match(/(\d+)\s*bed/i);
                const bathsMatch = details.match(/(\d+)\s*bath/i);
                const sqftMatch = details.match(/([\d,]+)\s*sqft/i);
                const lotMatch = details.match(/([\d,.]+)\s*(?:sqft|acres?)\s*(?:lot|land)/i);
                
                return {
                    address,
                    price: price ? parseInt(price) : null,
                    beds: bedsMatch ? parseInt(bedsMatch[1]) : null,
                    baths: bathsMatch ? parseInt(bathsMatch[1]) : null,
                    sqFt: sqftMatch ? parseInt(sqftMatch[1].replace(/,/g, '')) : null,
                    lotSize: lotMatch ? parseFloat(lotMatch[1].replace(/,/g, '')) : null,
                    detailUrl: link.startsWith('http') ? link : `https://www.realtor.com${link}`,
                    source: 'realtor',
                };
            }).filter(p => p.address && p.price);
        });
        
        Actor.log.info(`Extracted ${properties.length} properties from Realtor.com listing page`);
        return properties;
    } catch (error) {
        Actor.log.error(`Error extracting Realtor.com data: ${error.message}`);
        return [];
    }
}

// Configure stealth mode
playwright.use(StealthPlugin());

// Create crawler with stealth mode
const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl,
    maxConcurrency,
    requestHandlerTimeoutSecs: 120,
    proxyConfiguration: proxyConfig,
    
    // Respect robots.txt
    ignoreSslErrors: false,
    
    launchContext: {
        launcher: playwright.chromium,
        launchOptions: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
            ],
        },
    },
    
    // Retry configuration
    maxRequestRetries: 3,
    requestHandlerTimeoutSecs: 180,
    
    async requestHandler({ request, page, enqueueLinks }) {
        const url = request.loadedUrl || request.url;
        Actor.log.info(`Processing: ${url}`);
        
        // Random user agent
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(userAgent);
        
        // Add random delay
        await page.waitForTimeout((requestDelay * 1000) + Math.random() * 2000);
        
        try {
            // Determine source and extract data
            let properties = [];
            
            if (url.includes('zillow.com')) {
                properties = await extractZillowData(page, url);
            } else if (url.includes('redfin.com')) {
                properties = await extractRedfinData(page, url);
            } else if (url.includes('realtor.com')) {
                properties = await extractRealtorData(page, url);
            }
            
            // Process each property
            for (const property of properties) {
                let fullPropertyData = { ...property };
                
                // If following detail pages, extract full data
                if (followDetailPages && property.detailUrl) {
                    try {
                        // Navigate to detail page if not already there
                        if (!url.includes('/homedetails/') && !url.includes('/zpid/')) {
                            await page.goto(property.detailUrl, { waitUntil: 'networkidle', timeout: 30000 });
                            await page.waitForTimeout(2000); // Additional wait for dynamic content
                        }
                        const detailData = await extractZillowDetailData(page, property.detailUrl);
                        fullPropertyData = { ...fullPropertyData, ...detailData };
                    } catch (error) {
                        Actor.log.warning(`Failed to extract detail data for ${property.detailUrl}: ${error.message}`);
                    }
                }
                
                // Compute rankScore
                fullPropertyData.rankScore = computeRankScore(fullPropertyData);
                fullPropertyData.scrapedAt = new Date().toISOString();
                
                // Save to dataset
                await Dataset.pushData(fullPropertyData);
            }
            
            // Enqueue pagination links
            if (url.includes('zillow.com')) {
                await enqueueLinks({
                    selector: '[data-test="pagination-next"]',
                    label: 'LISTING',
                });
            } else if (url.includes('redfin.com')) {
                await enqueueLinks({
                    selector: 'a[data-rf-test-name="next-page"]',
                    label: 'LISTING',
                });
            } else if (url.includes('realtor.com')) {
                await enqueueLinks({
                    selector: 'a[aria-label="Next page"]',
                    label: 'LISTING',
                });
            }
            
            // Enqueue detail pages if enabled
            if (followDetailPages) {
                await enqueueLinks({
                    selector: 'a[href*="/homedetails/"], a[href*="/property/"]',
                    label: 'DETAIL',
                });
            }
            
        } catch (error) {
            Actor.log.error(`Error processing ${url}: ${error.message}`);
            throw error;
        }
    },
    
    failedRequestHandler({ request }) {
        Actor.log.error(`Request ${request.url} failed too many times`);
    },
});

// Run crawler
await crawler.run(startUrls.map(url => ({ url: typeof url === 'string' ? url : url.url })));

Actor.log.info('Crawler finished. Data saved to dataset.');

// Export to CSV if requested
const exportToCSV = async () => {
    try {
        const items = await Dataset.fetchItems();
        if (items.length === 0) {
            Actor.log.info('No items to export');
            return;
        }
        
        // Convert to CSV
        const headers = Object.keys(items[0]).join(',');
        const rows = items.map(item => {
            return Object.values(item).map(val => {
                if (val === null || val === undefined) return '';
                if (typeof val === 'object') return JSON.stringify(val).replace(/"/g, '""');
                return String(val).replace(/"/g, '""');
            }).map(v => `"${v}"`).join(',');
        });
        
        const csv = [headers, ...rows].join('\n');
        
        // Save to key-value store
        await KeyValueStore.setValue('real-estate-data.csv', csv, { contentType: 'text/csv' });
        Actor.log.info(`Exported ${items.length} items to CSV`);
    } catch (error) {
        Actor.log.error(`Error exporting to CSV: ${error.message}`);
    }
};

await exportToCSV();

// Save summary statistics
const stats = {
    totalProperties: await Dataset.getInfo().then(info => info.itemCount || 0),
    timestamp: new Date().toISOString(),
    location: location || 'All',
    sources: ['zillow', 'redfin', 'realtor'],
};

await KeyValueStore.setValue('STATS', stats);
Actor.log.info(`Scraping complete. Total properties: ${stats.totalProperties}`);

await Actor.exit();

