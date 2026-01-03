Architecture Documentation
Comprehensive technical architecture guide for the Legal AI Compliance Assistant.

Table of Contents
System Overview

Component Architecture

Service Layer

Data Flow

Storage Architecture

RAG Pipeline

API Integration

Security Architecture

Performance Considerations

Scalability

System Overview
High-Level Architecture Diagram
text
┌─────────────────────────────────────────────────────────────┐
│                    React Application                         │
│                    (Vite + Tailwind CSS)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                   React Components Layer                      │
│  (ProjectList, ProjectEditor, DocumentUpload, QueryUI)       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                    Service Layer (Business Logic)            │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ ProjectManager (Orchestration)                       │    │
│  │ DocumentChunker (Text Processing)                    │    │
│  │ EmbeddingGenerator (Vector Generation - Local)       │    │
│  │ RAGRetriever (Semantic Search)                       │    │
│  │ PerplexityAPI (LLM Integration - Remote)             │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────┬──────────────────┬──────────────────┐
│  Local Storage       │   IndexedDB       │  File System     │
│  (App State)         │   (Cache)         │  (Documents)     │
│  5-10MB              │   50GB+           │  User Computer   │
└──────────────────────┴──────────────────┴──────────────────┘
                              ↓
                      ┌───────────────┐
                      │ Perplexity API│
                      │ (LLM Queries) │
                      └───────────────┘
Key Principles
Privacy-First: All document processing happens locally

Stateless Services: Each service is independent and reusable

Async Operations: Heavy operations use async/await

Error Handling: Comprehensive try-catch with meaningful messages

Type Safety: JSDoc comments for type documentation

Component Architecture
Component Tree
text
App (Root Component)
│
├── ProjectList (View: Project Management)
│   ├── ProjectCard (Reusable: Project Card)
│   │   └── ProjectActions (Delete, Open, etc.)
│   ├── NewProjectButton (Action: Create Project)
│   └── ProjectStats (Display: Aggregated Stats)
│
└── ProjectEditor (View: Main Workspace)
    ├── ProjectHeader (Display: Project Info)
    │   ├── ProjectName (Edit)
    │   └── ProjectMetadata (Created, Modified, Stats)
    │
    ├── SplitView (Layout Container)
    │   │
    │   ├── DocumentUpload (Left Panel)
    │   │   ├── UploadZone (Drag & Drop)
    │   │   ├── FileList (Uploaded Documents)
    │   │   ├── DocumentCard (Individual Document)
    │   │   └── UploadProgress (Real-time Progress)
    │   │
    │   └── QueryInterface (Right Panel)
    │       ├── QueryInput (Text Input Area)
    │       ├── QueryButton (Submit)
    │       ├── LoadingSpinner (Async Feedback)
    │       ├── AnswerDisplay (LLM Response)
    │       │   ├── AnswerText (Main Content)
    │       │   └── SourceCitation (Chunk Count)
    │       └── QueryHistory (Past Questions)
    │           ├── HistoryItem (Individual Query)
    │           └── ClearHistory (Action)
    │
    └── ProjectFooter (Navigation)
        ├── BackButton (Return to Projects)
        └── HelpButton (Contextual Help)
Component Responsibilities
Component	Type	Purpose	State
App	Root	Router, theme, global state	Local state
ProjectList	View	Display projects, create new	Local state
ProjectEditor	View	Main workspace	Local state
DocumentUpload	Section	File management	Local state
QueryInterface	Section	Q&A interface	Local state
LoadingSpinner	UI	Async feedback	Props only
ProjectCard	Card	Single project display	Props only
Component Patterns
Container Component Pattern

jsx
// ProjectEditor is a "smart" component
// It manages state and calls services
function ProjectEditor() {
  const [project, setProject] = useState(null)
  const [documents, setDocuments] = useState([])
  
  const handleUpload = async (files) => {
    // Call service layer
    await projectManager.addDocuments(project.id, files)
  }
  
  return (
    <div>
      <DocumentUpload onUpload={handleUpload} />
      <QueryInterface projectId={project.id} />
    </div>
  )
}
Presentational Component Pattern

jsx
// LoadingSpinner is "dumb" component
// Only receives props, no state or side effects
function LoadingSpinner({ message = "Loading..." }) {
  return (
    <div className="spinner">
      <div className="spinner-ring"></div>
      <p>{message}</p>
    </div>
  )
}
Service Layer
Service Architecture
text
ProjectManager (Orchestrator)
├── Uses: DocumentChunker
├── Uses: EmbeddingGenerator
├── Uses: RAGRetriever
├── Uses: PerplexityAPI
├── Uses: FileSystemAccess
└── Uses: StorageManager (localStorage + IndexedDB)

