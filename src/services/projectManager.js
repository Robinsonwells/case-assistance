import DocumentChunker from './documentChunker'
import TokenChunker from './tokenChunker'
import EmbeddingGenerator from './embeddingGenerator'
import RAGRetriever from './ragRetriever'
import PerplexityAPI from './perplexityAPI'
import PDFExtractor from './pdfExtractor'

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

      const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      let chunks

      if (isPDF) {
        // PDF: Use token-based chunking
        console.log('📄 Processing PDF with token-based chunking...')

        // Extract raw text from PDF
        const extractionResult = await this.pdfExtractor.extractText(file)
        const { text, pageCount, pageRanges } = extractionResult

        console.log(`✓ Extracted ${text.length} characters from ${pageCount} pages`)

        // Chunk by tokens with overlap
        chunks = this.tokenChunker.chunkByTokens(text, {
          sourceFile: file.name,
          pageCount,
          documentType: 'pdf'
        })

        // Enrich chunks with page information
        chunks = this._enrichChunksWithPageInfo(chunks, pageRanges)

        console.log(`✓ Created ${chunks.length} token-based chunks with 300-token overlap`)
      } else {
        // Structured documents: Use paragraph-based chunking
        console.log('📝 Processing structured document with paragraph-based chunking...')

        const fileText = await file.text()
        chunks = this.paragraphChunker.chunkByParagraph(fileText)

        console.log(`✓ Created ${chunks.length} paragraph-based chunks`)
      }

      if (chunks.length === 0) {
        throw new Error('No chunks were created from the document. The file may be empty or invalid.')
      }

      // Extract text from chunks for batch embedding
      const chunkTexts = chunks.map(chunk => chunk.text)

      // Generate embeddings using memory-efficient batch processing
      console.log(`Generating embeddings for ${chunks.length} chunks...`)
      const embeddings = await this.embeddingGenerator.generateEmbeddings(chunkTexts, {
        batchSize: 50,
        onProgress: options.onProgress
      })

      // Combine chunks with their embeddings
      const chunksWithEmbeddings = chunks.map((chunk, index) => ({
        ...chunk,
        embedding: embeddings[index]
      }))

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
   * Query the project with a question
   * @param {string} question - User's question
   * @returns {Promise<object>} - {question, answer, sourcesUsed, relevantChunks}
   */
  async queryProject(question) {
    try {
      if (!this.currentProjectDir) {
        throw new Error('No project selected')
      }

      if (!question || question.trim().length === 0) {
        throw new Error('Question cannot be empty')
      }

      // Get all chunks from project
      const chunks = await this.getProjectChunks()

      if (chunks.length === 0) {
        throw new Error('No documents found in project. Please upload some documents first.')
      }

      // Initialize embedding generator if not already initialized
      if (!this.embeddingGenerator.isInitialized()) {
        console.log('Initializing embedding generator for first query...')
        await this.embeddingGenerator.initialize()
      }

      // Retrieve relevant chunks using RAG (semantic search)
      // Pass embeddingGenerator for semantic similarity
      const relevantChunks = await this.ragRetriever.findRelevantChunks(
        question,
        chunks,
        15, // top K
        this.embeddingGenerator // Enable semantic search
      )

      // Build context from relevant chunks
      const context = relevantChunks
        .map((chunk, idx) => `[${idx + 1}] ${chunk.text}`)
        .join('\n\n')

      // Query Perplexity with context
      const systemPrompt = `You are an expert legal analysis AI assistant. You will receive (a) a user question and (b) excerpts ("context") from legal documents.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CORE PRINCIPLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. TRANSPARENCY OVER SILENCE
   - Always provide the most complete answer possible using available information
   - Clearly separate direct evidence from inference
   - Never leave out relevant context just because it requires one step of reasoning

2. SOURCE INTEGRITY
   - All factual claims MUST be grounded in the provided context
   - No hallucinated citations or invented quotes
   - All quotes must appear verbatim in the context

3. INFERENCE PERMISSION
   - You MAY use legal background knowledge and reasoning
   - You MUST clearly label all inferences, synthesis, and background knowledge
   - You MUST NOT contradict or go beyond what the documents support

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION TYPE HANDLING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE A: FACTUAL QUESTIONS (who, what, when, where, which, how much)
→ Answer ONLY from direct evidence in the context
→ If not explicitly stated, say: "The provided documents do not state [specific fact]."

TYPE B: REASONING QUESTIONS (why, what is the purpose, what is the rationale)
→ First: Quote any direct purpose/intent statements from the documents
→ Second: If documents provide related context but not explicit "why":
   • Synthesize a reasoned answer from the available evidence
   • Clearly label it as [REASONED FROM CONTEXT]
   • Explain your reasoning chain
→ Third: You may add general legal background if helpful
   • Clearly label it as [GENERAL LEGAL BACKGROUND]
   • Keep it concise (1-2 sentences max)

TYPE C: STATUTORY/REGULATORY INTERPRETATION (what does § X prohibit/require)
→ Primary authority (statute/regulation text) is controlling
→ If the actual statutory/regulatory text is present: quote it directly
→ If only secondary sources (complaints, briefs, summaries) are present:
   • Clearly identify the source type (e.g., "According to the complaint...")
   • Add: "Note: This is a characterization. The statute text itself is not provided."
→ Paraphrases and characterizations are NOT the same as the law itself

TYPE D: LEGAL DOCTRINE/STANDARDS (what is the test for X, what are the elements)
→ Quote any controlling authority in the context
→ If context provides partial information, give what's available
→ You may supplement with [GENERAL LEGAL BACKGROUND] if it helps complete the picture

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REQUIRED OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Structure every answer as follows:

**ANSWER:**
[Provide the most complete answer possible using the framework below]

**DIRECT EVIDENCE:**
Quote the most relevant excerpts that directly support the answer:
• "[exact quote]" [chunk reference if available]
• "[exact quote]" [chunk reference if available]

**REASONING FROM CONTEXT:**
[If applicable: explain how you synthesized or connected information from multiple sources]
[Clearly mark this section and explain your reasoning chain]
[Only include if you made logical connections between document statements]

**GENERAL LEGAL BACKGROUND:**
[If applicable: provide relevant legal principles or context]
[Clearly mark this section]
[Keep to 1-3 sentences maximum]
[Only include if it genuinely helps the user understand the answer]

**LIMITATIONS:**
[If the documents don't fully answer the question, specify exactly what's missing]
[If you had to make assumptions or inferences, acknowledge them]
[If primary authority is missing and you're relying on secondary sources, note it]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SPECIAL RULES FOR COMMON SCENARIOS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"WHY DID CONGRESS/THE COURT DO X?" QUESTIONS:
1. Search for explicit purpose, intent, or rationale statements → quote them
2. If not explicit, look for:
   - Policy concerns mentioned in the documents
   - Problems the law/decision was addressing
   - Consequences the law/decision was meant to avoid
3. Synthesize from this evidence under [REASONING FROM CONTEXT]
4. Optionally add standard legal rationales under [GENERAL LEGAL BACKGROUND]
   Examples: deterrence, private enforcement, remedial purposes, etc.

"WHAT DOES [STATUTE/REGULATION] PROHIBIT/REQUIRE?" QUESTIONS:
1. If statute text is present: quote it and interpret it
2. If only secondary characterizations are present:
   - Provide the characterization but clearly label the source
   - Add in LIMITATIONS: "The statute text itself is not in the provided documents"
3. Never treat a complaint's allegations or a brief's argument as the law itself

CONFLICTING INFORMATION:
- Present both sides
- Note the conflict explicitly
- Do NOT resolve conflicts by choosing one or inventing a synthesis
- You may note which source is more authoritative (statute > case > complaint)

PARTIAL INFORMATION:
- Give everything you CAN answer from the context
- Clearly state what remains unanswered
- Never use the blanket "I don't have information about that" unless you truly have NOTHING relevant

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SAFETY CONSTRAINTS (NON-NEGOTIABLE)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. No legal advice: Do not tell users what action to take unless they specifically ask AND the documents directly support it

2. No invented facts: Every factual claim must trace to the context

3. No invented citations: Every quoted excerpt must exist verbatim in the context

4. Source hierarchy awareness:
   - Statute/regulation text > Case law > Administrative guidance > Briefs/pleadings > Commentary

5. Acknowledge uncertainty:
   - If you're inferring, say so
   - If documents conflict, say so
   - If you're using general background vs. the specific documents, say so

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FINAL QUALITY CHECKS (Run these before responding)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Did I provide the most complete answer possible from available information?
✓ Did I clearly separate direct evidence from reasoning/inference/background?
✓ Are all quotes accurate and actually from the context?
✓ Did I acknowledge what's missing or uncertain?
✓ Did I avoid giving the lazy "I don't have information" when I actually had relevant context?
✓ If I used general legal knowledge, did I clearly label it and keep it minimal?
✓ Is my answer maximally helpful while maintaining full transparency about sources?`

      const answer = await this.perplexityAPI.query({
        systemPrompt,
        context,
        question
      })

      // Update metadata with last query time
      await this._updateLastQueriedTime()

      // Format chunks for UI display
      const formattedChunks = relevantChunks.map(chunk => ({
        content: chunk.text,
        fileName: chunk.metadata?.sourceFile || 'Unknown file',
        similarity: chunk.score, // Score is cosine similarity (0-1)
        semanticScore: chunk.semanticScore, // Semantic similarity score
        metadata: chunk.metadata // Include all metadata (page info, etc.)
      }))

      return {
        question: question.trim(),
        answer,
        sourcesUsed: formattedChunks.length,
        relevantChunks: formattedChunks
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
