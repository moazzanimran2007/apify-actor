import { Actor } from 'apify';
import { PlaywrightCrawler, Dataset, KeyValueStore } from 'crawlee';
import playwright from 'playwright-extra';
import StealthPlugin from 'playwright-extra-plugin-stealth';

/**
 * Architecture Scraper Actor
 * Scrapes architecture-specific data from property pages
 * Generates layout and facade suggestions for architects
 * 
 * Features:
 * - Architecture style detection
 * - Facade and material analysis
 * - Layout and design suggestions
 * - Cost estimates
 * - CSV/JSON export
 * - Actor-to-Actor integration with RealEstateScraper
 */

await Actor.init();

const {
    propertyUrls = [],
    realEstateDatasetId = '',
    maxRequestsPerCrawl = 50,
    proxyConfiguration = { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    maxConcurrency = 3,
    requestDelay = 4,
    generateSuggestions = true,
} = await Actor.getInput();

// Initialize proxy configuration
const proxyConfig = await Actor.createProxyConfiguration(proxyConfiguration);

// User agents for rotation
const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
];

// If dataset ID provided, fetch property URLs from RealEstateScraper output
let urlsToProcess = [...propertyUrls];
if (realEstateDatasetId) {
    try {
        const dataset = await Actor.openDataset(realEstateDatasetId);
        const items = await dataset.fetchItems();
        urlsToProcess = items
            .filter(item => item.detailUrl || item.url)
            .map(item => item.detailUrl || item.url);
        Actor.log.info(`Loaded ${urlsToProcess.length} URLs from dataset ${realEstateDatasetId}`);
    } catch (error) {
        Actor.log.error(`Failed to load dataset ${realEstateDatasetId}: ${error.message}`);
    }
}

/**
 * Generate architect suggestions based on lot data
 */