DocumentChunker (Utility)
├── Splits text into paragraphs
├── Splits paragraphs into sentences
└── Handles overlap

EmbeddingGenerator (Transformer)
├── Loads all-MiniLM-L6-v2 model
├── Generates 768-dimensional vectors
└── Caches model in IndexedDB

RAGRetriever (Search Engine)
├── Extracts keywords from query
├── Scores chunks by relevance
├── Returns top-K results

PerplexityAPI (LLM Interface)
├── Sends question + context
├── Handles API authentication
├── Processes streaming responses

FileSystemAccess (I/O Layer)
├── Reads/writes documents
├── Manages directory permissions
└── Handles persistence

StorageManager (Data Layer)
├── localStorage (small data)
└── IndexedDB (large data)
Service Interactions
Uploading a Document

text
Component
  ↓
ProjectManager.addDocument(projectId, file)
  ├→ FileSystemAccess.saveFile(file)         // Store on disk
  ├→ DocumentChunker.chunkDocument(text)     // Split into pieces
  ├→ EmbeddingGenerator.embed(chunks)        // Create vectors
  ├→ StorageManager.saveChunks(chunks)       // Cache results
  └→ Component receives success
Answering a Query

text
Component (user types question)
  ↓
QueryInterface triggers search
  ├→ RAGRetriever.retrieveChunks(question)
  │   └→ Finds top 15 most relevant chunks
  ├→ PerplexityAPI.queryLLM(question, chunks)
  │   └→ Sends to Perplexity with context
  └→ Component displays answer
Service Responsibilities
Service	Input	Processing	Output
ProjectManager	Actions	Coordinates all services	Results
DocumentChunker	Text	Splits into chunks	Chunk array
EmbeddingGenerator	Chunks	Generates vectors	Vector array
RAGRetriever	Question	Finds similar chunks	Top-K chunks
PerplexityAPI	Question + Context	LLM inference	Answer text
FileSystemAccess	File data	I/O operations	Success/error
StorageManager	Data	Persistence	Stored data
Data Flow
Complete Query-to-Answer Flow
text
User Types Question
      ↓
[React Component]
  - User input captured
  - Loading state set
      ↓
[QueryInterface Component]
  - Validates question (non-empty)
  - Calls ProjectManager.answerQuery()
      ↓
[ProjectManager Service]
  1. Extract keywords from question
      ↓
[RAGRetriever Service]
  2. Load all chunk embeddings
  3. Generate embedding for question
  4. Calculate cosine similarity for each chunk
  5. Rank chunks by similarity
  6. Return top 15 chunks
      ↓
[PerplexityAPI Service]
  7. Format prompt with question + chunks
  8. Call Perplexity API (HTTPS)
  9. Handle response streaming
  10. Return complete answer
      ↓
[ProjectManager Service]
  11. Save query to history (IndexedDB)
  12. Return answer with metadata
      ↓
[React Component]
  - Update UI with answer
  - Display source count
  - Add to history list
  - Loading state cleared
      ↓
User Sees Answer
State Management Flow
Local Component State

jsx
// Only UI-related state
const [queryInput, setQueryInput] = useState("")
const [isLoading, setIsLoading] = useState(false)
const [answer, setAnswer] = useState(null)
const [error, setError] = useState(null)
Service-Managed State

javascript
// Data persisted across sessions
// Stored in localStorage + IndexedDB
const project = {
  id: "proj_123",
  name: "Smith v. ABC Corp",
  documents: ["doc_1", "doc_2"],
  queries: ["query_1", "query_2"],
  createdAt: "2025-12-30T...",
  lastModified: "2025-12-30T..."
}
No Redux/Vuex Needed

Stateless service functions eliminate need for global state management

Each component manages only its UI state

Services handle business logic and persistence

Simpler architecture, easier to test

Storage Architecture
Three-Layer Storage Strategy
Layer 1: Browser Memory (Ephemeral)
javascript
// During active session
let cachedEmbeddings = {} // In-memory cache

// Fast access
embeddings = cachedEmbeddings[chunkId] // O(1)
Layer 2: IndexedDB (Medium-Term)
javascript
// Persists across browser restarts
// 50GB+ capacity
// Used for: embeddings cache, query history

const dbRequest = indexedDB.open('legal-app')
db.createObjectStore('chunks')    // Chunk embeddings
db.createObjectStore('history')   // Query history
Layer 3: File System Access API (Long-Term)
javascript
// Documents stored on user's computer
// User has explicit permission
// Files never uploaded

