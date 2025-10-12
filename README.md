# Cloudflare Workers AI - Tool Calling Demo

Complete example demonstrating AI function calling with Cloudflare Workers AI, featuring a Next.js UI for testing.

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Worker (Backend)

In terminal 1:
```bash
npm run worker:dev
```

This starts the Cloudflare Worker at `http://localhost:8787`

### 3. Start the UI (Frontend)

In terminal 2:
```bash
npm run dev
```

This starts Next.js at `http://localhost:3000`

### 4. Test the Demo

1. Open `http://localhost:3000` in your browser
2. Try the example queries or type your own
3. Watch the AI decide which tool to call

## How It Works

### Architecture

```
User Query → Next.js UI → Cloudflare Worker → Workers AI
                                   ↓
                           Tool Functions Called
                                   ↓
                           - getActiveUsers
                           - searchKnowledgeBase
                                   ↓
                           AI generates response
```

### UI Features

The Next.js interface (`src/app/page.tsx`) includes:

- **Query Input**: Type any question about users or company policies
- **Example Queries**: Pre-built queries to test both tools
- **Worker URL Config**: Switch between local/production Worker
- **Real-time Results**: See AI responses with loading states
- **Dark Mode Support**: Automatic theme detection

### Worker API

The Cloudflare Worker (`src/worker/index.ts`) handles:

1. **Request Processing**: GET/POST requests with query parameter
2. **AI Tool Calling**: Automatic tool selection via `runWithTools` utility
3. **Tool Execution**: Two implemented tools:
   - `searchKnowledgeBase`: Search company policies
   - `getActiveUsers`: Get active user lists
4. **Response Formatting**: JSON response with AI-generated text

## Testing Examples

### Via UI (http://localhost:3000)

Click the example buttons:
- "Show active users" → Calls `getActiveUsers`
- "Engineering team" → Calls `getActiveUsers` with department filter
- "Vacation policy" → Calls `searchKnowledgeBase`
- "Remote work" → Calls `searchKnowledgeBase`

### Via cURL

```bash
# Get active users
curl "http://localhost:8787?query=Show me the list of active users"

# Search knowledge base
curl "http://localhost:8787?query=What is our vacation policy?"

# POST request
curl -X POST http://localhost:8787 \
  -H "Content-Type: application/json" \
  -d '{"query": "Show me Engineering team members"}'
```

### Via JavaScript

```javascript
const response = await fetch('http://localhost:8787?query=' +
  encodeURIComponent('Show me active users'));
const data = await response.json();
console.log(data.response);
```

## Project Structure

```
cloudflare-toocalling/
├── src/
│   ├── app/
│   │   └── page.tsx              # Next.js UI (frontend)
│   └── worker/
│       ├── index.ts              # Main Worker with tools
│       ├── runWithTools.ts       # Generic tool calling utility
│       ├── types.d.ts            # TypeScript definitions
│       └── example-usage.ts      # Simplified example
├── wrangler.jsonc                # Worker configuration
├── package.json                  # Scripts and dependencies
├── README.md                     # This file
└── WORKER_README.md              # Detailed Worker docs
```

## Deployment

### Deploy Worker to Production

```bash
# Login to Cloudflare
npx wrangler login

# Deploy
npm run worker:deploy
```

Your Worker will be at: `https://cloudflare-ai-toolcalling.YOUR_SUBDOMAIN.workers.dev`

### Deploy UI to Vercel/Cloudflare Pages

1. Update Worker URL in UI to your production Worker
2. Deploy Next.js app:

```bash
# Vercel
vercel deploy

# Or Cloudflare Pages
npm run build
npx wrangler pages publish .next
```

## Customization

### Change AI Model

Edit `src/worker/index.ts:141`:

```typescript
const model = "@cf/meta/llama-3.1-8b-instruct";  // Fast
// const model = "@cf/meta/llama-3.1-70b-instruct";  // More capable
// const model = "@hf/nousresearch/hermes-2-pro-mistral-7b";  // Good tool calling
```

### Add New Tools

Add to the `tools` array in `src/worker/index.ts`:

```typescript
{
  name: "getWeather",
  description: "Get current weather",
  parameters: {
    type: "object",
    properties: {
      location: { type: "string", description: "City name" }
    },
    required: ["location"]
  },
  function: async ({ location }) => {
    return { temp: 72, condition: "sunny" };
  }
}
```

### Add D1 Database

See `WORKER_README.md` for detailed instructions on:
- Setting up D1 database
- Creating tables
- Updating code to use live DB instead of mock data

## Environment Variables

For production, create `.dev.vars` for local development:

```bash
# .dev.vars (local only, not committed)
WORKER_URL=http://localhost:8787
```

For production Next.js:

```bash
# .env.production
NEXT_PUBLIC_WORKER_URL=https://your-worker.workers.dev
```

## Troubleshooting

### Worker not starting

Make sure you have Wrangler installed:
```bash
npm install wrangler --save-dev
```

### CORS errors in UI

The Worker includes CORS headers. If you see errors, check:
1. Worker is running (`npm run worker:dev`)
2. Worker URL is correct in UI
3. Browser console for specific error

### AI not calling tools

Try a different model or improve tool descriptions:
```typescript
description: "Use this when users ask about employees, team members, or user lists"
```

### TypeScript errors

Install Workers types:
```bash
npm install --save-dev @cloudflare/workers-types
```

## Resources

- [Cloudflare Workers AI Docs](https://developers.cloudflare.com/workers-ai/)
- [Function Calling Guide](https://developers.cloudflare.com/workers-ai/function-calling/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Wrangler Documentation](https://developers.cloudflare.com/workers/wrangler/)

## What You'll Learn

This demo shows how to:
- ✅ Use Cloudflare Workers AI for function calling
- ✅ Build a reusable `runWithTools` utility
- ✅ Route queries to appropriate tools automatically
- ✅ Create a clean UI for testing AI interactions
- ✅ Handle loading states and errors gracefully
- ✅ Deploy to Cloudflare's edge network

## License

MIT