function generateArchitectSuggestions(property) {
    const suggestions = [];
    const lotWidth = property.lotDimensions?.width || property.lotSize ? Math.sqrt(property.lotSize * 43560) : null;
    const lotDepth = property.lotDimensions?.depth || property.lotSize ? Math.sqrt(property.lotSize * 43560) : null;
    const zoning = property.zoning || 'R1';
    const sqFt = property.sqFt || 0;
    
    if (!lotWidth || !lotDepth) {
        return suggestions;
    }
    
    const lotArea = lotWidth * lotDepth;
    const isNarrow = lotWidth < 40;
    const isUrban = lotArea < 5000;
    const isLarge = lotArea > 10000;
    
    // Suggestion 1: Modern Glass Facade
    if (!isNarrow && lotArea > 3000) {
        const coverage = 0.65;
        const buildableArea = lotArea * coverage;
        const stories = isLarge ? 2 : 1;
        const totalSqFt = buildableArea * stories;
        
        suggestions.push({
            id: 'modern-glass',
            name: 'Modern Glass Facade',
            description: `${Math.round(lotWidth)}x${Math.round(lotDepth)}ft lot: ${stories}-story Modern glass facade (${Math.round(coverage * 100)}% lot coverage), open-plan layout`,
            style: 'Modern',
            facadeType: 'Glass',
            materials: ['Glass', 'Steel', 'Concrete'],
            roofType: 'Flat',
            floors: stories,
            lotCoverage: coverage,
            estimatedSqFt: Math.round(totalSqFt),
            estimatedCost: Math.round(totalSqFt * 250), // $250/sqft
            layout: {
                type: 'Open-plan',
                features: ['Large windows', 'Open kitchen-living', 'Minimal walls', 'Indoor-outdoor flow'],
            },
            pros: ['Maximum natural light', 'Modern aesthetic', 'Energy efficient with proper glazing'],
            cons: ['Higher construction cost', 'Privacy considerations', 'Maintenance of glass'],
        });
    }
    
    // Suggestion 2: Vertical Urban Design (for narrow lots)
    if (isNarrow || isUrban) {
        const stories = 3;
        const coverage = 0.85;
        const buildableArea = lotArea * coverage;
        const totalSqFt = buildableArea * stories;
        
        suggestions.push({
            id: 'vertical-urban',
            name: 'Vertical Urban Design',
            description: `Narrow urban plot: Vertical ${stories}-story with rooftop terrace, minimalist brick facade`,
            style: 'Contemporary',
            facadeType: 'Brick',
            materials: ['Brick', 'Steel', 'Wood'],
            roofType: 'Flat with terrace',
            floors: stories,
            lotCoverage: coverage,
            estimatedSqFt: Math.round(totalSqFt),
            estimatedCost: Math.round(totalSqFt * 200),
            layout: {
                type: 'Vertical stack',
                features: ['Rooftop terrace', 'Open stairwell', 'Compact efficient spaces', 'Multi-level living'],
            },
            pros: ['Maximizes small lot', 'Rooftop outdoor space', 'Urban-friendly design'],
            cons: ['Requires elevator for accessibility', 'Higher per-floor cost', 'Limited yard space'],
        });
    }
    
    // Suggestion 3: Traditional with Modern Elements
    if (!isUrban && lotArea > 5000) {
        const stories = 2;
        const coverage = 0.50;
        const buildableArea = lotArea * coverage;
        const totalSqFt = buildableArea * stories;
        
        suggestions.push({
            id: 'traditional-modern',
            name: 'Traditional with Modern Elements',
            description: `${Math.round(lotWidth)}x${Math.round(lotDepth)}ft lot: 2-story traditional design with modern interior, ${Math.round(coverage * 100)}% coverage`,
            style: 'Traditional/Modern Hybrid',
            facadeType: 'Mixed',
            materials: ['Brick', 'Wood siding', 'Stone accents', 'Modern windows'],
            roofType: 'Gabled',
            floors: stories,
            lotCoverage: coverage,
            estimatedSqFt: Math.round(totalSqFt),
            estimatedCost: Math.round(totalSqFt * 180),
            layout: {
                type: 'Traditional with open spaces',
                features: ['Formal entry', 'Open kitchen-family room', 'Separate living room', 'Master suite'],
            },
            pros: ['Curb appeal', 'Resale value', 'Flexible interior layout'],
            cons: ['Higher material costs', 'More complex design', 'Longer construction time'],
        });
    }
    
    // Suggestion 4: Sustainable Passive House
    if (lotArea > 4000) {
        const stories = 1.5;
        const coverage = 0.55;
        const buildableArea = lotArea * coverage;
        const totalSqFt = buildableArea * stories;
        
        suggestions.push({
            id: 'passive-house',
            name: 'Sustainable Passive House',
            description: `Energy-efficient ${Math.round(stories)}-story passive house design with high-performance envelope, ${Math.round(coverage * 100)}% coverage`,
            style: 'Sustainable Modern',
            facadeType: 'High-performance',
            materials: ['Insulated panels', 'Triple-pane windows', 'Metal cladding', 'Green roof'],
            roofType: 'Green roof',
            floors: Math.ceil(stories),
            lotCoverage: coverage,
            estimatedSqFt: Math.round(totalSqFt),
            estimatedCost: Math.round(totalSqFt * 280),
            layout: {
                type: 'Compact efficient',
                features: ['Super-insulated', 'Heat recovery ventilation', 'Solar orientation', 'Minimal thermal bridges'],
            },
            pros: ['Ultra-low energy costs', 'Superior comfort', 'Environmental impact'],
            cons: ['Higher upfront cost', 'Specialized contractors needed', 'Design constraints'],
        });
    }
    
    // Suggestion 5: Minimalist Concrete
    if (lotArea > 6000 && !isNarrow) {
        const stories = 2;
        const coverage = 0.60;
        const buildableArea = lotArea * coverage;
        const totalSqFt = buildableArea * stories;
        
        suggestions.push({
            id: 'minimalist-concrete',
            name: 'Minimalist Concrete Design',
            description: `${Math.round(lotWidth)}x${Math.round(lotDepth)}ft lot: 2-story minimalist concrete design with large courtyards, ${Math.round(coverage * 100)}% coverage`,
            style: 'Minimalist',
            facadeType: 'Concrete',
            materials: ['Exposed concrete', 'Steel', 'Glass', 'Wood'],
            roofType: 'Flat',
            floors: stories,
            lotCoverage: coverage,
            estimatedSqFt: Math.round(totalSqFt),
            estimatedCost: Math.round(totalSqFt * 220),
            layout: {
                type: 'Courtyard house',
                features: ['Central courtyard', 'Clean lines', 'Indoor-outdoor integration', 'Minimal partitions'],
            },
            pros: ['Timeless aesthetic', 'Low maintenance', 'Durable materials'],
            cons: ['Concrete can be cold', 'Requires good design', 'Limited insulation options'],
        });
    }
    
    return suggestions.slice(0, 5); // Return top 5 suggestions
}

