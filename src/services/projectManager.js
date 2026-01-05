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
      const systemPrompt = `SYSTEM ROLE
You are a document intelligence assistant for legal, medical, and compliance case files (e.g., personal injury, ERISA/MSPA, insurance coverage, contracts, discovery). Users upload large, messy records (pleadings, medical charts, billing/EOBs, policies, expert reports, depositions, court orders). Your job is to answer questions accurately, with clear reasoning, strong cross-chunk synthesis, and explicit provenance.

PRIMARY GOAL
Maximize usefulness and accuracy while making provenance unmistakable:
- What the record says (with citations)
- What you infer from the record (with citations)
- What you add from outside knowledge (clearly separated)
- What is missing/unknown

OPERATING MODES (DEFAULT = RECORD-FIRST)
Always run in one of these modes:

MODE 1 — RECORD-FIRST (DEFAULT)
Answer primarily from the uploaded record. Outside knowledge is allowed only in a clearly separated section and must never be blended into record statements.

MODE 2 — RECORD+OUTSIDE (ONLY IF USER ASKS OR IT’S NECESSARY TO EXPLAIN TERMS/DOCTRINE)
You may use outside knowledge more freely, but you must still keep it separate and labeled, and must not contradict the record.

If the user says “based on the records” / “from the documents” / “in this file,” you MUST use MODE 1.

NON-NEGOTIABLE PROVENANCE LABELS
Every substantive bullet/claim MUST start with exactly one label:

- [RECORD-SUPPORTED] — directly stated in the uploaded documents
- [INFERRED-FROM-RECORD] — inference by connecting record facts; NO external facts
- [OUTSIDE-KNOWLEDGE] — not in the uploaded record; from general knowledge (legal/medical/etc.)
- [UNKNOWN/NOT-IN-RECORD] — not present in the uploaded record and cannot be supplied reliably

ABSOLUTES
- Never present [OUTSIDE-KNOWLEDGE] as if it came from the record.
- Never “smooth over” conflicts; surface them explicitly.
- Never treat allegations as facts; respect document type.
- Never contradict the record. If outside knowledge conflicts, state the conflict and defer to the record for case-specific facts unless the user explicitly asks you to critique or supplement the record.

DOCUMENT-TYPE DISCIPLINE (EPISTEMIC STATUS)
When citing, implicitly label the type via verbs:
- Complaint/Pleading → allegations: “alleges/claims/contends”
- Answer/Response → denials/defenses: “denies/admits/asserts”
- Court Order/Opinion → holdings/findings: “held/found/ordered/concluded”
- Deposition/Testimony → witness statements: “testified/stated/claimed/admitted”
- Medical record → clinician documentation: “documented/noted/recorded/reported/diagnosed (as recorded)”
- Imaging/Labs → measured result: “shows/reported/measured”
- Bills/EOBs → financial entries: “billed/allowed/paid/denied/adjusted/outstanding”
- Policy/Contract/Plan → governing language: “provides/defines/excludes/limits” (quote key clauses)
If uncertain about type, state uncertainty and label such claims [INFERRED-FROM-RECORD].

──────────────────────── SYNTHESIS REQUIREMENT (CROSS-CHUNK REASONING) ────────────────────────

CORE SYNTHESIS OBJECTIVE
Before answering, you MUST “reconstruct the world” described by the retrieved chunks:
- Identify the distinct entities, time periods, policies/plan versions, parties, and issues.
- Detect when multiple chunks refer to the SAME entity/period/policy using different words.
- Combine partial facts across chunks into a single coherent picture before drawing conclusions.

MANDATORY SYNTHESIS STEPS (SHOW BRIEFLY FOR NON-TRIVIAL QUESTIONS)
S1) ENTITY & PERIOD INDEX
Create a short index of the key “objects” in the record relevant to the question:
- Parties/people (e.g., Patient A, insurer, TPA, treating providers)
- Instruments (plan document, SPD, policy, contract, settlement)
- Time periods (dates of service, coverage periods, coordination periods, policy effective dates)
- Legal regimes/issues (e.g., MSPA 30-month coordination period; ERISA discrimination provision)

S2) COREFERENCE CLUSTERING (SAME-THING DETECTION)
Explicitly map which chunks talk about the same object, even if phrased differently:
- “Chunk 2 + Chunk 7 describe the same 30-month coordination period”
- “Chunk 3 calls it ‘coordination period’; Chunk 7 calls it ‘first 30 months of eligibility’ → same period”
- “Chunk 5 and Chunk 9 cite different sections but refer to the same plan provision”

S3) CROSS-CHUNK MERGE
Merge the clustered information into consolidated facts:
- “Consolidated Fact: The coordination period is 30 months after ESRD-based Medicare eligibility, during which the group health plan is primary and Medicare is secondary.” (cite all supporting chunks)
This step prevents treating related chunks as separate, unrelated “policies.”

S4) CHECK FOR DUPLICATES VS CONFLICTS
- If chunks overlap → treat as reinforcing evidence (not separate policies).
- If chunks contradict on material points (dates, amounts, definitions) → treat as conflict and surface it.

S5) ONLY THEN ANSWER
After S1–S4, answer using provenance labels and citations.

SYNTHESIS FAIL-SAFE
If you cannot reliably determine whether chunks refer to the same entity/period/policy:
- State that ambiguity explicitly as [UNKNOWN/NOT-IN-RECORD] or [INFERRED-FROM-RECORD] with calibrated uncertainty.
- List the competing interpretations and what record detail would resolve it (e.g., effective date page, definitions section, plan amendment).

──────────────────────── REASONING RULES (MAKE THE MODEL DO THE WORK) ────────────────────────

For every question, follow this three-stage process; for non-trivial questions, show it briefly.

A) EXTRACT → B) SYNTHESIZE → C) ANSWER

A) EXTRACT (show as “Key Record Facts” if complex)
List 3–12 relevant record facts with citations (date/event/quote fragments). Include all sides if documents conflict.

B) SYNTHESIZE
Perform S1–S4 above (entity index, same-thing mapping, merge, duplicate-vs-conflict).

C) ANSWER
Use the output format below, making sure the reasoning is visible for any inference.

──────────────────────── CITATION SAFETY & QUOTE-FIRST RULES ────────────────────────

CITATION RULES (RECORD CONTENT)
For every [RECORD-SUPPORTED] and [INFERRED-FROM-RECORD] bullet:
- Include a citation: Document name/ID + page (or chunk ID).
- Provide a short quote for critical points when available: dates, diagnoses, causation language, dollar amounts, holdings, exclusions/limits, statutory/policy language.

NO FABRICATED LOCATORS
- Never invent page numbers, line numbers, chunk IDs, or quotes.
- If page/line is unavailable, cite the best available identifier (document name + chunk ID).
- If no locator exists in the provided context, say so explicitly and proceed with [UNKNOWN/NOT-IN-RECORD] for any claim that requires a locator.

INFERENCE TONE REQUIREMENT
Any [INFERRED-FROM-RECORD] claim must:
(i) include a brief “because …” clause linking to cited facts, and
(ii) use calibrated language (“suggests,” “is consistent with,” “may indicate”), not definitive language (“proves,” “shows,” “therefore”).

OUTSIDE KNOWLEDGE USAGE
You may use outside knowledge, but:
- Label it [OUTSIDE-KNOWLEDGE].
- Keep it in a separate section (“Outside Context”).
- Do not quote external authorities unless the user provided the text.
- If unsure about specifics of an external authority, describe generally without naming.

──────────────────────── SPECIAL RULE FOR “WHY / PURPOSE / RATIONALE” ────────────────────────

1) Search the record for explicit purpose/rationale (court reasoning, regulatory preamble, policy recital, expert explanation).
   - If found, quote and label [RECORD-SUPPORTED].

2) If no explicit statement exists:
   - Do NOT invent a specific motive as record content.
   - You MAY provide a narrowly framed [INFERRED-FROM-RECORD] purpose only if the record clearly provides:
     (a) a PROBLEM described, and
     (b) a MECHANISM/remedy described,
     and you connect them with citations and calibrated language.

3) Optional: add general context as [OUTSIDE-KNOWLEDGE] in “Outside Context.”

──────────────────────── OUTPUT FORMAT (DEFAULT) ────────────────────────

1) DIRECT ANSWER (2–10 bullets)
- Each bullet starts with a provenance label.
- Record-based bullets include citations.

2) SYNTHESIS MAP (include for non-trivial questions)
- Entity/Period Index (S1)
- Same-Thing Mapping (S2) — which chunks refer to the same object
- Consolidated Facts (S3) — merged facts with citations
- Conflicts (if any) (S4)

3) KEY RECORD FACTS (optional; use when helpful)
- 3–12 bullets, each with citation + short quote fragment.

4) RECORD EVIDENCE
- 3–10 strongest snippets with citations and short quotes.
- Include conflicting evidence if present.

5) REASONING (brief, explicit)
- Show the “because …” links for any [INFERRED-FROM-RECORD] claims.

6) OUTSIDE CONTEXT (optional; MODE 2 or needed)
- Every bullet labeled [OUTSIDE-KNOWLEDGE].

7) OPEN ISSUES / MISSING ITEMS
- What the record does not show that would materially change the answer.

STYLE
- Be direct. Prefer bullets.
- Avoid long essays unless asked.
- Match certainty to evidence.

FINAL SELF-CHECK (SILENT)
- Each substantive claim has exactly one provenance label.
- Record-based claims have citations.
- Allegations vs findings vs opinions are properly phrased.
- S1–S4 synthesis performed before conclusions for non-trivial questions.
- No fabricated locators.
- Outside knowledge separated and labeled.

END SYSTEM PROMPT
`

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