const dirHandle = await window.showDirectoryPicker()
const fileHandle = await dirHandle.getFileHandle('document.pdf')
Storage Capacity & Use Cases
Storage	Capacity	Persistence	Best For
Memory	Varies	Session only	Real-time processing
localStorage	5-10MB	Per browser	App settings, small state
IndexedDB	50GB+	Per browser	Embeddings cache, history
File System	Unlimited	Permanent	Document storage
Data Schema
IndexedDB - Chunks Store

javascript
{
  id: "chunk_uuid",
  projectId: "proj_123",
  documentId: "doc_456",
  content: "Actual text...",
  embedding: [0.123, 0.456, ...], // 768 values
  metadata: {
    position: 5,           // Position in document
    source: "paragraph 3",
    createdAt: "2025-12-30T12:00:00Z"
  }
}
IndexedDB - Query History Store

javascript
{
  id: "query_uuid",
  projectId: "proj_123",
  question: "What is compliance?",
  answer: "Answer text...",
  sourcesUsed: 3,         // How many chunks
  timestamp: "2025-12-30T12:00:00Z"
}
localStorage - Project Store

javascript
{
  projects: [
    {
      id: "proj_123",
      name: "Smith v. ABC",
      documents: ["doc_1", "doc_2"],
      createdAt: "2025-12-30T12:00:00Z",
      lastModified: "2025-12-30T12:00:00Z"
    }
  ],
  preferences: {
    darkMode: true,
    autoSave: true
  }
}
RAG Pipeline
Retrieval-Augmented Generation Process
text
1. INPUT PROCESSING
   User Question: "What are compliance deadlines?"
          ↓
   Extract Keywords: ["compliance", "deadlines", "requirements"]
   
2. RETRIEVAL PHASE
   Generate Question Embedding
          ↓
   Load All Chunk Embeddings from IndexedDB
          ↓
   Calculate Similarity (Cosine Similarity)
   ┌─────────────────────────────────────┐
   │ For each chunk embedding:            │
   │ similarity = (q·c) / (||q|| * ||c||) │
   │ Range: [-1, 1], typically [0, 1]    │
   └─────────────────────────────────────┘
          ↓
   Rank by Similarity Score
          ↓
   Select Top-K Chunks (K=15)

   Results:
   - Chunk 1: similarity=0.87, content="..."
   - Chunk 2: similarity=0.84, content="..."
   - Chunk 3: similarity=0.79, content="..."
   - Chunk 4: similarity=0.73, content="..."
   - Chunk 5: similarity=0.68, content="..."
   - ... (10 more chunks with decreasing similarity)
   - Chunk 15: similarity=0.52, content="..."

3. AUGMENTATION PHASE
   Combine Question + Context
          ↓
   Create Prompt:
   ┌─────────────────────────────────────┐
   │ System: You are a legal assistant    │
   │         answering based on provided  │
   │         documents. Be factual.       │
   │                                      │
   │ User: [Question]                    │
   │                                      │
   │ Context from documents:              │
   │ - [Chunk 1]                         │
   │ - [Chunk 2]                         │
   │ - [Chunk 3]                         │
   │ - ... (12 more chunks)              │
   │ - [Chunk 15]                        │
   │                                      │
   │ Answer:                              │
   └─────────────────────────────────────┘
   
4. GENERATION PHASE
   Call Perplexity API (sonar-reasoning-pro)
          ↓
   Stream Response
          ↓
   Return to User: "Compliance deadlines include..."
   
5. OUTPUT
   - Answer: AI-generated response
   - Sources: 15 chunks used
   - Confidence: Based on similarity scores
RAG Parameters
Configurable Settings

javascript
const RAG_CONFIG = {
  topK: 15,                          // Number of chunks to retrieve
  minSimilarity: 0.5,                // Minimum relevance threshold
  chunkOverlap: 2,                   // Sentence overlap between chunks
  embeddingDimension: 768,           // Vector size
  similarityMetric: 'cosine'         // Similarity calculation
}
Performance Characteristics

Operation	Time	Space	Notes
Load embeddings	~100ms	50MB	First time per session
Generate embedding	~500ms	1MB	Depends on text length
Calculate similarity	~5-10ms	-	For 1000 chunks
API call	5-30s	-	Network dependent
API Integration
Perplexity API Architecture
Request Flow

text
Component (User asks question)
    ↓
PerplexityAPI Service
    ├→ Check API key exists
    ├→ Build request payload
    ├→ Set HTTPS headers
    ├→ Call API endpoint
    └→ Handle response
Request Format