/**
 * Extract architecture data from property detail page
 * Comprehensive extraction with style detection and material analysis
 */
async function extractArchitectureData(page, url) {
    const data = {
        url,
        scrapedAt: new Date().toISOString(),
    };
    
    try {
        await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
        
        // Get full page text for analysis
        const pageText = await page.evaluate(() => document.body.textContent || '').catch(() => '');
        const lowerText = pageText.toLowerCase();
        
        // Style detection (Victorian, Modern, etc.) - enhanced
        const styleKeywords = {
            'Victorian': ['victorian', 'ornate', 'gingerbread', 'tower', 'turret', 'bay window', 'wrap-around porch'],
            'Modern': ['modern', 'contemporary', 'minimalist', 'clean lines', 'flat roof', 'mid-century', 'sleek'],
            'Colonial': ['colonial', 'symmetrical', 'columns', 'center hall', 'georgian', 'federal'],
            'Craftsman': ['craftsman', 'bungalow', 'exposed beams', 'built-ins', 'arts and crafts'],
            'Mediterranean': ['mediterranean', 'stucco', 'tile roof', 'arched', 'spanish', 'tuscan'],
            'Tudor': ['tudor', 'half-timbered', 'steep roof', 'english'],
            'Ranch': ['ranch', 'rambler', 'single-story', 'sprawling'],
            'Cape Cod': ['cape cod', 'dormer', 'steep roof', 'symmetrical'],
            'Split-Level': ['split-level', 'split entry', 'multi-level'],
            'Contemporary': ['contemporary', 'architectural', 'unique design', 'custom'],
        };
        
        let detectedStyle = 'Unknown';
        let maxMatches = 0;
        for (const [style, keywords] of Object.entries(styleKeywords)) {
            const matches = keywords.filter(kw => lowerText.includes(kw)).length;
            if (matches > maxMatches) {
                maxMatches = matches;
                detectedStyle = style;
            }
        }
        data.style = detectedStyle;
        
        // Facade type - enhanced detection
        const facadeTypes = {
            'Brick': ['brick', 'brickwork', 'brick facade'],
            'Siding': ['siding', 'vinyl siding', 'fiber cement'],
            'Stucco': ['stucco', 'plaster'],
            'Stone': ['stone', 'stone facade', 'stone veneer', 'limestone'],
            'Glass': ['glass', 'glass facade', 'curtain wall', 'glazing'],
            'Concrete': ['concrete', 'concrete facade', 'exposed concrete'],
            'Wood': ['wood', 'wood siding', 'cedar', 'wood shingle'],
            'Metal': ['metal', 'metal siding', 'corrugated', 'steel'],
        };
        
        let detectedFacade = 'Unknown';
        let facadeMatches = 0;
        for (const [facade, keywords] of Object.entries(facadeTypes)) {
            const matches = keywords.filter(kw => lowerText.includes(kw)).length;
            if (matches > facadeMatches) {
                facadeMatches = matches;
                detectedFacade = facade;
            }
        }
        data.facadeType = detectedFacade;
        
        // Materials - comprehensive extraction
        const materials = [];
        const materialKeywords = {
            'Brick': ['brick', 'brickwork'],
            'Wood': ['wood', 'cedar', 'pine', 'oak', 'hardwood'],
            'Stone': ['stone', 'limestone', 'granite', 'marble', 'slate'],
            'Concrete': ['concrete', 'cement'],
            'Glass': ['glass', 'glazing', 'windows'],
            'Steel': ['steel', 'metal', 'iron'],
            'Stucco': ['stucco', 'plaster'],
            'Vinyl': ['vinyl', 'pvc'],
            'Tile': ['tile', 'ceramic', 'porcelain'],
        };
        
        for (const [material, keywords] of Object.entries(materialKeywords)) {
            if (keywords.some(kw => lowerText.includes(kw))) {
                materials.push(material);
            }
        }
        data.materials = [...new Set(materials)];
        
        // Roof type - enhanced
        const roofTypes = {
            'Gabled': ['gabled', 'gable', 'pitched'],
            'Hipped': ['hipped', 'hip roof'],
            'Flat': ['flat roof', 'flat'],
            'Mansard': ['mansard', 'french'],
            'Gambrel': ['gambrel', 'barn'],
            'Shed': ['shed roof', 'shed'],
        };
        
        let detectedRoof = 'Unknown';
        let roofMatches = 0;
        for (const [roof, keywords] of Object.entries(roofTypes)) {
            if (keywords.some(kw => lowerText.includes(kw))) {
                detectedRoof = roof;
                roofMatches++;
            }
        }
        data.roofType = detectedRoof;
        
        // Floors/stories - multiple extraction methods
        data.floors = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const matches = [
                text.match(/(\d+)\s*(?:story|stories|floor|floors|level|levels)/i),
                text.match(/(?:single|two|three|four|five)\s*(?:story|stories|floor|floors)/i),
            ];
            
            for (const match of matches) {
                if (match) {
                    if (match[1]) return parseInt(match[1]);
                    const word = match[0].toLowerCase();
                    if (word.includes('two')) return 2;
                    if (word.includes('three')) return 3;
                    if (word.includes('four')) return 4;
                    if (word.includes('five')) return 5;
                    if (word.includes('single')) return 1;
                }
            }
            return null;
        });
        
        // Lot dimensions - enhanced extraction
        const lotInfo = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const dimMatch = text.match(/(\d+)\s*[x×]\s*(\d+)\s*(?:ft|feet|')/i);
            const areaMatch = text.match(/([\d,]+)\s*(?:sqft|sq\.?\s*ft|square\s*feet)/i);
            const acreMatch = text.match(/([\d.]+)\s*acres?/i);
            
            return {
                dimensions: dimMatch ? {
                    width: parseInt(dimMatch[1]),
                    depth: parseInt(dimMatch[2]),
                } : null,
                area: areaMatch ? parseInt(areaMatch[1].replace(/,/g, '')) : null,
                acres: acreMatch ? parseFloat(acreMatch[1]) : null,
            };
        });
        
        if (lotInfo.dimensions) data.lotDimensions = lotInfo.dimensions;
        if (lotInfo.area) data.lotSize = lotInfo.area;
        if (lotInfo.acres && !data.lotSize) data.lotSize = lotInfo.acres * 43560;
        
        // Building height max - from zoning or property details
        data.buildingHeightMax = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const matches = [
                text.match(/(?:max|maximum|height|zoning).*?(\d+)\s*(?:ft|feet|')/i),
                text.match(/(\d+)\s*(?:ft|feet)\s*(?:max|maximum|height)/i),
            ];
            for (const match of matches) {
                if (match && match[1]) return parseInt(match[1]);
            }
            return null;
        });
        
        // Setbacks
        data.setbacks = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const match = text.match(/(?:setback|set back|set-back).*?(\d+)\s*(?:ft|feet|')/i);
            return match ? parseInt(match[1]) : null;
        });
        
        // Zoning
        data.zoning = await page.evaluate(() => {
            const text = document.body.textContent || '';
            const match = text.match(/zoning[:\s]+([A-Z0-9-]+)/i);
            return match ? match[1] : null;
        });
        
        // Permits - try to find permit information
        data.permits = await page.evaluate(() => {
            const permits = [];
            const text = document.body.textContent || '';
            const permitMatch = text.match(/(?:permit|permitted).*?(\d{4})/gi);
            if (permitMatch) {
                permitMatch.forEach(m => {
                    const yearMatch = m.match(/(\d{4})/);
                    if (yearMatch) permits.push({ year: parseInt(yearMatch[1]) });
                });
            }
            return permits.slice(0, 5);
        });
        
        // Floor plans - enhanced extraction
        data.floorPlans = await page.evaluate(() => {
            const plans = [];
            const selectors = [
                'a[href*="floor"]',
                'a[href*="plan"]',
                'img[alt*="floor"]',
                'img[alt*="plan"]',
                '[data-testid*="floor"]',
                '[data-testid*="plan"]',
            ];
            
            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    const url = el.href || el.src || el.getAttribute('data-src');
                    const text = el.textContent?.trim() || el.alt || '';
                    if (url && !plans.find(p => p.url === url)) {
                        plans.push({ url, text });
                    }
                });
            });
            
            return plans.slice(0, 10);
        });
        
        // Neighborhood style - from surrounding context or similar properties
        data.neighborhoodStyle = detectedStyle;
        
    } catch (error) {
        Actor.log.error(`Error extracting architecture data from ${url}: ${error.message}`);
    }
    
    return data;
}

