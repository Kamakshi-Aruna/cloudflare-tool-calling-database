# AutoRAG Setup Guide

Upgrade from hardcoded knowledge base to RAG (Retrieval Augmented Generation) with R2 + Vectorize.

## Architecture

```
Documents (PDF/TXT) → R2 Storage
                        ↓
                   Text Extraction
                        ↓
                 AI Embeddings (@cf/baai/bge-base-en-v1.5)
                        ↓
                 Vectorize Storage
                        ↓
              Semantic Search on Query
                        ↓
                  AI Response
```

## Step 1: Create Infrastructure

Run the setup script:

```bash
./setup-rag.sh
```

Or manually:

```bash
# Create R2 bucket for document storage
npx wrangler r2 bucket create knowledge-base-docs

# Create Vectorize index for embeddings
npx wrangler vectorize create knowledge-base-index \
  --dimensions=768 \
  --metric=cosine \
  --description="Knowledge base semantic search"
```

## Step 2: Upload Documents

### Option A: Via Wrangler CLI

```bash
# Upload a single file
npx wrangler r2 object put knowledge-base-docs/policies/vacation.txt --file=./docs/vacation.txt

# Upload multiple files
npx wrangler r2 object put knowledge-base-docs/policies/remote-work.txt --file=./docs/remote-work.txt
npx wrangler r2 object put knowledge-base-docs/policies/benefits.txt --file=./docs/benefits.txt
```

### Option B: Via Dashboard

1. Go to https://dash.cloudflare.com
2. **R2** → **knowledge-base-docs**
3. Click **Upload**
4. Select your documents (PDF, TXT, MD)

## Step 3: Process Documents & Create Embeddings

Create a processing script (`src/worker/process-docs.ts`):

```typescript
// This runs as a separate worker or script
export async function processDocuments(env: Env) {
  // 1. List all documents in R2
  const list = await env.DOCUMENTS.list();

  for (const object of list.objects) {
    // 2. Get document content
    const file = await env.DOCUMENTS.get(object.key);
    const text = await file.text();

    // 3. Split into chunks (every 500 chars)
    const chunks = splitIntoChunks(text, 500);

    // 4. Generate embeddings for each chunk
    for (let i = 0; i < chunks.length; i++) {
      const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
        text: chunks[i]
      });

      // 5. Store in Vectorize
      await env.VECTORIZE.upsert([{
        id: `${object.key}-chunk-${i}`,
        values: embedding.data[0],
        metadata: {
          source: object.key,
          text: chunks[i],
          chunkIndex: i
        }
      }]);
    }
  }
}

function splitIntoChunks(text: string, chunkSize: number): string[] {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, i + chunkSize));
  }
  return chunks;
}
```

## Step 4: Update searchKnowledgeBase Function

Replace the hardcoded knowledge base with Vectorize search:

```typescript
async function searchKnowledgeBase({ query }: { query: string }, env: Env): Promise<any> {
  console.log(`Searching knowledge base for: ${query}`);

  // 1. Generate embedding for the query
  const queryEmbedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
    text: query
  });

  // 2. Search Vectorize for similar content
  const results = await env.VECTORIZE.query(queryEmbedding.data[0], {
    topK: 3,  // Get top 3 most relevant chunks
    returnMetadata: true
  });

  if (results.matches.length === 0) {
    return {
      found: false,
      message: "No relevant information found in the knowledge base."
    };
  }

  // 3. Return the relevant chunks
  return {
    found: true,
    results: results.matches.map(match => ({
      source: match.metadata.source,
      content: match.metadata.text,
      score: match.score
    }))
  };
}
```

## Step 5: Deploy

```bash
npm run worker:deploy
```

## Example Documents to Upload

Create these files in a `docs/` folder:

**docs/vacation-policy.txt:**
```
Vacation Policy

Employees receive 20 days of paid time off (PTO) per year, plus 10 sick days.
Vacation requests must be submitted at least 2 weeks in advance through the HR portal.
Unused PTO can be rolled over up to 5 days into the next year.
```

**docs/remote-work-policy.txt:**
```
Remote Work Policy

We support a hybrid work model with a minimum of 2 days per week in the office.
Fully remote work arrangements are available for approved cases with manager approval.
Remote employees must maintain regular working hours and be available for team meetings.
```

**docs/benefits.txt:**
```
Employee Benefits

- Health Insurance: Comprehensive medical, dental, and vision coverage
- 401(k) Matching: Up to 6% employer match
- Gym Membership: $50/month reimbursement
- Education Stipend: $2,000/year for professional development
- Mental Health: Free counseling sessions through EAP
```

## Testing

### Test via cURL:

```bash
curl "https://your-worker.workers.dev?query=What are our vacation days?"
```

### Expected Response:

The AI will now search your uploaded documents and return relevant information!

## Advantages Over Hardcoded Knowledge Base

✅ **Scalable**: Add unlimited documents
✅ **Semantic Search**: Finds relevant info even with different wording
✅ **Easy Updates**: Just upload new documents, no code changes
✅ **Source Attribution**: Know which document the answer came from
✅ **Better Accuracy**: AI searches actual content, not keywords

## Monitoring

View your Vectorize index:

```bash
npx wrangler vectorize get knowledge-base-index
```

List documents in R2:

```bash
npx wrangler r2 object list knowledge-base-docs
```

## Cost

- **R2 Storage**: $0.015/GB/month (very cheap)
- **Vectorize**: Free tier available, then usage-based
- **AI Embeddings**: Included in Workers AI free tier

## Troubleshooting

### Embeddings not working

Make sure you're using the correct model:
```typescript
const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
  text: query
});
```

### No results returned

Check if documents are processed:
```bash
npx wrangler vectorize query knowledge-base-index --vector="[0.1,0.2,...]"
```

### R2 bucket not found

Verify bucket exists:
```bash
npx wrangler r2 bucket list
```

## Next Steps

1. Run `./setup-rag.sh` to create infrastructure
2. Upload your company documents to R2
3. Run the processing script to generate embeddings
4. Deploy and test!

Your knowledge base is now powered by AI semantic search! 🚀