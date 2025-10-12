# Project Flowchart - Visual Flow Diagrams

## 🔄 Main Application Flow

```mermaid
flowchart TD
    Start([User Opens UI]) --> Input[User Types Query:<br/>'What is Java?']
    Input --> Submit[Click 'Ask AI' Button]
    Submit --> HTTP[HTTP GET Request to Worker]
    HTTP --> Worker{Cloudflare Worker<br/>Receives Request}

    Worker --> Parse[Parse Query Parameter]
    Parse --> AICall[Call runWithTools with:<br/>- User Query<br/>- Available Tools]

    AICall --> AIAnalyze{AI Analyzes Query<br/>Llama 3.1 8B}
    AIAnalyze --> Decision{What type<br/>of query?}

    Decision -->|Document Question| ToolA[Call searchKnowledgeBase]
    Decision -->|User Question| ToolB[Call getActiveUsers]

    ToolA --> Embedding[Generate Query Embedding]
    Embedding --> Vectorize[Search Vectorize Index<br/>Top 3 Similar Chunks]
    Vectorize --> Results1[Return Document Chunks]

    ToolB --> SQL[Execute SQL Query<br/>on D1 Database]
    SQL --> Results2[Return User Data]

    Results1 --> BackToAI[Send Results Back to AI]
    Results2 --> BackToAI

    BackToAI --> Synthesize[AI Synthesizes<br/>Natural Language Response]
    Synthesize --> Response[Return JSON Response]
    Response --> Display[Display in UI]
    Display --> End([User Sees Answer])

    style Start fill:#e1f5e1
    style End fill:#e1f5e1
    style Worker fill:#fff4e6
    style AIAnalyze fill:#e3f2fd
    style ToolA fill:#f3e5f5
    style ToolB fill:#f3e5f5
    style Display fill:#e8f5e9
```

## 📊 Document Processing Flow

```mermaid
flowchart TD
    Upload([User Uploads Document<br/>to R2 via Dashboard]) --> Trigger[User Triggers:<br/>curl /process-docs]

    Trigger --> List[List All Objects<br/>in R2 Bucket]
    List --> Loop{For Each<br/>Document}

    Loop --> Read[Read Document Content<br/>from R2]
    Read --> Split[Split into 500-char Chunks]
    Split --> ChunkLoop{For Each<br/>Chunk}

    ChunkLoop --> GenEmbed[Generate Embedding<br/>using AI Model<br/>@cf/baai/bge-base-en-v1.5]
    GenEmbed --> Truncate[Truncate Text to 1000 chars<br/>to fit Vectorize limit]
    Truncate --> Store[Store in Vectorize:<br/>- ID: filename-chunk-N<br/>- Values: [768 dimensions]<br/>- Metadata: source, text, index]

    Store --> NextChunk{More Chunks?}
    NextChunk -->|Yes| ChunkLoop
    NextChunk -->|No| NextDoc{More Docs?}

    NextDoc -->|Yes| Loop
    NextDoc -->|No| Stats[Return Processing Stats]
    Stats --> Done([Documents Ready<br/>for Search])

    style Upload fill:#e1f5e1
    style Done fill:#e1f5e1
    style GenEmbed fill:#e3f2fd
    style Store fill:#f3e5f5
```

## 🔍 Search Knowledge Base Flow

```mermaid
flowchart TD
    Start([searchKnowledgeBase<br/>Called]) --> Check{Vectorize<br/>Configured?}

    Check -->|No| Error1[Return:<br/>Knowledge base not configured]
    Check -->|Yes| Embed[Generate Query Embedding<br/>AI Model: @cf/baai/bge-base-en-v1.5]

    Embed --> VectorSearch[Query Vectorize Index<br/>Parameters:<br/>- topK: 3<br/>- returnMetadata: true]

    VectorSearch --> HasResults{Results<br/>Found?}

    HasResults -->|No| Error2[Return:<br/>No relevant information found]
    HasResults -->|Yes| Map[Map Results:<br/>- Extract source<br/>- Extract content<br/>- Include score<br/>- Include chunkIndex]

    Map --> Return[Return:<br/>found: true<br/>results: Array of 3 chunks]
    Return --> End([Results Sent to AI])

    style Start fill:#e1f5e1
    style End fill:#e1f5e1
    style Embed fill:#e3f2fd
    style VectorSearch fill:#f3e5f5
    style Error1 fill:#ffebee
    style Error2 fill:#ffebee
```

## 👥 Get Active Users Flow

