import { runWithTools } from './runWithTools';

export interface Env {
  AI: any;
  DB: any;
  DOCUMENTS: R2Bucket;
  VECTORIZE: VectorizeIndex;
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
            name: "searchKnowledgeBase",
            description: "Search knowledge base",
            parameters: {
              type: "object",
              properties: {
                query: { type: "string" }
              },
              required: ["query"]
            },
            function: async (args) => searchKnowledgeBase(args, env)
          },
          {
            name: "getActiveUsers",
            description: "Get active users",
            parameters: {
              type: "object",
              properties: {
                limit: { type: "number" },
                department: { type: "string" }
              },
              required: []
            },
            function: async (args) => getActiveUsers(args, env)
          }
        ]
      });

      // Return response
      return new Response(JSON.stringify({
        success: true,
        query: userQuery,
        response: response,
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