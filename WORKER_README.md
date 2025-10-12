# Cloudflare Workers AI - Tool Calling Demo

A complete example demonstrating AI function calling with Cloudflare Workers AI. This worker intelligently routes queries to appropriate tools based on user intent.

## Features

- **Smart Query Routing**: Automatically calls the right function based on user query
- **Two Tool Implementations**:
  - `searchKnowledgeBase`: Search company policies and information
  - `getActiveUsers`: Get active user lists with optional filtering
- **Reusable `runWithTools` Utility**: Generic tool calling handler
- **TypeScript Support**: Full type definitions included
- **Mock Data + DB Ready**: Works with dummy data, D1 database integration ready

## Project Structure

```
cloudflare-toocalling/
├── wrangler.toml                 # Cloudflare Workers configuration
├── src/
│   └── worker/
│       ├── index.ts              # Main Worker script with tools
│       ├── runWithTools.ts       # Generic tool calling utility
│       └── types.d.ts            # TypeScript definitions
└── package.json                  # Updated with Worker scripts
```

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Authenticate with Cloudflare

```bash
npx wrangler login
```

### 3. Test Locally

```bash
npm run worker:dev
```

This starts a local development server at `http://localhost:8787`

## Usage

### Test with cURL

**Get Active Users:**
```bash
curl "http://localhost:8787?query=Show me the list of active users"
```

**Search Knowledge Base:**
```bash
curl "http://localhost:8787?query=What is our vacation policy?"
```

**POST Request:**
```bash
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"query": "Show me all active users in Engineering department"}'
```

### Example Queries

| Query | Tool Called | Description |
|-------|-------------|-------------|
| "Show me active users" | `getActiveUsers` | Returns list of active employees |
| "List users in Engineering" | `getActiveUsers` | Filters by department |
| "What's our vacation policy?" | `searchKnowledgeBase` | Searches company policies |
| "Tell me about remote work" | `searchKnowledgeBase` | Searches company info |
| "Show me benefits information" | `searchKnowledgeBase` | Searches benefits data |

### Response Format

```json
{
  "success": true,
  "query": "Show me the list of active users",
  "response": "Here are the currently active users:\n\n1. Alice Johnson (Engineering)...",
  "model": "@cf/meta/llama-3.1-8b-instruct"
}
```

## Deploy to Production

### Deploy Worker

```bash
npm run worker:deploy
```

Your worker will be deployed to: `https://cloudflare-ai-toolcalling.YOUR_SUBDOMAIN.workers.dev`

### View Logs

```bash
npm run worker:tail
```

## Customization

### Change AI Model

Edit `src/worker/index.ts:141`:

```typescript
// Choose your favorite LLM:
const model = "@cf/meta/llama-3.1-8b-instruct";  // Fast, good for simple tasks
// const model = "@cf/meta/llama-3.1-70b-instruct";  // More capable
// const model = "@hf/nousresearch/hermes-2-pro-mistral-7b";  // Good function calling
```

### Add D1 Database (Bonus Points!)

1. **Create D1 Database:**
```bash
npx wrangler d1 create my-database
```

2. **Update `wrangler.toml`:**
```toml
[[d1_databases]]
binding = "DB"
database_name = "my-database"
database_id = "your-database-id-from-step-1"
```

3. **Create Users Table:**
```bash
npx wrangler d1 execute my-database --command \
  "CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT,
    department TEXT,
    status TEXT,
    lastSeen TEXT
  )"
```

4. **Insert Sample Data:**
```bash
npx wrangler d1 execute my-database --command \
  "INSERT INTO users VALUES
    (1, 'Alice Johnson', 'alice@company.com', 'Engineering', 'active', '2025-10-12T10:30:00Z'),
    (2, 'Bob Smith', 'bob@company.com', 'Design', 'active', '2025-10-12T09:15:00Z')"
```

5. **Uncomment D1 Code** in `src/worker/index.ts:74-93`

### Add More Tools

Add new tools to the `tools` array in `src/worker/index.ts:158`:

```typescript
{
  name: "getWeather",
  description: "Get current weather for a location",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description: "City name"
      }
    },
    required: ["location"]
  },
  function: async ({ location }) => {
    // Your implementation
    return { temperature: 72, conditions: "sunny" };
  }
}
```

### Add Vectorize for Real Knowledge Base

Replace the mock knowledge base with Vectorize:

```typescript
// Create Vectorize index
// npx wrangler vectorize create my-knowledge-base --dimensions=768 --metric=cosine

async function searchKnowledgeBase({ query }: { query: string }, env: Env) {
  // Generate embedding for query
  const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: query
  });

  // Search Vectorize
  const results = await env.VECTORIZE.query(embedding.data[0], {
    topK: 5
  });

  return results.matches;
}
```

## How It Works

### 1. Query Routing

The AI model analyzes the user's query and decides which tool(s) to call:

- **User list queries** → `getActiveUsers`
- **Policy questions** → `searchKnowledgeBase`

### 2. Tool Calling Flow

```
User Query
    ↓
AI analyzes query
    ↓
AI decides to call tool(s)
    ↓
runWithTools executes function(s)
    ↓
Results sent back to AI
    ↓
AI generates final response
    ↓
Return to user
```

### 3. The `runWithTools` Utility

The `runWithTools` function handles the complete tool calling loop:

1. Sends initial request to AI with tools definition
2. Checks if AI wants to call tools
3. Executes tool functions
4. Sends results back to AI
5. Repeats until AI returns final response
6. Returns final text response

## Available Models

All these models support function calling on Cloudflare Workers AI:

- `@cf/meta/llama-3.1-8b-instruct` - Fast, 8B parameters
- `@cf/meta/llama-3.1-70b-instruct` - More capable, 70B parameters
- `@hf/nousresearch/hermes-2-pro-mistral-7b` - Good for function calling

[See full model list](https://developers.cloudflare.com/workers-ai/models/)

## Cost

Workers AI has a generous free tier:
- **Free:** 10,000 neurons/day
- **Paid:** $0.011 per 1,000 neurons

Function calling typically uses 2-3 requests per query.

## Troubleshooting

### "AI binding not found"

Make sure your `wrangler.toml` includes:
```toml
[ai]
binding = "AI"
```

### "Tool not called correctly"

The AI model might not understand when to call tools. Try:
1. Make tool descriptions more specific
2. Update system prompt with clearer guidelines
3. Try a different model (e.g., hermes-2-pro)

### TypeScript Errors

Install Wrangler types:
```bash
npm install --save-dev @cloudflare/workers-types
```

## Resources

- [Cloudflare Workers AI Docs](https://developers.cloudflare.com/workers-ai/)
- [Function Calling Guide](https://developers.cloudflare.com/workers-ai/function-calling/)
- [Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
- [Vectorize Docs](https://developers.cloudflare.com/vectorize/)

## License

MIT