```mermaid
flowchart TD
    Start([getActiveUsers<br/>Called with params]) --> Check{Database<br/>Configured?}

    Check -->|No| Error[Throw Error:<br/>Database not configured]
    Check -->|Yes| BuildQuery[Build SQL Query:<br/>SELECT * FROM users<br/>WHERE status = 'active']

    BuildQuery --> HasDept{Department<br/>Parameter?}
    HasDept -->|Yes| AddDept[Add to Query:<br/>AND department = ?]
    HasDept -->|No| AddLimit[Add to Query:<br/>ORDER BY lastSeen DESC<br/>LIMIT ?]

    AddDept --> AddLimit
    AddLimit --> Execute[Execute D1 Query<br/>with Bound Parameters]

    Execute --> Format[Format Response:<br/>source: database<br/>count: N<br/>users: Array]

    Format --> Return[Return User Data]
    Return --> End([Results Sent to AI])

    style Start fill:#e1f5e1
    style End fill:#e1f5e1
    style Execute fill:#e3f2fd
    style Format fill:#f3e5f5
    style Error fill:#ffebee
```

## 🔁 Tool Calling Loop (runWithTools)

```mermaid
flowchart TD
    Start([runWithTools Called]) --> Init[Initialize:<br/>- iteration = 0<br/>- maxIterations = 5<br/>- conversationHistory = messages]

    Init --> Loop{iteration <<br/>maxIterations?}

    Loop -->|No| MaxReached[Return lastResponse<br/>or 'Max iterations reached']
    Loop -->|Yes| CallAI[Call AI Model with:<br/>- conversationHistory<br/>- toolDefinitions]

    CallAI --> CheckTools{AI Returned<br/>tool_calls?}

    CheckTools -->|No| FinalResponse[AI Provided Final Answer]
    FinalResponse --> Return[Return AI Response]

    CheckTools -->|Yes| ExecuteTools[For Each tool_call:<br/>1. Find tool by name<br/>2. Execute tool.function<br/>3. Get result]

    ExecuteTools --> AddToHistory[Add to conversationHistory:<br/>role: 'tool'<br/>content: JSON result]

    AddToHistory --> Increment[iteration++]
    Increment --> StoreResponse[Store lastResponse<br/>as fallback]
    StoreResponse --> Loop

    Return --> End([Response Returned])
    MaxReached --> End

    style Start fill:#e1f5e1
    style End fill:#e1f5e1
    style CallAI fill:#e3f2fd
    style ExecuteTools fill:#f3e5f5
```

## 🌐 Complete End-to-End Flow

```mermaid
flowchart TB
    subgraph Client["🖥️ Client Side (Next.js)"]
        UI[User Interface]
        Input[Query Input Field]
        Button[Ask AI Button]
        Display[Response Display]
    end

    subgraph Edge["⚡ Cloudflare Edge"]
        Worker[Worker Entry Point]
        Router{Route Handler}
        ProcessDocs[/process-docs endpoint]
        QueryHandler[Query Handler]
    end

    subgraph AI["🤖 AI Layer"]
        Llama[Llama 3.1 8B Model]
        ToolCalling[Tool Calling Logic]
        Embedding[Embedding Model<br/>bge-base-en-v1.5]
    end

    subgraph Tools["🔧 Tools"]
        SearchKB[searchKnowledgeBase]
        GetUsers[getActiveUsers]
    end

    subgraph Storage["💾 Storage Layer"]
        R2[(R2 Bucket<br/>Documents)]
        Vectorize[(Vectorize Index<br/>Embeddings)]
        D1[(D1 Database<br/>Users)]
    end

    UI --> Input
    Input --> Button
    Button -->|HTTP GET/POST| Worker

    Worker --> Router
    Router -->|/process-docs| ProcessDocs
    Router -->|query param| QueryHandler

    ProcessDocs --> R2
    ProcessDocs --> Embedding
    Embedding --> Vectorize

    QueryHandler --> Llama
    Llama --> ToolCalling

    ToolCalling --> SearchKB
    ToolCalling --> GetUsers

    SearchKB --> Embedding
    Embedding --> Vectorize
    Vectorize --> SearchKB

    GetUsers --> D1
    D1 --> GetUsers

    SearchKB --> Llama
    GetUsers --> Llama

    Llama -->|Final Response| Worker
    Worker -->|JSON| Display

    style Client fill:#e3f2fd
    style Edge fill:#fff4e6
    style AI fill:#f3e5f5
    style Tools fill:#e8f5e9
    style Storage fill:#fce4ec
```

## 🎯 Decision Tree: Which Tool Gets Called?

```mermaid
flowchart TD
    Query[User Query Received] --> AI{AI Analyzes Query}

    AI --> Q1{Contains keywords:<br/>users, team,<br/>employees, people?}

    Q1 -->|Yes| CallUsers[✅ Call getActiveUsers]
    Q1 -->|No| Q2{Contains keywords:<br/>what, how, explain,<br/>document, policy?}

    Q2 -->|Yes| CallKB[✅ Call searchKnowledgeBase]
    Q2 -->|No| Q3{Ambiguous Query}

    Q3 --> AIDecision[AI Makes Best Guess<br/>Based on Context]
    AIDecision --> Result[Tool is Called]

    CallUsers --> Result
    CallKB --> Result

    style Query fill:#e1f5e1
    style CallUsers fill:#c8e6c9
    style CallKB fill:#c8e6c9
    style Result fill:#fff4e6
```