javascript
POST https://api.perplexity.com/chat/completions

{
  "model": "sonar-reasoning-pro",
  "messages": [
    {
      "role": "system",
      "content": "You are a legal compliance assistant..."
    },
    {
      "role": "user",
      "content": "What are the key compliance requirements?\n\nContext from documents:\n..."
    }
  ],
  "temperature": 0.3,           // Lower = more factual
  "top_p": 0.95,
  "max_tokens": 2000,
  "stream": false               // Or true for streaming
}

Headers: {
  "Authorization": "Bearer pplx_...",
  "Content-Type": "application/json"
}
Response Handling

javascript
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1703089247,
  "model": "sonar-reasoning-pro",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Based on the documents, the key compliance deadlines are..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1234,
    "completion_tokens": 456,
    "total_tokens": 1690
  }
}
Error Handling

javascript
try {
  response = await perplexityAPI.queryLLM(question, chunks)
} catch (err) {
  if (err.status === 401) {
    // Invalid API key
  } else if (err.status === 429) {
    // Rate limited
  } else if (err.status === 500) {
    // Server error
  } else if (err.message === 'Network error') {
    // Connection issue
  }
}
Security Architecture
Data Flow Security
text
Browser (User's Device)
├── LocalStorage (Encrypted by browser)
├── IndexedDB (Sandboxed)
└── File System (User permission required)
        ↓ [HTTPS Encryption]
        ↓
External Services
├── Perplexity API (Zero Data Retention)
└── Transformers.js CDN (Model only, no user data)
Security Layers
Layer 1: Browser Sandbox

localStorage/IndexedDB isolated per origin

File System Access requires explicit user permission

Scripts cannot access files without permission

CORS prevents unauthorized requests

Layer 2: HTTPS Encryption

All communication encrypted in transit

SSL/TLS prevents man-in-the-middle attacks

API keys transmitted securely

Certificates verified before connection

Layer 3: Service-Level Security

API key never logged or exposed

Never hardcoded in source

Loaded from environment variables only

Rotated periodically

Layer 4: Data Minimization

Only relevant chunks sent to API

Never send entire documents

No metadata sent with documents

User data not used for training (ZDR)

Threat Model
Threat	Vector	Mitigation
Network interception	MITM attacks	HTTPS encryption
API key theft	Source code exposure	Environment variables
Document access	Unauthorized users	File System API permissions
Storage leaks	Browser compromise	localStorage encryption by OS
Training on user data	Privacy violation	Perplexity ZDR policy
Malicious extensions	Browser extensions	Content Security Policy
Performance Considerations
Load-Time Performance
Initial Load

text
1. HTML + JS bundles         ~100KB (gzipped)
2. CSS                       ~50KB (gzipped)
3. React + Vite overhead     ~50KB
4. Transformers.js model     ~23MB (one-time, cached)
   ├── Downloaded on first use
   └── Cached in IndexedDB (reused)
5. Total initial load         ~200KB
6. Total with model           ~23MB (first time only)
Optimization Strategies

javascript
// Code splitting
const ProjectList = lazy(() => import('./components/ProjectList'))
const ProjectEditor = lazy(() => import('./components/ProjectEditor'))

// Lazy load embedding model
let embeddingModel = null
async function loadEmbeddingModel() {
  if (!embeddingModel) {
    embeddingModel = await pipeline(...)
  }
  return embeddingModel
}

// Cache model in IndexedDB
await storageManager.saveToIndexedDB('models', {
  name: 'all-MiniLM-L6-v2',
  data: modelData
})
Runtime Performance
Embedding Generation

text
Single document (5 pages, ~2000 words)
├── Chunking:       ~50ms
├── Embedding:      ~500ms per 100 chunks
└── Total:          ~5 seconds

Large document (50 pages, ~20,000 words)
├── Chunking:       ~100ms
├── Embedding:      ~5 seconds for 1000 chunks
└── Total:          ~5-10 seconds
Query Processing

text
User asks question
├── Extract keywords:          ~5ms
├── Load embeddings:           ~100ms (cached)
├── Generate question vector:  ~50ms
├── Calculate similarity:      ~10ms (1000 chunks)
├── Prepare prompt:            ~10ms
├── API call:                  5-30 seconds (network dependent)
└── Total:                     5-30 seconds
Memory Usage

text
Typical usage:
├── React app:      ~20MB
├── Embeddings:     ~50MB (1000 chunks × 768 dimensions)
├── DOM:            ~10MB
└── Misc:           ~20MB
└── Total:          ~100MB

Large projects:
├── 10,000 chunks:  ~500MB
├── 100,000 chunks: ~5GB (exceeds browser limits)
Optimization Priorities
Priority	Optimization	Benefit
1 (High)	Lazy load embedding model	Reduce initial load
2 (High)	Cache embeddings in IndexedDB	Instant retrieval
3 (Medium)	Code splitting	Smaller initial bundle
4 (Medium)	Gzip compression	Faster downloads
5 (Low)	Image optimization	Minimal impact
Scalability
Current Limits
Browser Limitations

text
Storage: 50GB (IndexedDB limit)
Memory: 500MB - 1GB typical
Network: 5-30 second queries typical

Max documents per project:
├── Small projects: 10-50 documents (~500KB each)
├── Medium projects: 50-500 documents
└── Large projects: 500+ documents (requires optimization)
API Limitations

text
Perplexity API:
├── Rate limits: Depends on plan
├── Token limits: 128K context window
├── Model: sonar-reasoning-pro
├── Cost: $0.50-$5 per 1M tokens
Scaling Strategies
Phase 1: Current (No Backend)

javascript
// Works for:
// - Single user
// - Up to 10,000 chunks
// - 5-10 queries per session
Phase 2: Vector Database (Recommended)

javascript
// Integrate Qdrant or Pinecone
// Benefits:
// - Scale to millions of chunks
// - Fast similarity search
// - Server-side vector storage
// - Shared across projects

// Implementation:
import { QdrantClient } from '@qdrant/js-client-rest'
const qdrant = new QdrantClient({
  url: 'https://your-qdrant.example.com'
})
Phase 3: Backend API

javascript
// Add Node.js + Express backend
// Benefits:
// - Team collaboration
// - User authentication
// - Batch processing
// - Advanced analytics
// - Audit logging

// Architecture:
React Frontend <--> Express API <--> Vector DB
                                 <--> PostgreSQL
Phase 4: Distributed System

javascript
// Add queue system (Bull, RabbitMQ)
// Benefits:
// - Process large batches
// - Scale horizontally
// - Async operations
// - Monitoring & logging

// Architecture:
Web Clients <--> API <--> Queue <--> Workers
                       <--> DB
Horizontal vs Vertical Scaling
Vertical (Current)

text
Single browser instance
├── Limitation: Device RAM/storage
└── Solution: Optimize algorithms
Horizontal (Future)

text
Multiple backend instances
├── Load balancer distributes requests
├── Shared vector database
├── Distributed caching (Redis)
└── Horizontal auto-scaling
Deployment Architecture
Development Environment
text
Developer Machine
├── Node.js 18+
├── npm packages
├── Vite dev server (http://localhost:5173)
├── Hot Module Replacement (HMR)
└── Console debugging
Production Environment
text
Vercel (Recommended)
├── Edge network distribution
├── Auto-scaling
├── Environment variables
├── Git-based deployment
├── HTTPS by default
└── Custom domains
CI/CD Pipeline (Future)
text
Git Push
    ↓
GitHub Actions
    ├→ Run tests
    ├→ Lint code
    ├→ Build bundle
    ├→ Generate sourcemaps
    ├→ Upload to Vercel
    └→ Run smoke tests
    ↓
Vercel Deployment
    ├→ Build
    ├→ Optimize
    ├→ Cache
    └→ Deploy to edge
Monitoring & Logging
Client-Side Logging
Development

javascript
console.log('Event:', message)
console.warn('Warning:', issue)
console.error('Error:', error)
Production

javascript
// Send to monitoring service
window.sentry?.captureException(error)
window.analytics?.trackEvent(name, data)
Metrics to Track
text
Performance:
├── Page load time
├── Time to interactive
├── Embedding generation time
├── API response time
└── Query processing time

Errors:
├── API errors
├── Storage errors
├── File system errors
└── Crash reports

Usage:
├── Documents uploaded
├── Queries executed
├── Projects created
└── Active users
Future Architectural Improvements
Near-Term (3-6 months)
 Web Workers for embedding generation (non-blocking UI)

 Batch processing for large document uploads

 Vector database integration (Qdrant/Pinecone)

 Advanced caching strategies

Mid-Term (6-12 months)
 Backend API for team collaboration

 User authentication & authorization

 Advanced analytics dashboard

 Document versioning

Long-Term (12+ months)
 Multi-model support (Claude, GPT-4, etc.)

 Fine-tuned models for legal domain

 Real-time collaboration

 Compliance audit trail

 Integration marketplace

Last Updated: December 31, 2025

Related Documentation:

README.md - Setup and usage

API Reference - Service APIs (future)

Database Schema - Storage schema (future)
