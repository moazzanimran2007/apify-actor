import express from 'express';
import axios from 'axios';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Apify API configuration
const APIFY_API_TOKEN = process.env.APIFY_API_TOKEN || '';
const APIFY_API_BASE = 'https://api.apify.com/v2';

/**
 * Get dataset items from Apify
 */
async function getDatasetItems(datasetId, limit = 1000) {
    try {
        const response = await axios.get(
            `${APIFY_API_BASE}/datasets/${datasetId}/items`,
            {
                headers: {
                    'Authorization': `Bearer ${APIFY_API_TOKEN}`,
                },
                params: {
                    limit,
                    clean: true,
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error(`Error fetching dataset ${datasetId}:`, error.message);
        throw error;
    }
}

/**
 * Search properties by address
 */
function searchByAddress(items, address) {
    const searchTerm = address.toLowerCase();
    return items.filter(item => {
        const itemAddress = (item.address || '').toLowerCase();
        return itemAddress.includes(searchTerm);
    });
}

/**
 * GET /rank-land?address=...
 * Returns top 10 ranked plots with comps
 */
app.get('/rank-land', async (req, res) => {
    try {
        const { address, datasetId, limit = 10 } = req.query;
        
        if (!datasetId) {
            return res.status(400).json({
                error: 'datasetId query parameter is required',
                message: 'Provide the Apify Dataset ID from RealEstateScraper actor run',
            });
        }
        
        // Fetch dataset items
        const items = await getDatasetItems(datasetId);
        
        // Filter by address if provided
        let filteredItems = items;
        if (address) {
            filteredItems = searchByAddress(items, address);
        }
        
        // Sort by rankScore (descending)
        filteredItems.sort((a, b) => {
            const scoreA = a.rankScore || 0;
            const scoreB = b.rankScore || 0;
            return scoreB - scoreA;
        });
        
        // Get top N results
        const topResults = filteredItems.slice(0, parseInt(limit));
        
        // Format response with comps
        const results = topResults.map(item => ({
            address: item.address,
            price: item.price,
            rankScore: item.rankScore,
            sqFt: item.sqFt,
            lotSize: item.lotSize,
            lotDimensions: item.lotDimensions,
            beds: item.beds,
            baths: item.baths,
            yearBuilt: item.yearBuilt,
            zestimate: item.zestimate,
            daysOnMarket: item.daysOnMarket,
            location: {
                latitude: item.latitude,
                longitude: item.longitude,
            },
            comps: item.comps || [],
            images: item.images || [],
            url: item.detailUrl || item.url,
            scrapedAt: item.scrapedAt,
        }));
        
        res.json({
            success: true,
            count: results.length,
            total: filteredItems.length,
            results,
        });
        
    } catch (error) {
        console.error('Error in /rank-land:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /architect-suggestions?lotWidth=80&lotDepth=100&zoning=R1
 * Returns layout/facade options based on lot parameters
 */
app.get('/architect-suggestions', async (req, res) => {
    try {
        const { 
            lotWidth, 
            lotDepth, 
            zoning = 'R1',
            datasetId,
            propertyUrl 
        } = req.query;
        
        // If datasetId and propertyUrl provided, fetch from dataset
        if (datasetId && propertyUrl) {
            const items = await getDatasetItems(datasetId);
            const property = items.find(item => 
                (item.url === propertyUrl) || 
                (item.detailUrl === propertyUrl) ||
                (item.address && propertyUrl.includes(item.address))
            );
            
            if (property && property.suggestions) {
                return res.json({
                    success: true,
                    property: {
                        address: property.address,
                        lotDimensions: property.lotDimensions,
                        zoning: property.zoning,
                    },
                    suggestions: property.suggestions,
                });
            }
        }
        
        // Generate suggestions from parameters
        if (!lotWidth || !lotDepth) {
            return res.status(400).json({
                error: 'Missing required parameters',
                message: 'Provide lotWidth and lotDepth, or datasetId and propertyUrl',
            });
        }
        
        const width = parseFloat(lotWidth);
        const depth = parseFloat(lotDepth);
        const lotArea = width * depth;
        const isNarrow = width < 40;
        const isUrban = lotArea < 5000;
        const isLarge = lotArea > 10000;
        
        const suggestions = [];
        
        // Suggestion 1: Modern Glass Facade
        if (!isNarrow && lotArea > 3000) {
            const coverage = 0.65;
            const buildableArea = lotArea * coverage;
            const stories = isLarge ? 2 : 1;
            const totalSqFt = buildableArea * stories;
            
            suggestions.push({
                id: 'modern-glass',
                name: 'Modern Glass Facade',
                description: `${width}x${depth}ft lot: ${stories}-story Modern glass facade (${Math.round(coverage * 100)}% lot coverage), open-plan layout`,
                style: 'Modern',
                facadeType: 'Glass',
                materials: ['Glass', 'Steel', 'Concrete'],
                roofType: 'Flat',
                floors: stories,
                lotCoverage: coverage,
                estimatedSqFt: Math.round(totalSqFt),
                estimatedCost: Math.round(totalSqFt * 250),
                layout: {
                    type: 'Open-plan',
                    features: ['Large windows', 'Open kitchen-living', 'Minimal walls', 'Indoor-outdoor flow'],
                },
            });
        }
        
        // Suggestion 2: Vertical Urban Design
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
                description: `${width}x${depth}ft lot: 2-story traditional design with modern interior, ${Math.round(coverage * 100)}% coverage`,
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
                description: `${width}x${depth}ft lot: 2-story minimalist concrete design with large courtyards, ${Math.round(coverage * 100)}% coverage`,
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
            });
        }
        
        res.json({
            success: true,
            lotParameters: {
                width: width,
                depth: depth,
                area: lotArea,
                zoning: zoning,
            },
            suggestions: suggestions.slice(0, 5),
        });
        
    } catch (error) {
        console.error('Error in /architect-suggestions:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * GET /property/:address
 * Get full property data including architecture suggestions
 */
app.get('/property/:address', async (req, res) => {
    try {
        const { address } = req.params;
        const { realEstateDatasetId, architectureDatasetId } = req.query;
        
        if (!realEstateDatasetId) {
            return res.status(400).json({
                error: 'realEstateDatasetId query parameter is required',
            });
        }
        
        // Fetch real estate data
        const realEstateItems = await getDatasetItems(realEstateDatasetId);
        const property = searchByAddress(realEstateItems, decodeURIComponent(address))[0];
        
        if (!property) {
            return res.status(404).json({
                error: 'Property not found',
            });
        }
        
        // Fetch architecture data if dataset ID provided
        let architectureData = null;
        if (architectureDatasetId) {
            const archItems = await getDatasetItems(architectureDatasetId);
            architectureData = archItems.find(item => 
                item.url === property.detailUrl || 
                item.url === property.url ||
                (item.address && item.address.toLowerCase() === property.address?.toLowerCase())
            );
        }
        
        res.json({
            success: true,
            property: {
                ...property,
                architecture: architectureData || null,
            },
        });
        
    } catch (error) {
        console.error('Error in /property:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
        });
    }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Real Estate & Architecture API server running on port ${PORT}`);
    console.log(`📊 Endpoints:`);
    console.log(`   GET /rank-land?address=...&datasetId=...`);
    console.log(`   GET /architect-suggestions?lotWidth=...&lotDepth=...&zoning=...`);
    console.log(`   GET /property/:address?realEstateDatasetId=...&architectureDatasetId=...`);
    console.log(`   GET /health`);
});

