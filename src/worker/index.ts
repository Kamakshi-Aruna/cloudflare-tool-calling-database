import { runWithTools } from './runWithTools';

export interface Env {
  AI: any;
  DB: any;
  DOCUMENTS: R2Bucket;
  VECTORIZE: VectorizeIndex;
  OPENWEATHER_API_KEY: string;
}

function splitIntoChunks(text: string, chunkSize: number = 500): string[] {
  const chunks: string[] = [];
  const cleanText = text.replace(/\r\n/g, '\n').trim();
  const paragraphs = cleanText.split('\n\n');
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

async function processDocuments(env: Env) {
  const stats = { processed: 0, chunks: 0, errors: [] as string[] };

  const list = await env.DOCUMENTS.list();
  if (list.objects.length === 0) return stats;

  for (const object of list.objects) {
    try {
      const file = await env.DOCUMENTS.get(object.key);
      if (!file) continue;

      const text = await file.text();
      const chunks = splitIntoChunks(text, 500);

      for (let i = 0; i < chunks.length; i++) {
        try {
          const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', { text: chunks[i] });
          const truncatedText = chunks[i].length > 1000 ? chunks[i].substring(0, 1000) + '...' : chunks[i];

          await env.VECTORIZE.upsert([{
            id: `${object.key}-chunk-${i}`,
            values: embedding.data[0],
            metadata: {
              source: object.key,
              text: truncatedText,
              chunkIndex: i,
              totalChunks: chunks.length,
              processedAt: new Date().toISOString()
            }
          }]);

          stats.chunks++;
        } catch (error) {
          stats.errors.push(`Failed chunk ${i} of ${object.key}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

      stats.processed++;
    } catch (error) {
      stats.errors.push(`Failed ${object.key}: ${error instanceof Error ? error.message : 'Unknown'}`);
    }
  }

  return stats;
}

/**
 * Search the company knowledge base using Vectorize semantic search
 */
async function searchKnowledgeBase({ query }: { query: string }, env?: Env): Promise<any> {
  console.log(`Searching knowledge base for: ${query}`);

  if (!env?.VECTORIZE) {
    console.error('Vectorize not configured');
    return {
      found: false,
      message: "Knowledge base not configured. Please run setup-rag.sh to create the Vectorize index and upload documents."
    };
  }

  // Generate embedding for the query using Cloudflare AI
  console.log('Generating embedding for query...');
  const queryEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: query
  });

  // Search Vectorize for similar content
  console.log('Searching Vectorize index...');
  const results = await env.VECTORIZE.query(queryEmbedding.data[0], {
    topK: 3,  // Get top 3 most relevant chunks
    returnMetadata: true
  });

  if (results.matches.length === 0) {
    return {
      found: false,
      message: "No relevant information found in the knowledge base. Please upload documents to R2 and process them first."
    };
  }

  // Return the relevant chunks with source attribution
  console.log(`Found ${results.matches.length} relevant chunks`);
  return {
    found: true,
    results: results.matches.map(match => ({
      source: match.metadata?.source || 'unknown',
      content: match.metadata?.text || '',
      score: match.score,
      chunkIndex: match.metadata?.chunkIndex
    }))
  };
}

/**
 * Get active users from D1 database
 */
async function getActiveUsers(
  { limit = 10, department }: { limit?: number; department?: string },
  env?: Env
): Promise<any> {
  console.log(`Getting active users (limit: ${limit}, department: ${department || 'all'})`);

  if (env?.DB) {
    try {
      let query = "SELECT * FROM users WHERE status = 'active'";
      const params: any[] = [];

      if (department) {
        query += ' AND department = ?';
        params.push(department);
      }

      query += ' ORDER BY lastSeen DESC LIMIT ?';
      params.push(limit);

      console.log(`Executing D1 query: ${query}`);
      console.log(`Query params:`, params);
      const result = await env.DB.prepare(query).bind(...params).all();

      console.log(`D1 returned ${result.results.length} users`);
      return {
        source: "database",
        count: result.results.length,
        users: result.results,
      };
    } catch (error) {
      console.error('Database error:', error);
      throw new Error(`Failed to fetch users from database: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  throw new Error('Database not configured. Please check your D1 database binding.');
}

/**
 * Get current weather for a city using OpenWeatherMap API (real-time data)
 */
async function getCurrentWeather(
  { city, country }: { city: string; country?: string },
  env?: Env
): Promise<any> {
  console.log(`Getting weather for: ${city}${country ? ', ' + country : ''}`);

  if (!env?.OPENWEATHER_API_KEY) {
    return {
      error: true,
      message: "OpenWeatherMap API key not configured. Please add OPENWEATHER_API_KEY to your environment variables."
    };
  }

  try {
    // Build query with optional country code
    const query = country ? `${city},${country}` : city;

    // Get current weather from OpenWeatherMap API
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(query)}&appid=${env.OPENWEATHER_API_KEY}&units=metric`;
    const weatherResponse = await fetch(weatherUrl);

    if (!weatherResponse.ok) {
      const errorData = await weatherResponse.json() as any;
      return {
        error: true,
        message: errorData.message || `City "${city}" not found. Please check the spelling or try a different city.`
      };
    }

    const weatherData = await weatherResponse.json() as any;

    // Convert Unix timestamp to ISO string
    const timestamp = new Date(weatherData.dt * 1000).toISOString();
    const sunrise = new Date(weatherData.sys.sunrise * 1000).toLocaleTimeString();
    const sunset = new Date(weatherData.sys.sunset * 1000).toLocaleTimeString();

    return {
      location: {
        name: weatherData.name,
        country: weatherData.sys.country,
        coordinates: {
          latitude: weatherData.coord.lat,
          longitude: weatherData.coord.lon
        },
        timezone: weatherData.timezone
      },
      current: {
        temperature: Math.round(weatherData.main.temp * 10) / 10,
        temperature_unit: "°C",
        feels_like: Math.round(weatherData.main.feels_like * 10) / 10,
        temp_min: Math.round(weatherData.main.temp_min * 10) / 10,
        temp_max: Math.round(weatherData.main.temp_max * 10) / 10,
        humidity: weatherData.main.humidity,
        humidity_unit: "%",
        pressure: weatherData.main.pressure,
        pressure_unit: "hPa",
        visibility: weatherData.visibility / 1000, // Convert to km
        visibility_unit: "km",
        wind_speed: Math.round(weatherData.wind.speed * 3.6 * 10) / 10, // Convert m/s to km/h
        wind_speed_unit: "km/h",
        wind_direction: weatherData.wind.deg,
        clouds: weatherData.clouds.all,
        clouds_unit: "%",
        description: weatherData.weather[0].description,
        main: weatherData.weather[0].main,
        icon: weatherData.weather[0].icon,
        icon_url: `https://openweathermap.org/img/wn/${weatherData.weather[0].icon}@2x.png`
      },
      sun: {
        sunrise: sunrise,
        sunset: sunset
      },
      timestamp: timestamp,
      source: "OpenWeatherMap API (Real-time)"
    };
  } catch (error) {
    console.error('Weather API error:', error);
    return {
      error: true,
      message: `Failed to fetch weather data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Main Worker handler
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS headers for browser testing
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);

      // Special endpoint: Process documents and create embeddings
      if (url.pathname === '/process-docs') {
        const stats = await processDocuments(env);
        return new Response(JSON.stringify({
          success: stats.errors.length === 0,
          message: 'Document processing complete',
          stats: stats
        }, null, 2), {
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // Get query from request
      let userQuery: string;

      if (request.method === 'POST') {
        const body = await request.json() as { query: string };
        userQuery = body.query;
      } else {
        userQuery = url.searchParams.get('query') || 'Show me the active users';
      }

      console.log(`Processing query: ${userQuery}`);

      const model = "@cf/meta/llama-3.1-8b-instruct";

      // Run AI with tool calling
      const response = await runWithTools(env.AI, model, {
        messages: [
          { role: "user", content: userQuery }
        ],
        tools: [
          {
            name: "getCurrentWeather",
            description: "Gets real-time weather data",
            parameters: {
              type: "object",
              properties: {
                city: {
                  type: "string",
                  description: "City name (required)"
                },
                country: {
                  type: "string",
                  description: "Country name or code (optional, helps with accuracy)"
                }
              },
              required: ["city"]
            },
            function: async (args) => getCurrentWeather(args, env)
          },
          {
            name: "getActiveUsers",
            description: "Gets active users from database. Use ONLY for queries about users, employees, team members, or staff.",
            parameters: {
              type: "object",
              properties: {
                limit: { type: "number", description: "Maximum number of users to return (default: 10)" },
                department: { type: "string", description: "Filter by department (e.g., Engineering, Marketing)" }
              },
              required: []
            },
            function: async (args) => getActiveUsers(args, env)
          },
          {
            name: "searchKnowledgeBase",
            description: "Searches company documents and knowledge base. Use ONLY for queries about policies, procedures, documentation, or company information. Do NOT use for weather or user queries.",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string", description: "The search query" }
              },
              required: ["query"]
            },
            function: async (args) => searchKnowledgeBase(args, env)
          }
        ]
      });

      // Return response
      return new Response(JSON.stringify({
        success: true,
        query: userQuery,
        response: response.response,
        toolsUsed: response.toolsUsed,
        model: model,
      }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Error:', error);
      return new Response(JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, null, 2), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }
};