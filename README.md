Legal AI Compliance Assistant
A privacy-first, AI-powered legal compliance assistant that helps attorneys and PEO professionals analyze complex documents and answer compliance questions with fact-grounded responses.

Key Innovation: All processing happens locally in your browser. Documents never leave your computer. Zero data retention with Perplexity API.

Table of Contents
Features

Tech Stack

Prerequisites

Installation

Development

Build & Deployment

Usage Guide

File Structure

Architecture

Privacy & Security

Future Improvements

License

Support

Features
Core Functionality
✅ Multi-Project Management - Organize documents by project/case

✅ Smart Document Upload - PDF, DOCX, TXT support with automatic chunking

✅ Hybrid Chunking Strategy - Paragraph + sentence-level with overlap for context preservation

✅ Local Embeddings - 768-dimensional vectors generated in-browser (all-MiniLM-L6-v2 model)

✅ RAG Retrieval - Intelligent keyword-based retrieval with top-K ranking

✅ Perplexity Integration - Advanced reasoning with zero-data retention

✅ Query History - Track and revisit previous questions and answers

✅ Source Attribution - See which document chunks informed each answer

Privacy & Security
✅ Local-First Architecture - Documents stored only on user's computer

✅ File System Access API - Persistent storage with user permission

✅ In-Browser Processing - No document content sent to external servers

✅ Zero Data Retention - Perplexity API uses ZDR policy

✅ HTTPS Only - Secure communication for all API calls

✅ No Backend Server - Eliminates server-side vulnerabilities

User Experience
✅ Responsive Design - Works on desktop, tablet, mobile

✅ Dark Mode - Easy on the eyes for extended use

✅ Real-Time Feedback - Progress indicators for uploads and processing

✅ Error Handling - Graceful error messages and recovery options

✅ Performance Optimized - Fast embedding generation and retrieval

Tech Stack
Frontend
React 18 - UI library with hooks

Vite - Lightning-fast build tool

Tailwind CSS - Utility-first styling system

ES6+ JavaScript - Modern JavaScript features

AI & ML
Transformers.js - Browser-based embeddings (Xenova/all-MiniLM-L6-v2)

Perplexity API - LLM with advanced reasoning (sonar-reasoning-pro)

RAG Pipeline - Retrieval-augmented generation for grounded answers

Storage & APIs
File System Access API - Local file storage with user permission

localStorage - Small app state (5-10MB)

IndexedDB - Large data storage (50GB+)

Perplexity REST API - LLM queries with context

Development Tools
Node.js 18+ - JavaScript runtime

npm 9+ - Package manager

ESLint - Code quality

Environment Variables - Configuration management

Prerequisites
System Requirements
Node.js: 18.0 or higher (download)

npm: 9.0 or higher (included with Node.js)

Browser: Chrome 86+, Edge 86+, Firefox 111+, or Safari 16.4+

RAM: 4GB minimum (8GB recommended for processing large documents)

Disk Space: 500MB minimum

Accounts & Keys
Perplexity API Key (get one here)

Free tier: Limited queries for testing

Paid tier: $0.50-$5 per 1M tokens depending on model

GitHub Account (optional, for deployment to Vercel)

Browser Permissions Required
File System Access (to store documents locally)

localStorage (for app state)

IndexedDB (for caching)

Network access (for Perplexity API calls)

Installation
Step 1: Clone Repository
bash
git clone https://github.com/yourusername/legal-ai-compliance.git
cd legal-ai-compliance
Step 2: Install Dependencies
bash
npm install
This installs all required packages:

React and React DOM

Vite build tool

Tailwind CSS

Transformers.js (for embeddings)

Development tools

Step 3: Configure Supabase Edge Function
The application uses a Supabase Edge Function to proxy all Perplexity API calls, ensuring your API key is NEVER exposed to the browser.

