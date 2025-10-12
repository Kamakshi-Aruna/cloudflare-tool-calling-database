/**
 * Document Processing Script for AutoRAG
 *
 * This script processes documents from R2 storage:
 * 1. Lists all documents in R2 bucket
 * 2. Reads each document's content
 * 3. Splits content into chunks
 * 4. Generates embeddings using Cloudflare AI
 * 5. Stores embeddings in Vectorize
 *
 * Run this after uploading new documents to R2
 */

export interface Env {
  AI: any;
  DOCUMENTS: R2Bucket;
  VECTORIZE: VectorizeIndex;
}

/**
 * Split text into chunks of specified size
 */
function splitIntoChunks(text: string, chunkSize: number = 500): string[] {
  const chunks: string[] = [];

  // Clean up the text
  const cleanText = text.replace(/\r\n/g, '\n').trim();

  // Split by paragraphs first for better semantic chunks
  const paragraphs = cleanText.split('\n\n');

  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If adding this paragraph would exceed chunk size, save current chunk
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Process all documents in R2 and create embeddings
 */
export async function processDocuments(env: Env): Promise<{
  processed: number;
  chunks: number;
  errors: string[];
}> {
  console.log('Starting document processing...');

  const stats = {
    processed: 0,
    chunks: 0,
    errors: [] as string[]
  };

  try {
    // 1. List all documents in R2
    console.log('Listing documents in R2...');
    const list = await env.DOCUMENTS.list();
    console.log(`Found ${list.objects.length} documents`);

    if (list.objects.length === 0) {
      console.log('No documents found in R2. Please upload documents first.');
      return stats;
    }

    // 2. Process each document
    for (const object of list.objects) {
      try {
        console.log(`Processing: ${object.key}`);

        // Get document content
        const file = await env.DOCUMENTS.get(object.key);
        if (!file) {
          console.error(`Could not retrieve ${object.key}`);
          stats.errors.push(`Could not retrieve ${object.key}`);
          continue;
        }

        const text = await file.text();
        console.log(`  Size: ${text.length} characters`);

        // Split into chunks
        const chunks = splitIntoChunks(text, 500);
        console.log(`  Created ${chunks.length} chunks`);

        // Process each chunk
        for (let i = 0; i < chunks.length; i++) {
          console.log(`  Processing chunk ${i + 1}/${chunks.length}...`);

          try {
            // Generate embedding
            const embedding = await env.AI.run('@cf/baai/bge-base-en-v1.5', {
              text: chunks[i]
            });

            // Truncate text to fit Vectorize metadata limit (10KB)
            // Store max 1000 characters to stay well under limit
            const truncatedText = chunks[i].length > 1000
              ? chunks[i].substring(0, 1000) + '...'
              : chunks[i];

            // Store in Vectorize
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
            const errorMsg = `Failed to process chunk ${i} of ${object.key}: ${error instanceof Error ? error.message : 'Unknown error'}`;
            console.error(`  ${errorMsg}`);
            stats.errors.push(errorMsg);
          }
        }

        stats.processed++;
        console.log(`✅ Completed: ${object.key}`);

      } catch (error) {
        const errorMsg = `Failed to process ${object.key}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(`❌ ${errorMsg}`);
        stats.errors.push(errorMsg);
      }
    }

    console.log('\n=== Processing Complete ===');
    console.log(`Documents processed: ${stats.processed}/${list.objects.length}`);
    console.log(`Total chunks created: ${stats.chunks}`);
    console.log(`Errors: ${stats.errors.length}`);

    if (stats.errors.length > 0) {
      console.log('\nErrors:');
      stats.errors.forEach(err => console.log(`  - ${err}`));
    }

  } catch (error) {
    console.error('Fatal error during processing:', error);
    stats.errors.push(`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  return stats;
}

/**
 * Endpoint to trigger document processing
 * Add this to your worker to allow processing via HTTP request
 */
export async function handleProcessRequest(env: Env): Promise<Response> {
  try {
    const stats = await processDocuments(env);

    return new Response(JSON.stringify({
      success: stats.errors.length === 0,
      message: 'Document processing complete',
      stats: stats
    }, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, null, 2), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}