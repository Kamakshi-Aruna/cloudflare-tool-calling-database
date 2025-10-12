#!/bin/bash
# Setup script for AutoRAG with R2 and Vectorize

set -e

echo "🚀 Setting up AutoRAG infrastructure..."
echo ""

# Step 1: Create R2 bucket
echo "Step 1: Creating R2 bucket for documents..."
npx wrangler r2 bucket create knowledge-base-docs
echo "✅ R2 bucket created"
echo ""

# Step 2: Create Vectorize index
echo "Step 2: Creating Vectorize index for embeddings..."
npx wrangler vectorize create knowledge-base-index \
  --dimensions=768 \
  --metric=cosine \
  --description="Knowledge base semantic search"
echo "✅ Vectorize index created"
echo ""

echo "✅ AutoRAG setup complete!"
echo ""
echo "Next steps:"
echo "1. Upload documents: npm run upload-docs"
echo "2. Process documents: npm run process-docs"
echo "3. Deploy: npm run worker:deploy"