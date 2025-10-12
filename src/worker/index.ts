/**
 * Cloudflare Workers AI - Tool Calling Demo
 *
 * This worker demonstrates AI function calling with:
 * - searchKnowledgeBase: Search company knowledge base
 * - getActiveUsers: Get active users from database
 *
 * Example queries:
 * - "Show me the list of active users" -> Calls getActiveUsers
 * - "What's our vacation policy?" -> Calls searchKnowledgeBase
 */

import { runWithTools } from './runWithTools';
import { handleProcessRequest } from './process-docs';

export interface Env {
  AI: any; // Cloudflare AI binding
  DB: any; // D1 database binding
  DOCUMENTS: R2Bucket; // R2 storage for documents
  VECTORIZE: VectorizeIndex; // Vectorize for semantic search
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
        return await handleProcessRequest(env);
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
            description: "Search the company knowledge base for policies, procedures, benefits, and company information. Use this when users ask about company policies, vacation, remote work, benefits, expenses, etc.",
            parameters: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "The search query (e.g., 'vacation policy', 'remote work', 'benefits')"
                }
              },
              required: ["query"]
            },
            function: async (args) => searchKnowledgeBase(args, env)
          },
          {
            name: "getActiveUsers",
            description: "Get a list of active users/employees. Use this when users ask about team members, active users, employee lists, etc.",
            parameters: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Maximum number of users to return (default: 10)"
                },
                department: {
                  type: "string",
                  description: "Filter by department (e.g., 'Engineering', 'Design', 'Marketing')"
                }
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