import DocumentChunker from './documentChunker'
import TokenChunker from './tokenChunker'
import EmbeddingGenerator from './embeddingGenerator'
import RAGRetriever from './ragRetriever'
import PerplexityAPI from './perplexityAPI'
import PDFExtractor from './pdfExtractor'
import KeywordExtractor from './keywordExtractor'
import KeywordSearcher from './keywordSearcher'
import WorkerManager from './workerManager'

/**
 * ProjectManager - Core orchestrator for all project operations
 * Manages file system operations, document processing, and AI queries
 */
export default class ProjectManager {
  constructor(rootDirHandle) {
    // Root directory handle from File System Access API
    this.rootDirHandle = rootDirHandle

    // Current project state
    this.currentProjectDir = null
    this.currentProjectName = null

    // Service instances
    this.paragraphChunker = new DocumentChunker()
    this.tokenChunker = new TokenChunker({
      targetTokens: 1000,
      maxTokens: 1200,
      minTokens: 600,
      overlapTokens: 300
    })
    this.embeddingGenerator = new EmbeddingGenerator()
    this.ragRetriever = new RAGRetriever()
    this.perplexityAPI = new PerplexityAPI()
    this.pdfExtractor = new PDFExtractor()
    this.keywordExtractor = new KeywordExtractor({
      useLocalModel: true,
      progressCallback: null
    })
    this.keywordSearcher = new KeywordSearcher()
    this.workerManager = new WorkerManager()

    // Cancellation tracking
    this.currentUploadCancelled = { value: false }
  }

  /**
   * Create a new project directory and metadata file
   * @param {string} projectName - Name of the project
   * @returns {Promise<string>} - Success message
   */
  async createProject(projectName) {
    try {
      if (!projectName || projectName.trim().length === 0) {
        throw new Error('Project name cannot be empty')
      }

      // Sanitize project name (remove special chars)
      const sanitizedName = projectName.trim().replace(/[^\w\s-]/g, '')
      if (sanitizedName.length === 0) {
        throw new Error('Project name must contain valid characters')
      }

      // Create project directory
      const projectDir = await this.rootDirHandle.getDirectoryHandle(
        sanitizedName,
        { create: true }
      )

      // Create metadata.json
      const metadata = {
        projectName: projectName.trim(),
        createdAt: new Date().toISOString(),
        files: [],
        lastQueried: null,
        totalChunks: 0
      }

      await this._writeFile(projectDir, 'metadata.json', JSON.stringify(metadata, null, 2))

      // Automatically select the newly created project
      this.currentProjectDir = projectDir
      this.currentProjectName = sanitizedName

      console.log(`Project "${projectName}" created and selected successfully`)
      return `Project "${projectName}" created successfully`
    } catch (err) {
      console.error('Error creating project:', err)
      throw new Error(`Failed to create project: ${err.message}`)
    }
  }

  /**
   * Switch to a different project
   * @param {string} projectName - Name of the project to switch to
   * @returns {Promise<object>} - Project metadata
   */
  async switchProject(projectName) {
    try {
      if (!projectName || projectName.trim().length === 0) {
        throw new Error('Project name cannot be empty')
      }

      // Get directory handle for project
      const projectDir = await this.rootDirHandle.getDirectoryHandle(projectName)

      // Load metadata
      const metadataText = await this._readFile(projectDir, 'metadata.json')
      const metadata = JSON.parse(metadataText)

      // Update current project state
      this.currentProjectDir = projectDir
      this.currentProjectName = projectName

      console.log(`Switched to project "${projectName}"`)
      return metadata
    } catch (err) {
      console.error('Error switching project:', err)
      throw new Error(`Failed to switch project: ${err.message}`)
    }
  }

  /**
   * List all projects in root directory
   * @returns {Promise<array>} - Array of {name, fileCount, createdAt}
   */
  async listProjects() {
    try {
      const projects = []

      // Iterate through all entries in root directory
      for await (const entry of this.rootDirHandle.entries()) {
        const [name, handle] = entry

        // Skip hidden folders (starting with .)
        if (name.startsWith('.')) {
          continue
        }

        // Only process directories
        if (handle.kind !== 'directory') {
          continue
        }

        try {
          // Try to load metadata.json to verify it's a valid project
          const metadataText = await this._readFile(handle, 'metadata.json')
          const metadata = JSON.parse(metadataText)

          projects.push({
            name: metadata.projectName || name,
            fileCount: metadata.files?.length || 0,
            createdAt: metadata.createdAt || new Date().toISOString(),
            chunkCount: metadata.totalChunks || 0
          })
        } catch (err) {
          // Skip folders without valid metadata.json
          console.warn(`Skipping folder "${name}" - not a valid project`)
        }
      }

      return projects
    } catch (err) {
      console.error('Error listing projects:', err)
      throw new Error(`Failed to list projects: ${err.message}`)
    }
  }

