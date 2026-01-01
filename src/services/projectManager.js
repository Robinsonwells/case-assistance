import DocumentChunker from './documentChunker'
import EmbeddingGenerator from './embeddingGenerator'
import RAGRetriever from './ragRetriever'
import PerplexityAPI from './perplexityAPI'

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
    this.chunker = new DocumentChunker()
    this.embeddingGenerator = new EmbeddingGenerator()
    this.ragRetriever = new RAGRetriever()
    this.perplexityAPI = new PerplexityAPI()
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

      console.log(`Project "${projectName}" created successfully`)
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

      // Read file text
      const fileText = await file.text()

      // Chunk the document
      const chunks = this.chunker.chunkHybrid(fileText)

      // Extract text from chunks for batch embedding
      const chunkTexts = chunks.map(chunk => chunk.text)

      // Generate embeddings using memory-efficient batch processing
      console.log(`Generating embeddings for ${chunks.length} chunks with batch processing...`)
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
        chunks: chunksWithEmbeddings
      }

      await this._writeFile(
        this.currentProjectDir,
        jsonFilename,
        JSON.stringify(chunkData, null, 2)
      )

      // Update project metadata
      await this._updateProjectMetadata(jsonFilename, file.name)

      console.log(`Document "${file.name}" uploaded and processed`)
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

      // Retrieve relevant chunks using RAG
      const relevantChunks = await this.ragRetriever.findRelevantChunks(
        question,
        chunks,
        10 // top K
      )

      // Build context from relevant chunks
      const context = relevantChunks
        .map((chunk, idx) => `[${idx + 1}] ${chunk.text}`)
        .join('\n\n')

      // Query Perplexity with context
      const systemPrompt = `You are a legal analysis AI assistant.
You have been given relevant excerpts from legal documents.
Answer the user's question based on the provided context.
If the information is not in the context, say "I don't have information about that in the provided documents."`

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
        similarity: chunk.score / 10 // Normalize score to 0-1 range for display
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
