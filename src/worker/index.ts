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

export interface Env {
  AI: any; // Cloudflare AI binding
  DB: any; // D1 database binding
}

// Dummy knowledge base (replace with actual Vectorize/AI Search in production)
const knowledgeBase = {
  "vacation policy": "Employees get 20 days of paid vacation per year, plus 10 sick days. Vacation must be approved 2 weeks in advance.",
  "remote work": "We support hybrid work with 2 days in office per week. Fully remote available for approved cases.",
  "benefits": "We offer health insurance, 401k matching up to 6%, gym membership, and education stipend of $2000/year.",
  "office hours": "Core hours are 10am-3pm. Flexible schedule otherwise. No strict 9-5 requirement.",
  "expense policy": "Submit expenses via Expensify. Meals up to $50/day when traveling. Equipment approved case by case.",
};


/**
 * Search the company knowledge base
 */
async function searchKnowledgeBase({ query }: { query: string }): Promise<any> {
  console.log(`Searching knowledge base for: ${query}`);

  // Simple keyword matching (replace with Vectorize or AI Search in production)
  const queryLower = query.toLowerCase();
  const results = [];

  for (const [topic, content] of Object.entries(knowledgeBase)) {
    if (queryLower.includes(topic) || topic.includes(queryLower)) {
      results.push({ topic, content });
    }
  }

  if (results.length === 0) {
    // Fallback: return all topics if no match
    return {
      found: false,
      message: "No exact matches found. Here are available topics:",
      topics: Object.keys(knowledgeBase),
    };
  }

  return {
    found: true,
    results: results,
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
      // Get query from request
      const url = new URL(request.url);
      let userQuery: string;

      if (request.method === 'POST') {
        const body = await request.json() as { query: string };
        userQuery = body.query;
      } else {
        userQuery = url.searchParams.get('query') || 'Show me the active users';
      }

      console.log(`Processing query: ${userQuery}`);

      // Choose your favorite LLM - these models support function calling:
      // - @cf/meta/llama-3.1-8b-instruct (fast, good for simple tasks)
      // - @cf/meta/llama-3.1-70b-instruct (more capable)
      // - @hf/nousresearch/hermes-2-pro-mistral-7b (good function calling)
      const model = "@cf/meta/llama-3.1-8b-instruct";

      // System prompt that guides the AI on when to use which tool
      const systemPrompt = `You are a helpful company assistant. You have access to these tools:
1. searchKnowledgeBase - Search company policies, benefits, procedures
2. getActiveUsers - Get active employee information

Instructions:
- When user asks about users/employees → call getActiveUsers ONCE
- When user asks about policies/benefits → call searchKnowledgeBase ONCE
- After calling tools and receiving results → immediately provide a natural language response
- DO NOT call the same tool multiple times
- Synthesize the tool results into a clear, helpful answer for the user`;

      // Run AI with tool calling
      const response = await runWithTools(env.AI, model, {
        messages: [
          { role: "system", content: systemPrompt },
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
            function: searchKnowledgeBase
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