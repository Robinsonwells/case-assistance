import { pipeline } from '@xenova/transformers'

/**
 * EmbeddingGenerator - Converts text to vector embeddings using transformers.js
 * 
 * What are embeddings?
 * - Numerical representations of text that capture semantic meaning
 * - 768-dimensional vectors from the all-MiniLM-L6-v2 model
 * - Similar texts have similar embeddings (useful for similarity search)
 * 
 * Why local embeddings?
 * - Privacy: All processing happens in the browser, no data sent to server
 * - Speed: No network latency after initial model download
 * - Cost: No API charges
 * 
 * First call is slow (downloads ~23MB model), subsequent calls are fast (cached in IndexedDB)
 */
export default class EmbeddingGenerator {
  constructor() {
    // Lazy-loaded feature extraction pipeline
    this.extractor = null

    // Track initialization state to avoid duplicate loads
    this.initialized = false

    // Retry configuration
    this.maxRetries = 3
    this.retryDelay = 1000
  }

  /**
   * Initialize the embedding model (lazy loading)
   * Downloads the Xenova/all-MiniLM-L6-v2 model (~23MB) on first call
   * Subsequent calls use cached model from IndexedDB
   * 
   * @returns {Promise<void>}
   */
  async initialize() {
    // Return early if already initialized
    if (this.initialized) {
      return
    }

    try {
      console.log('Initializing embedding model...')
      console.log('Note: This will download ~23MB model on first call. Subsequent calls will be fast.')

      // Load the feature extraction pipeline
      // all-MiniLM-L6-v2: lightweight model good for RAG tasks
      // ~23MB download, 768-dimensional output
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')

      this.initialized = true
      console.log('Embedding model initialized successfully')
    } catch (err) {
      console.error('Failed to initialize embedding model:', err)
      throw new Error(`Failed to initialize embedding model: ${err.message}`)
    }
  }

  /**
   * Generate a single embedding for text
   * 
   * Process:
   * 1. Initialize model if needed
   * 2. Extract features from text
   * 3. Apply mean pooling to get single vector
   * 4. Normalize to unit length
   * 5. Convert to array and return
   * 
   * @param {string} text - Text to embed
   * @returns {Promise<array>} - 768-dimensional embedding vector
   */
  async generateEmbedding(text) {
    try {
      // Validate input
      if (!text || typeof text !== 'string') {
        throw new Error('Text must be a non-empty string')
      }

      // Initialize model if needed
      await this.initialize()

      // Extract features (embeddings)
      // pooling: 'mean' averages the token embeddings
      // normalize: true normalizes to unit length (helps with similarity computation)
      const result = await this.extractor(text, {
        pooling: 'mean',
        normalize: true
      })

      // Convert tensor data to array
      // result.data is a Float32Array, convert to regular array
      const embedding = Array.from(result.data)

      console.log(`Generated embedding for text (length: ${text.length})`)
      return embedding
    } catch (err) {
      console.error('Error generating embedding:', err)
      throw new Error(`Failed to generate embedding: ${err.message}`)
    }
  }

  /**
   * Generate embeddings for multiple texts with memory-efficient batch processing
   * Processes in parallel batches (50 at a time by default) to prevent memory crashes
   *
   * @param {array} textArray - Array of text strings to embed
   * @param {object} options - Configuration options
   * @param {number} options.batchSize - Chunks to process per batch (default: 50)
   * @param {function} options.onProgress - Progress callback function(current, total, percentage)
   * @returns {Promise<array>} - Array of embedding vectors
   */
  async generateEmbeddings(textArray, options = {}) {
    try {
      // Validate input
      if (!Array.isArray(textArray)) {
        throw new Error('Input must be an array of strings')
      }

      if (textArray.length === 0) {
        return []
      }

      // Validate all entries are strings
      const invalidEntries = textArray.filter((item, idx) => typeof item !== 'string')
      if (invalidEntries.length > 0) {
        throw new Error('All entries in array must be strings')
      }

      // Extract options with defaults
      const batchSize = options.batchSize || 50
      const onProgress = options.onProgress || (() => {})

      console.log(`Generating ${textArray.length} embeddings in batches of ${batchSize}...`)

      // Initialize model once for all embeddings
      await this.initialize()

      const embeddings = []
      const totalBatches = Math.ceil(textArray.length / batchSize)

      for (let i = 0; i < textArray.length; i += batchSize) {
        const batch = textArray.slice(i, i + batchSize)
        const currentBatch = Math.floor(i / batchSize) + 1

        // Process batch in parallel
        const batchResults = await Promise.all(
          batch.map(text => this._generateEmbeddingWithRetry(text))
        )

        embeddings.push(...batchResults)

        // Calculate progress
        const processed = Math.min(i + batchSize, textArray.length)
        const percentage = Math.round((processed / textArray.length) * 100)

        // Log progress
        console.log(`Batch ${currentBatch}/${totalBatches}: ${processed}/${textArray.length} embeddings (${percentage}%)`)

        // Call progress callback
        onProgress(processed, textArray.length, percentage)

        // Add small delay between batches to allow garbage collection
        // This prevents memory buildup on large documents
        if (i + batchSize < textArray.length) {
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      }

      console.log(`Successfully generated ${embeddings.length} embeddings`)
      return embeddings
    } catch (err) {
      console.error('Error generating embeddings batch:', err)
      throw new Error(`Failed to generate embeddings: ${err.message}`)
    }
  }

  /**
   * Generate embedding with retry logic
   * Handles transient failures during embedding generation
   * 
   * @private
   * @param {string} text - Text to embed
   * @returns {Promise<array>} - Embedding vector
   */
  async _generateEmbeddingWithRetry(text, retryCount = 0) {
    try {
      return await this.generateEmbedding(text)
    } catch (err) {
      if (retryCount < this.maxRetries) {
        console.warn(
          `Retry ${retryCount + 1}/${this.maxRetries} for embedding generation:`,
          err.message
        )

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, this.retryDelay))

        return this._generateEmbeddingWithRetry(text, retryCount + 1)
      } else {
        throw new Error(`Failed to generate embedding after ${this.maxRetries} retries: ${err.message}`)
      }
    }
  }

  /**
   * Check if model is initialized and ready
   * Useful for UI feedback
   * 
   * @returns {boolean} - True if model is loaded and ready
   */
  isInitialized() {
    return this.initialized && this.extractor !== null
  }

  /**
   * Get model information
   * Useful for debugging and diagnostics
   * 
   * @returns {object} - Model information
   */
  getModelInfo() {
    return {
      model: 'Xenova/all-MiniLM-L6-v2',
      modelSize: '23MB',
      embeddingDimension: 768,
      pooling: 'mean',
      normalized: true,
      initialized: this.initialized,
      status: this.initialized ? 'ready' : 'not initialized'
    }
  }
}