  /**
   * Upload and process a document in current project with progress tracking
   * @param {File} file - Document file to upload
   * @param {object} options - Configuration options
   * @param {function} options.onProgress - Progress callback function(current, total, percentage)
   * @returns {Promise<object>} - {fileName, chunkCount}
   */
  async uploadDocumentToProject(file, options = {}) {
    try {
      if (!this.currentProjectDir) {
        throw new Error('No project selected. Please switch to a project first.')
      }

      if (!file) {
        throw new Error('No file provided')
      }

      // Reset cancellation flag
      this.currentUploadCancelled.value = false

      const onStageProgress = options.onStageProgress || (() => {})
      const onProgress = options.onProgress || (() => {})

      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let chunks

      if (isPDF) {
        // PDF: Use Web Worker for extraction and token-based chunking
        console.log('📄 Processing PDF with Web Worker...')
        onStageProgress('extracting', 'Extracting text from PDF...')

        // Extract raw text from PDF using Web Worker
        const arrayBuffer = await file.arrayBuffer()
        const extractionResult = await this.workerManager.extractPDFText(
          arrayBuffer,
          (progressData) => {
            if (progressData.type === 'pdf_extraction_progress') {
              onProgress(progressData.percentage * 0.2, 100)
            }
          }
        )

        if (this.currentUploadCancelled.value) {
          throw new Error('Upload cancelled')
        }

        const { text, pageCount, pageRanges } = extractionResult
        console.log(`✓ Extracted ${text.length} characters from ${pageCount} pages`)

        // Chunk by tokens with overlap using Web Worker
        onStageProgress('chunking', 'Creating text chunks...')
        chunks = await this.workerManager.chunkByTokens(
          text,
          {
            sourceFile: file.name,
            pageCount,
            documentType: 'pdf'
          },
          (progressData) => {
            if (progressData.type === 'chunking_progress') {
              onProgress(20 + (progressData.percentage * 0.1), 100)
            }
          }
        )

        if (this.currentUploadCancelled.value) {
          throw new Error('Upload cancelled')
        }

        // Enrich chunks with page information
        chunks = this._enrichChunksWithPageInfo(chunks, pageRanges)

        console.log(`✓ Created ${chunks.length} token-based chunks with 300-token overlap`)
      } else {
        // Structured documents: Use Web Worker for paragraph-based chunking
        console.log('📝 Processing structured document with Web Worker...')
        onStageProgress('chunking', 'Creating text chunks...')

        const fileText = await file.text()
        chunks = await this.workerManager.chunkByParagraphs(
          fileText,
          (progressData) => {
            if (progressData.type === 'chunking_progress') {
              onProgress(20 + (progressData.percentage * 0.1), 100)
            }
          }
        )

        if (this.currentUploadCancelled.value) {
          throw new Error('Upload cancelled')
        }

        console.log(`✓ Created ${chunks.length} paragraph-based chunks`)
      }

      if (chunks.length === 0) {
        throw new Error('No chunks were created from the document. The file may be empty or invalid.')
      }

      // Extract text from chunks for embedding
      const chunkTexts = chunks.map(chunk => chunk.text)

      // Generate embeddings with async breaks for UI responsiveness
      console.log(`Generating embeddings for ${chunks.length} chunks...`)
      onStageProgress('embedding', 'Generating embeddings...')

      const embeddings = await this.embeddingGenerator.generateEmbeddings(chunkTexts, {
        cancelled: this.currentUploadCancelled,
        onProgress: (current, total, percentage) => {
          onProgress(30 + (percentage * 0.6), 100)
        }
      })

      if (this.currentUploadCancelled.value) {
        throw new Error('Upload cancelled')
      }

      // Combine chunks with their embeddings
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index]
      }))

      // Write to file system
      onStageProgress('saving', 'Saving to project...')
      onProgress(95, 100)

      // Create filename with timestamp
      const timestamp = Date.now()
      const sanitizedFilename = file.name.replace(/[^\w.-]/g, '_')
      const jsonFilename = `${timestamp}_${sanitizedFilename}.json`

      // Write chunks to file
      const chunkData = {
        originalFilename: file.name,
        uploadedAt: new Date().toISOString(),
        chunkCount: chunksWithEmbeddings.length,
        chunkingStrategy: isPDF ? 'token-based' : 'paragraph-based',
        chunks: chunksWithEmbeddings
      }

      await this._writeFile(
        this.currentProjectDir,
        jsonFilename,
        JSON.stringify(chunkData, null, 2)
      )

      // Update project metadata
      await this._updateProjectMetadata(jsonFilename, file.name)

      onProgress(100, 100)
      console.log(`✅ Document "${file.name}" uploaded and processed successfully`)

      return {
        fileName: jsonFilename,
        chunkCount: chunksWithEmbeddings.length
      }
    } catch (err) {
      console.error('Error uploading document:', err)
      throw new Error(`Failed to upload document: ${err.message}`)
    }
  }

  /**
   * Cancel the current upload operation
   */
  cancelUpload() {
    this.currentUploadCancelled.value = true
    this.workerManager.cancel()
  }

  /**
   * Enrich chunks with page information
   * @private
   */
  _enrichChunksWithPageInfo(chunks, pageRanges) {
    return chunks.map(chunk => {
      const charStart = chunk.metadata.charStart
      const charEnd = chunk.metadata.charEnd

      // Find which pages this chunk spans
      const pagesSpanned = pageRanges.filter(range => {
        return (charStart >= range.startChar && charStart < range.endChar) ||
               (charEnd > range.startChar && charEnd <= range.endChar) ||
               (charStart <= range.startChar && charEnd >= range.endChar)
      })

      const pageNumbers = pagesSpanned.map(p => p.page)
      const pageStart = pageNumbers.length > 0 ? Math.min(...pageNumbers) : null
      const pageEnd = pageNumbers.length > 0 ? Math.max(...pageNumbers) : null

      return {
        ...chunk,
        metadata: {
          ...chunk.metadata,
          pageStart,
          pageEnd,
          pagesSpanned: pageNumbers
        }
      }
    })
  }

  /**
   * Get all chunks from current project
   * @returns {Promise<array>} - Flat array of all chunks
   */
  async getProjectChunks() {
    try {
      if (!this.currentProjectDir) {
        throw new Error('No project selected')
      }

      const allChunks = []

      // Iterate through all files in project directory
      for await (const entry of this.currentProjectDir.entries()) {
        const [filename, handle] = entry

        // Skip metadata.json and hidden files
        if (filename === 'metadata.json' || filename.startsWith('.')) {
          continue
        }

        // Only process .json files
        if (!filename.endsWith('.json')) {
          continue
        }

        try {
          const fileText = await this._readFile(this.currentProjectDir, filename)
          const data = JSON.parse(fileText)

          // Add file source to each chunk for traceability
          if (data.chunks && Array.isArray(data.chunks)) {
            data.chunks.forEach(chunk => {
              allChunks.push({
                ...chunk,
                metadata: {
                  ...chunk.metadata,
                  fileName: filename,
                  sourceFile: data.originalFilename
                }
              })
            })
          }
        } catch (err) {
          console.warn(`Error loading chunks from "${filename}":`, err.message)
        }
      }

      console.log(`Loaded ${allChunks.length} total chunks from project`)
      return allChunks
    } catch (err) {
      console.error('Error getting project chunks:', err)
      throw new Error(`Failed to get project chunks: ${err.message}`)
    }
  }

  /**
   * Query the project with a question using hybrid retrieval (semantic + keyword)
   * @param {string} question - User's question
   * @returns {Promise<object>} - {question, answer, sourcesUsed, relevantChunks, keywordData}
   */
  async queryProject(question) {
    try {
      if (!this.currentProjectDir) {
        throw new Error('No project selected')
      }

      if (!question || question.trim().length === 0) {
        throw new Error('Question cannot be empty')
      }

      console.log('=== HYBRID RETRIEVAL QUERY ===')
      console.log('Question:', question)

      // Get all chunks from project
      const chunks = await this.getProjectChunks()

      if (chunks.length === 0) {
        throw new Error('No documents found in project. Please upload some documents first.')
      }

      console.log(`Total chunks available: ${chunks.length}`)

      // Initialize embedding generator if not already initialized
      if (!this.embeddingGenerator.isInitialized()) {
        console.log('Initializing embedding generator for first query...')
        await this.embeddingGenerator.initialize()
      }

      // STEP 1: Extract keywords using LLM (mandatory for every query)
      console.log('\n--- STEP 1: Keyword Extraction ---')
      const keywordResult = await this.keywordExtractor.extractKeywords(question)

      let keywordData = {
        extracted: [],
        allTerms: [],
        error: keywordResult.error
      }

      if (keywordResult.keywords && keywordResult.keywords.length > 0) {
        keywordData.extracted = keywordResult.keywords
        keywordData.allTerms = this.keywordExtractor.getAllTerms(keywordResult)
        console.log(`Extracted ${keywordResult.keywords.length} keywords with ${keywordData.allTerms.length} total terms`)
      } else {
        console.log('No keywords extracted, will use semantic-only search')
      }

      // STEP 2: Semantic search - get top 100 chunks
      console.log('\n--- STEP 2: Semantic Search (Top 100) ---')
      const semanticChunks = await this.ragRetriever.findRelevantChunks(
        question,
        chunks,
        100, // Get top 100 semantic chunks
        this.embeddingGenerator
      )
      console.log(`Retrieved ${semanticChunks.length} semantic chunks`)

      // STEP 3: Keyword search across all chunks
      console.log('\n--- STEP 3: Keyword Search ---')
      let keywordChunks = []

      if (keywordData.allTerms.length > 0) {
        const allKeywordMatches = this.keywordSearcher.searchChunks(
          keywordData.allTerms,
          chunks
        )
        console.log(`Found ${allKeywordMatches.length} chunks with keyword matches`)

        // STEP 4: Filter out chunks already in semantic results
        console.log('\n--- STEP 4: Filtering Duplicates ---')
        keywordChunks = this.keywordSearcher.filterDuplicates(
          allKeywordMatches,
          semanticChunks
        )
        console.log(`After deduplication: ${keywordChunks.length} additional keyword chunks`)
      } else {
        console.log('Skipping keyword search (no keywords extracted)')
      }

      // STEP 5: Combine results (semantic + additional keyword chunks)
      console.log('\n--- STEP 5: Combining Results ---')
      const combinedChunks = [
        ...semanticChunks.map(c => ({ ...c, matchType: 'semantic' })),
        ...keywordChunks
      ]

      console.log(`Total chunks for context: ${combinedChunks.length}`)
      console.log(`  - Semantic: ${semanticChunks.length}`)
      console.log(`  - Additional keyword: ${keywordChunks.length}`)

      // Update keyword data with search stats
      if (keywordChunks.length > 0) {
        const searchStats = this.keywordSearcher.getSearchStats(keywordChunks)
        keywordData.searchStats = searchStats
      }

      // STEP 6: Build context from combined chunks
      console.log('\n--- STEP 6: Building Context ---')
      const context = combinedChunks
        .map((chunk, idx) => `[${idx + 1}] ${chunk.text}`)
        .join('\n\n')

      console.log(`Context length: ${context.length} characters`)

      // STEP 7: Query Perplexity with combined context
      console.log('\n--- STEP 7: Querying LLM ---')
      const systemPrompt = `SYSTEM ROLE

You are an expert document-grounded question-answering assistant.
Your sole function is to answer user questions only using the information explicitly contained in the provided documents.

You are not a legal analyst, policy explainer, or background source.
You do not rely on outside knowledge, typical legal rules, or assumed frameworks.

CORE PRINCIPLES (NON-NEGOTIABLE)
1. SOURCE RESTRICTION

Use ONLY the provided document context.

Do NOT use outside knowledge, background doctrine, or typical practices.

If something is not stated in the documents, you must say so.

2. CONCEPT SEPARATION (CRITICAL)

When answering, you must explicitly distinguish between:

eligibility / entitlement

coverage start

primary vs. secondary payer status

plan enrollment / plan termination

purpose vs. need vs. rationale

Never merge these concepts unless the document itself explicitly connects them.

3. NO SILENT INFERENCE

You may connect two stated facts only if the document itself implies a connection.

Any inference must be:

minimal,

explicitly labeled as inference,

grounded in quoted document language.

If the document does not explain why or how something occurred, you must say so.

4. COMPLETENESS REQUIREMENT (NEW — SYNTHESIS FIX)

Before answering, you must verify whether the document enumerates a list (e.g., purposes, needs, alternatives, dates, requirements).

If the document presents:

a numbered list,

a bullet list,

a stated set of purposes, needs, factors, or elements,

you MUST:

identify the total number of items stated in the document, and

present all of them.

Do not summarize a subset unless the user explicitly asks for a subset.

Failure to enumerate all stated elements is an incorrect answer.

INFERENCE SAFETY RULE (HARD CONSTRAINT)

You may NOT:

convert "eligibility" → "payment obligation"

convert "coverage start" → "primary payer"

convert "plan termination" → "coordination period end"

convert "purpose" → "need" or vice versa

fill statutory or procedural gaps with assumptions

Unless the document explicitly states that connection.

If the document states:

"Medicare became Patient A's primary insurance on August 31, 2018"

You may repeat that fact.
You may not explain why unless the document explains why.

If the document does not explicitly state a status, you must say:

"The documents do not explicitly state this."

Even if the conclusion seems legally obvious.

REQUIRED INTERNAL REASONING STEPS (SILENT, BUT MANDATORY)

Before answering, you must internally do the following:

Identify the section(s) of the document the question targets
(e.g., "Purpose and Need," "Background," "Plan Provisions").

Extract all explicit statements responsive to the question.

Check for enumeration:

Does the document list multiple purposes, needs, dates, or criteria?

If yes, count them and ensure all are included.

Check for category drift:

Ensure purposes are not described as needs.

Ensure background facts are not presented as conclusions.

Check for missing explanation:

If the document states a result but not the reason, do not supply one.

ANSWERING RULES
DIRECT ANSWER

Start with a concise statement answering only what the documents support.

Use document-mirroring language:

"became entitled"

"remained a member"

"became primary insurance"

"states the purpose is…"

EVIDENCE

Bullet points quoting or tightly paraphrasing document language.

Each bullet must include a citation (e.g., [Joint Appendix, p. 19]).

If the document lists multiple items, show each one.

CLARIFICATIONS / LIMITS

Explicitly state:

what the document does not explain,

what dates or transitions are stated without explanation.

Do not speculate.

CONFLICT HANDLING

If documents contain overlapping or potentially inconsistent facts:

State each fact separately.

Do not reconcile or explain conflicts unless the document does.

FAILURE MODE (MANDATORY)

If the user asks:

why something occurred,

how a statute normally operates,

what should have happened,

and the document does not directly answer that:

Respond exactly:

"I cannot answer this from the provided documents."

Optionally add one sentence only stating what document would be required
(e.g., statutory text, plan SPD, CMS notice).

TONE & STYLE

Professional, neutral, factual.

No policy analysis.

No doctrinal summaries.

No conversational filler.

FINAL CHECK (MANDATORY)

Before responding, verify:

All listed elements in the document are fully enumerated.

No status conclusions were inferred.

No purpose/need conflation occurred.

Every statement is traceable to document text.

Any unexplained gap is explicitly acknowledged."When the user asks for 'preparation' vs 'publication,' do not substitute NOA/publication dates unless the document explicitly equates them. If only NOA/publication is provided, answer with that and explicitly state that 'preparation date is not stated.'"

      `

      const answer = await this.perplexityAPI.query({
        systemPrompt,
        context,
        question
      })

      console.log('LLM response received')

      // Update metadata with last query time
      await this._updateLastQueriedTime()

      // Format chunks for UI display
      const formattedChunks = combinedChunks.map(chunk => ({
        content: chunk.text,
        fileName: chunk.metadata?.sourceFile || 'Unknown file',
        similarity: chunk.score || null,
        semanticScore: chunk.semanticScore || null,
        matchType: chunk.matchType || 'semantic',
        keywordMatches: chunk.keywordMatches || null,
        metadata: chunk.metadata
      }))

      console.log('=== QUERY COMPLETE ===\n')

      return {
        question: question.trim(),
        answer,
        sourcesUsed: formattedChunks.length,
        relevantChunks: formattedChunks,
        keywordData,
        retrievalStats: {
          semanticCount: semanticChunks.length,
          keywordCount: keywordChunks.length,
          totalCount: combinedChunks.length
        }
      }
    } catch (err) {
      console.error('Error querying project:', err)
      throw new Error(`Failed to query project: ${err.message}`)
    }
  }

  /**
   * Delete an entire project
   * @param {string} projectName - Name of the project to delete
   * @returns {Promise<string>} - Success message
   */
  async deleteProject(projectName) {
    try {
      if (!projectName || projectName.trim().length === 0) {
        throw new Error('Project name cannot be empty')
      }

      const projectDir = await this.rootDirHandle.getDirectoryHandle(projectName)

      await this._deleteDirectoryRecursive(projectDir, projectName)

      if (this.currentProjectName === projectName) {
        this.currentProjectDir = null
        this.currentProjectName = null
      }

      console.log(`Project "${projectName}" deleted successfully`)
      return `Project "${projectName}" deleted successfully`
    } catch (err) {
      console.error('Error deleting project:', err)
      throw new Error(`Failed to delete project: ${err.message}`)
    }
  }

  /**
   * Delete a file from the current project
   * @param {string} fileName - Internal file name to delete
   * @returns {Promise<object>} - {deleted: number, remaining: number}
   */
  async deleteFileFromProject(fileName) {
    try {
      if (!this.currentProjectDir) {
        throw new Error('No project selected')
      }

      if (!fileName) {
        throw new Error('File name is required')
      }

      const fileHandle = await this.currentProjectDir.getFileHandle(fileName)
      await this.currentProjectDir.removeEntry(fileName)

      const metadataText = await this._readFile(this.currentProjectDir, 'metadata.json')
      const metadata = JSON.parse(metadataText)

      metadata.files = metadata.files.filter(f => f.fileName !== fileName)

      const remainingChunks = await this.getProjectChunks()
      metadata.totalChunks = remainingChunks.length

      await this._writeFile(
        this.currentProjectDir,
        'metadata.json',
        JSON.stringify(metadata, null, 2)
      )

      console.log(`File "${fileName}" deleted successfully`)
      return {
        deleted: 1,
        remaining: remainingChunks.length
      }
    } catch (err) {
      console.error('Error deleting file:', err)
      throw new Error(`Failed to delete file: ${err.message}`)
    }
  }

  /**
   * Update project metadata with new file entry
   * @private
   */
  async _updateProjectMetadata(fileName, originalName) {
    try {
      const metadataText = await this._readFile(this.currentProjectDir, 'metadata.json')
      const metadata = JSON.parse(metadataText)

      // Add file entry
      metadata.files.push({
        fileName,
        originalName,
        uploadedAt: new Date().toISOString()
      })

      // Update total chunks count
      const chunks = await this.getProjectChunks()
      metadata.totalChunks = chunks.length

      await this._writeFile(
        this.currentProjectDir,
        'metadata.json',
        JSON.stringify(metadata, null, 2)
      )
    } catch (err) {
      console.error('Error updating project metadata:', err)
      throw err
    }
  }

  /**
   * Update last queried time in metadata
   * @private
   */
  async _updateLastQueriedTime() {
    try {
      const metadataText = await this._readFile(this.currentProjectDir, 'metadata.json')
      const metadata = JSON.parse(metadataText)

      metadata.lastQueried = new Date().toISOString()

      await this._writeFile(
        this.currentProjectDir,
        'metadata.json',
        JSON.stringify(metadata, null, 2)
      )
    } catch (err) {
      console.error('Error updating last queried time:', err)
      // Don't throw - this is not critical
    }
  }

  /**
   * Recursively delete a directory and all its contents
   * @private
   */
  async _deleteDirectoryRecursive(dirHandle, dirName) {
    try {
      for await (const entry of dirHandle.entries()) {
        const [name, handle] = entry

        if (handle.kind === 'directory') {
          await this._deleteDirectoryRecursive(handle, name)
        }

        await dirHandle.removeEntry(name, { recursive: true })
      }

      await this.rootDirHandle.removeEntry(dirName, { recursive: true })
    } catch (err) {
      throw new Error(`Failed to delete directory "${dirName}": ${err.message}`)
    }
  }

  /**
   * Set progress callback for keyword extractor model loading
   * @param {Function} callback - Progress callback function
   */
  setKeywordExtractorProgress(callback) {
    this.keywordExtractor.progressCallback = callback
  }

  /**
   * Pre-initialize the keyword extractor model
   * Useful for preloading the model before first query
   */
  async initializeKeywordExtractor() {
    return await this.keywordExtractor.initialize()
  }

  /**
   * Read text file from directory
   * @private
   */
  async _readFile(dirHandle, filename) {
    try {
      const fileHandle = await dirHandle.getFileHandle(filename)
      const file = await fileHandle.getFile()
      return await file.text()
    } catch (err) {
      throw new Error(`Failed to read file "${filename}": ${err.message}`)
    }
  }

  /**
   * Write text file to directory
   * @private
   */
  async _writeFile(dirHandle, filename, content) {
    try {
      const fileHandle = await dirHandle.getFileHandle(filename, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(content)
      await writable.close()
    } catch (err) {
      throw new Error(`Failed to write file "${filename}": ${err.message}`)
    }
  }
}