1. Visit your [Supabase Dashboard](https://supabase.com/dashboard/project/hlfeookqxwvrygiyvsxj)
2. Navigate to **Settings** → **Edge Functions** → **Secrets**
3. Add a new secret:
   - Name: `PERPLEXITY_API_KEY`
   - Value: Your Perplexity API key (get one from [Perplexity API Dashboard](https://www.perplexity.ai/settings/api))
4. Click **Save**

The edge function is already deployed and will automatically use this secret.

Step 4: Verify Installation
bash
npm run build
If successful, you'll see dist/ folder created with optimized build files.

Development
Start Development Server
bash
npm run dev
This starts the Vite development server with hot module replacement (HMR).

Access the Application
text
Open: http://localhost:5173
Vite runs on port 5173 by default. If it's in use, it will automatically use the next available port.

Development Workflow
Edit files in src/ directory

Changes auto-refresh in browser (HMR)

Open DevTools (F12) to see console logs

Check console for any warnings or errors

Test features - upload documents, ask questions, etc.

Debugging
javascript
// Check component rendering
console.log('Component state:', state)

// Check API calls
// Open Network tab in DevTools
// Look for POST requests to your Supabase edge function

// Check localStorage
console.log(localStorage.getItem('key'))

// Check embeddings
// Open IndexedDB in DevTools > Application > IndexedDB

Environment Variables in Development
The application uses Vite environment variables (prefixed with VITE_):
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

IMPORTANT: The Perplexity API key is NEVER exposed to the browser. It exists only as a server-side secret in Supabase.
Build & Deployment
Production Build
bash
npm run build
Creates optimized production build in dist/ folder:

Minified JavaScript

Optimized CSS

Source maps for debugging

~500KB total size (gzipped)

Local Preview
bash
npm run preview
Previews production build locally before deploying.

Deployment
Option 1: Deploy to Vercel (Recommended)
Step 1: Push to GitHub
bash
git push origin main
Step 2: Connect to Vercel
Visit vercel.com

Sign in with GitHub

Click "Add New..." → "Project"

Select your repository

Click "Import"

Step 3: Configure Environment Variables (Optional)
If you need custom Supabase configuration, add these in Vercel:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key

IMPORTANT: The Perplexity API key should ONLY be configured in Supabase (not Vercel). See Step 3 in the installation section above.

Step 4: Deploy
Vercel auto-deploys on git push

Or manually trigger in Vercel dashboard

Your app is live at your-project.vercel.app

Step 5: Custom Domain (Optional)
In Vercel Settings → Domains

Add your custom domain

Update domain registrar DNS:

Add CNAME record pointing to cname.vercel.app

Or use Vercel's nameservers

Option 2: Deploy to Other Platforms
Netlify
bash
# Install Netlify CLI
npm install -g netlify-cli

# Build and deploy
netlify deploy --prod
GitHub Pages
bash
# Add to package.json
"homepage": "https://yourusername.github.io/legal-ai-compliance"

# Deploy
npm run build
npm install -g gh-pages
gh-pages -d dist
Traditional Hosting (AWS, DigitalOcean, etc.)
bash
# Build the project
npm run build

# Upload dist/ folder to your hosting provider
# Configure server to serve index.html for all routes (SPA routing)
Environment Variables in Production
Do NOT commit .env.local to repository

Use platform-specific environment variable configuration:

Vercel: Deployment Settings

Netlify: Site Settings → Build & Deploy → Environment

GitHub: Settings → Secrets and variables

Usage Guide
For Attorneys and Legal Professionals
1. Initial Setup (First Time)
Open the application

When prompted, grant storage permission

Select a folder on your computer to store projects

This is where all your case documents will be safely stored

2. Create a New Project
Click "New Project" button

Enter project name (e.g., "Smith v. ABC Corp" or "EEOC Investigation #2024-001")

Click "Create"

Project is created and ready for documents

3. Upload Documents
Click "Upload Documents" in the project workspace

Drag and drop files OR click to browse:

PDF documents

Word documents (.docx)

Text files (.txt)

Files are automatically:

Chunked into semantic pieces

Embedded with vector representations

Stored locally on your computer

Never sent to any external server

4. Ask Questions
Type your question in the "Ask About [Project]" box

Examples of good questions:

"What are the key compliance deadlines mentioned in this policy?"

"List all employee classification requirements"

"What does the document say about non-compete agreements?"

Click "Ask AI" or press Ctrl+Enter

Wait for analysis (usually 5-30 seconds)

Review the answer with source citations

5. Understand the Results
Answer: AI-generated response based on document analysis

Sources Used: Number of document chunks used to generate answer

Query History: View all previous questions in this session

Clear History: Remove query history when done

6. Best Practices
Specific Questions: "What compliance training is required?" works better than "Tell me about compliance"

Legal Terminology: Use proper legal terms (e.g., "indemnification" vs "protecting from loss")

Multiple Questions: Ask follow-up questions to get more details

Cross-Reference: Ask about specific clauses or sections by name

Fact-Check: Compare AI answers against original documents

File Structure
text
legal-ai-compliance/
├── src/
│   ├── App.jsx                 # Root component
│   ├── App.css                 # Global styles
│   ├── index.jsx               # Entry point
│   │
│   ├── components/             # React components
│   │   ├── ProjectList.jsx     # List projects
│   │   ├── ProjectEditor.jsx   # Main workspace
│   │   ├── DocumentUpload.jsx  # Upload UI
│   │   ├── QueryInterface.jsx  # Question/answer UI
│   │   └── LoadingSpinner.jsx  # Loading indicator
│   │
│   ├── services/               # Business logic
│   │   ├── projectManager.js   # Project orchestration
│   │   ├── documentChunker.js  # Text processing
│   │   ├── embeddingGenerator.js # Vector embeddings
│   │   ├── ragRetriever.js     # RAG retrieval
│   │   ├── perplexityAPI.js    # LLM integration
│   │   ├── fileSystemAccess.js # File operations
│   │   └── localStorage.js     # Data persistence
│   │
│   ├── utils/                  # Utility functions
│   │   ├── cosineSimilarity.js # Vector math
│   │   └── formatDate.js       # Date formatting
│   │
│   ├── styles/                 # Tailwind CSS config
│   │   └── globals.css         # Global styles
│   │
│   └── index.html              # HTML template
│
├── public/                     # Static assets
├── dist/                       # Build output (generated)
├── .env.local                  # Environment variables (local)
├── .env.example                # Template for .env
├── .gitignore                  # Git ignore rules
├── package.json                # Dependencies
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind CSS config
├── postcss.config.js           # PostCSS config
└── README.md                   # This file
Architecture
Component Hierarchy
text
App (Root)
├── ProjectList
│   ├── ProjectCard (multiple)
│   └── NewProjectButton
└── ProjectEditor (when project selected)
    ├── ProjectHeader
    ├── ProjectMetadata (stats)
    └── Split View
        ├── DocumentUpload
        │   └── FileDropZone
        └── QueryInterface
            ├── QueryInput
            ├── AnswerDisplay
            └── QueryHistory
Data Flow
text
User Input
    ↓
Components (React UI)
    ↓
Services (Business Logic)
    ├── ProjectManager (orchestration)
    ├── DocumentChunker (text processing)
    ├── EmbeddingGenerator (vectors)
    ├── RAGRetriever (search)
    └── PerplexityAPI (LLM)
    ↓
Storage
├── FileSystemAccess (documents)
├── localStorage (app state)
└── IndexedDB (cache)
RAG Pipeline (Question Answering)
text
User Question
    ↓
[RAGRetriever] Extract Keywords
    ↓ (Score document chunks by relevance)
[Top K Chunks] (Usually 5 most relevant)
    ↓
[PerplexityAPI] Send Question + Context
    ↓ (sonar-reasoning-pro model)
[AI Answer] Fact-grounded in documents
    ↓
Display to User with Source Count
Service Interactions
text
ProjectManager (coordinator)
├── Uses DocumentChunker → chunks text
├── Uses EmbeddingGenerator → vectors
├── Uses RAGRetriever → finds relevant chunks
└── Uses PerplexityAPI → generates answers

FileSystemAccess (storage layer)
├── Used by ProjectManager → read/write chunks
└── Provides persistent storage across sessions

localStorage & IndexedDB (caching)
├── Used by all services → fast retrieval
└── Reduces re-processing
Privacy & Security
How Your Data Stays Private
1. Documents Never Leave Your Computer
File System Access API stores all documents locally

Documents are never uploaded to any server

Only you can access your files (browser-enforced)

Persists across browser sessions with your permission

2. Local Embedding Generation
all-MiniLM-L6-v2 Model runs 100% in your browser

Generates 768-dimensional vectors locally

~23MB model downloaded once, then cached in IndexedDB

No embedding data sent to external services

Model is open-source and audit-able

3. Minimal Data Sent to API
Only the most relevant document chunks sent to Perplexity

Not the entire document

Typical: 2-5KB of text per query

No metadata about your documents

No document filenames or structure sent

4. Perplexity Zero Data Retention
Perplexity's ZDR Policy: queries not used for training

Request data deleted after processing

No long-term storage of your questions

Industry-standard enterprise security

5. HTTPS Encryption
All communication encrypted in transit

Man-in-the-middle attacks prevented

API keys transmitted securely

Security Best Practices
For You (Users)
text
✓ DO:
  - Use HTTPS only (http://yourapp.com redirects to https://)
  - Keep browser updated
  - Use strong passwords for file access
  - Run on trusted networks
  - Review AI answers against source documents

✗ DON'T:
  - Share your Perplexity API key
  - Use public WiFi without VPN
  - Upload sensitive client info without redacting
  - Trust AI answers without fact-checking
  - Store API key in code repository
For Developers
text
✓ DO:
  - Never commit .env.local to git
  - Use .env.example as template
  - Rotate API keys regularly
  - Keep dependencies updated (npm audit)
  - Use environment variables for all secrets

✗ DON'T:
  - Log API keys or sensitive data
  - Hardcode secrets in source code
  - Send documents to untrusted APIs
  - Trust user input without validation
  - Use old/deprecated APIs
Compliance Considerations
HIPAA (Healthcare)
If handling health information, ensure:

Business Associate Agreement with Perplexity

Patient data redaction before processing

Encrypted storage at rest

Audit logs for access

GDPR (European Union)
If processing EU resident data:

User consent before processing

Right to deletion (clear localStorage + IndexedDB)

Data processing addendum with Perplexity

Privacy policy documentation

State Bar Ethics
Verify with your state bar:

AI-assisted legal analysis rules

Confidentiality requirements

Duty to disclose AI use to clients

Malpractice insurance coverage

Future Improvements
Phase 2: Enhanced Retrieval
 Embedding-based similarity (improve keyword matching)

 Multi-vector hybrid search (semantic + keyword)

 Query expansion for related terms

 Semantic document clustering

 Citation extraction and linking

Phase 3: Advanced Features
 Team collaboration (secure document sharing)

 Multi-language support

 Citation generation (Bluebook/APA format)

 Document comparison (diff two documents)

 Contract analysis (template detection)

 Compliance checklist generation

Phase 4: Performance & Scale
 Web Worker for embeddings (non-blocking)

 Batch processing for large documents

 Vector database integration (Qdrant, Pinecone)

 Caching layer optimization

 Progressive document loading

 Streaming responses from API

Phase 5: Integration
 Notion integration (save answers to workspace)

 Slack bot for queries

 Google Drive sync

 Salesforce CRM integration

 LawLion/Lexis integration

Phase 6: Analytics & Insights
 Query analytics (common questions)

 Document health score

 Compliance gap identification

 AI improvement feedback loop

 Usage statistics and reports

License
This project is licensed under the MIT License - see LICENSE file for details.

You are free to:

✅ Use commercially

✅ Modify source code

✅ Distribute

✅ Private use

With conditions:

Include license and copyright notice

Provide source code changes

Support
Getting Help
Documentation
This README - Full setup and usage guide

Code Comments - Every function documented with JSDoc

Issues - GitHub Issues for bug reports

Discussions - GitHub Discussions for questions

Troubleshooting
Problem: "File System Access API not supported"

Solution: Use Chrome, Edge, or Firefox 111+

Safari needs 16.4+

Problem: Perplexity API returns 401 error

Check API key in .env.local

Verify key is active in Perplexity dashboard

No typos in key

Problem: Embeddings are slow on first use

Normal: Model downloads on first use (~23MB)

Subsequent use is fast (cached)

Network dependent (typically 30-60 seconds)

Problem: "localStorage quota exceeded"

Clear browser cache and cookies

Or use IndexedDB for larger datasets

Problem: Documents not appearing after upload

Check browser console for errors (F12)

Verify file format is PDF, DOCX, or TXT

Try smaller file first (test file)

Contact & Community
Report Bugs: GitHub Issues

Ask Questions: GitHub Discussions

Professional Support: Email support

Development Support
React Docs: react.dev

Vite Docs: vitejs.dev

Tailwind CSS: tailwindcss.com

Transformers.js: xenova/transformers.js

Perplexity API: docs.perplexity.ai

Contributing
Contributions welcome! Please:

Fork the repository

Create feature branch (git checkout -b feature/AmazingFeature)

Commit changes (git commit -m 'Add AmazingFeature')

Push to branch (git push origin feature/AmazingFeature)

Open Pull Request

Code Standards
Follow ESLint rules

Add comments to complex functions

Test changes locally before PR

Update README if needed

Include issue reference in PR description

Changelog
v1.0.0 (Initial Release)
Core project management

Document upload and chunking

Local embeddings with Transformers.js

RAG retrieval with keyword matching

Perplexity API integration

Query history

Responsive UI

Acknowledgments
Built with:

React - UI library

Vite - Build tool

Transformers.js - Embeddings

Perplexity API - LLM

Tailwind CSS - Styling

Last Updated: December 31, 2025

For the latest version, visit: GitHub Repository