## 📈 Data Flow: Document to Answer

```mermaid
flowchart LR
    subgraph Upload["1️⃣ Upload"]
        PDF[PDF/TXT File]
    end

    subgraph Process["2️⃣ Process"]
        Read[Read Content]
        Chunk[Split into Chunks]
        Embed[Generate Embeddings]
    end

    subgraph Store["3️⃣ Store"]
        VectorDB[(Vectorize<br/>768-dim vectors)]
    end

    subgraph Query["4️⃣ Query"]
        UserQ[User Question]
        QEmbed[Query Embedding]
        Search[Similarity Search]
    end

    subgraph Respond["5️⃣ Respond"]
        Chunks[Top 3 Chunks]
        AI[AI Synthesis]
        Answer[Natural Language Answer]
    end

    PDF --> Read
    Read --> Chunk
    Chunk --> Embed
    Embed --> VectorDB

    UserQ --> QEmbed
    QEmbed --> Search
    Search --> VectorDB
    VectorDB --> Chunks
    Chunks --> AI
    AI --> Answer

    style Upload fill:#e3f2fd
    style Process fill:#f3e5f5
    style Store fill:#fff4e6
    style Query fill:#e8f5e9
    style Respond fill:#fce4ec
```

## 🔄 Request/Response Cycle

```mermaid
sequenceDiagram
    participant User
    participant UI as Next.js UI
    participant Worker as Cloudflare Worker
    participant AI as Workers AI
    participant Vectorize
    participant D1

    User->>UI: Types "What is Java?"
    UI->>Worker: GET /?query=What+is+Java

    Worker->>AI: runWithTools(query, tools)
    AI->>AI: Analyze query
    AI-->>Worker: tool_call: searchKnowledgeBase

    Worker->>AI: Generate embedding
    AI-->>Worker: [0.123, 0.456, ...]

    Worker->>Vectorize: query(embedding, topK: 3)
    Vectorize-->>Worker: 3 document chunks

    Worker->>AI: Here are the results
    AI-->>Worker: "Java is a programming language..."

    Worker->>UI: JSON response
    UI->>User: Display answer

    Note over User,D1: Alternative flow for user queries

    User->>UI: "Show me Engineering team"
    UI->>Worker: GET /?query=Show+Engineering
    Worker->>AI: runWithTools(query, tools)
    AI-->>Worker: tool_call: getActiveUsers

    Worker->>D1: SELECT * FROM users WHERE department='Engineering'
    D1-->>Worker: User records

    Worker->>AI: Here are the users
    AI-->>Worker: "The Engineering team has..."
    Worker->>UI: JSON response
    UI->>User: Display answer
```

## 📍 System Architecture Diagram

```mermaid
graph TB
    subgraph Internet["🌐 Internet"]
        Users[Users/Browsers]
    end

    subgraph CloudflareEdge["⚡ Cloudflare Global Edge Network"]
        Worker[Workers<br/>index.ts]
        AI[Workers AI<br/>Llama 3.1 8B]
    end

    subgraph CloudflareData["💾 Cloudflare Data Services"]
        R2[R2 Storage<br/>knowledge-base-docs]
        Vec[Vectorize<br/>knowledge-base-index]
        D1DB[D1 Database<br/>tool-database]
    end

    subgraph NextJS["🎨 Vercel (Optional)"]
        UI[Next.js UI<br/>page.tsx]
    end

    Users <-->|HTTPS| Worker
    Users <-->|HTTPS| UI
    UI <-->|API Calls| Worker

    Worker <--> AI
    Worker <--> R2
    Worker <--> Vec
    Worker <--> D1DB

    AI <--> Vec

    style Internet fill:#e3f2fd
    style CloudflareEdge fill:#fff4e6
    style CloudflareData fill:#f3e5f5
    style NextJS fill:#e8f5e9
```

---

## 📝 How to View These Flowcharts

These flowcharts use **Mermaid** syntax. To view them:

1. **GitHub**: Upload this file - GitHub automatically renders Mermaid
2. **VS Code**: Install "Markdown Preview Mermaid Support" extension
3. **Online**: Copy to https://mermaid.live/
4. **Documentation Sites**: Supports Mermaid natively (GitBook, Docusaurus, etc.)

## 🎨 Legend

- 🟢 **Green nodes**: Start/End points
- 🟡 **Yellow nodes**: Processing/Logic
- 🔵 **Blue nodes**: AI operations
- 🟣 **Purple nodes**: Tool execution
- 🔴 **Red nodes**: Errors
- 💾 **Database symbols**: Data storage