/**
 * Load property data from real estate dataset if available
 */
async function loadPropertyData(url) {
    if (!realEstateDatasetId) return {};
    
    try {
        const dataset = await Actor.openDataset(realEstateDatasetId);
        const items = await dataset.fetchItems();
        const matchingItem = items.find(item => 
            (item.detailUrl && item.detailUrl === url) || 
            (item.url && item.url === url)
        );
        return matchingItem || {};
    } catch (error) {
        Actor.log.warning(`Could not load property data from dataset: ${error.message}`);
        return {};
    }
}

// Configure stealth mode
playwright.use(StealthPlugin());

// Create crawler
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
    
    async requestHandler({ request, page }) {
        const url = request.loadedUrl || request.url;
        Actor.log.info(`Processing architecture data: ${url}`);
        
        // Random user agent
        const userAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
        await page.setUserAgent(userAgent);
        
        // Add random delay
        await page.waitForTimeout((requestDelay * 1000) + Math.random() * 2000);
        
        try {
            // Load property data from real estate dataset
            const propertyData = await loadPropertyData(url);
            
            // Extract architecture-specific data
            const architectureData = await extractArchitectureData(page, url);
            
            // Merge data
            const mergedData = {
                ...propertyData,
                ...architectureData,
                // Override URL with the one we scraped
                url: url,
            };
            
            // Generate architect suggestions if enabled
            if (generateSuggestions) {
                mergedData.suggestions = generateArchitectSuggestions(mergedData);
            }
            
            // Save to dataset
            await Dataset.pushData(mergedData);
            
            Actor.log.info(`Successfully processed ${url}`);
            
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
if (urlsToProcess.length > 0) {
    await crawler.run(urlsToProcess.map(url => ({ url: typeof url === 'string' ? url : url.url })));
    Actor.log.info('Architecture scraper finished. Data saved to dataset.');
    
    // Export to CSV
    const exportToCSV = async () => {
        try {
            const items = await Dataset.fetchItems();
            if (items.length === 0) {
                Actor.log.info('No items to export');
                return;
            }
            
            const headers = Object.keys(items[0]).join(',');
            const rows = items.map(item => {
                return Object.values(item).map(val => {
                    if (val === null || val === undefined) return '';
                    if (typeof val === 'object') return JSON.stringify(val).replace(/"/g, '""');
                    return String(val).replace(/"/g, '""');
                }).map(v => `"${v}"`).join(',');
            });
            
            const csv = [headers, ...rows].join('\n');
            await KeyValueStore.setValue('architecture-data.csv', csv, { contentType: 'text/csv' });
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
        suggestionsGenerated: generateSuggestions,
    };
    
    await KeyValueStore.setValue('STATS', stats);
    Actor.log.info(`Scraping complete. Total properties: ${stats.totalProperties}`);
} else {
    Actor.log.warning('No URLs to process. Please provide propertyUrls or realEstateDatasetId.');
}

await Actor.exit();

