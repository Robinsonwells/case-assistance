import { pipeline } from '@xenova/transformers'

/**
 * EmbeddingGenerator - Converts text to vector embeddings using transformers.js
 *
 * What are embeddings?
 * - Numerical representations of text that capture semantic meaning
 * - 384-dimensional vectors from the all-MiniLM-L6-v2 model
 * - Similar texts have similar embeddings (useful for similarity search)
 *
 * Why local embeddings?
 * - Privacy: All processing happens in the browser, no data sent to server
 * - Speed: No network latency after initial model download
 * - Cost: No API charges
 *
 * WebGPU Acceleration:
 * - Uses GPU when available for 5-10x faster embedding generation
 * - Falls back to CPU (WASM) if GPU unavailable
 * - All processing still happens locally on your device
 *
 * First call is slow (downloads ~23MB model), subsequent calls are fast (cached in IndexedDB)
 */
export default class EmbeddingGenerator {
  constructor() {
    // Lazy-loaded feature extraction pipeline
    this.extractor = null

    // Track initialization state to avoid duplicate loads
    this.initialized = false

    // Track which device is being used
    this.device = null

    // Retry configuration
    this.maxRetries = 3
    this.retryDelay = 1000
  }

  /**
   * Initialize the embedding model (lazy loading)
   * Downloads the Xenova/all-MiniLM-L6-v2 model (~23MB) on first call
   * Subsequent calls use cached model from IndexedDB
   * Automatically uses WebGPU if available, falls back to WASM
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

      // Detect best available device
      const device = await this._detectDevice()
      this.device = device

      console.log(`Using device: ${device}`)

      // Load the feature extraction pipeline with device specification
      // all-MiniLM-L6-v2: popular, efficient model for semantic similarity
      // ~23MB download, 384-dimensional output
      this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        device: device,
        dtype: device === 'webgpu' ? 'fp32' : 'q8'
      })

      this.initialized = true
      console.log(`Embedding model initialized successfully on ${device}`)
    } catch (err) {
      console.error('Failed to initialize embedding model:', err)
      throw new Error(`Failed to initialize embedding model: ${err.message}`)
    }
  }

  /**
   * Detect the best available compute device
   * Priority: WebGPU (fastest) -> WASM (fallback)
   *
   * @private
   * @returns {Promise<string>} - Device identifier ('webgpu' or 'wasm')
   */
  async _detectDevice() {
    // Check for WebGPU support
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter()
        if (adapter) {
          const info = await adapter.requestAdapterInfo?.()
          console.log('WebGPU detected - GPU acceleration enabled')
          if (info) {
            console.log(`GPU: ${info.vendor} ${info.architecture || info.device || ''}`)
          }
          return 'webgpu'
        } else {
          console.warn('WebGPU: navigator.gpu exists but no adapter available')
          console.warn('Check chrome://gpu for details')
        }
      } catch (err) {
        console.warn('WebGPU available but failed to initialize:', err.message)
        console.warn('Try: 1) Update GPU drivers 2) Enable chrome://flags/#enable-unsafe-webgpu')
      }
    } else {
      console.log('WebGPU not available in this browser')
      console.log('WebGPU requires Chrome 113+, Edge 113+, or Safari 18+')
      console.log('Check chrome://gpu to see if WebGPU is supported')
    }

    // Fallback to WASM
    console.log('Using CPU (WASM) - embeddings will be slower but still work')
    return 'wasm'
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
   * @returns {Promise<array>} - 384-dimensional embedding vector
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
   * Generate embeddings for multiple texts one at a time
   * Processes each text individually for consistency
   *
   * @param {array} textArray - Array of text strings to embed
   * @param {object} options - Configuration options
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
      const onProgress = options.onProgress || (() => {})
      const cancelled = options.cancelled || { value: false }

      console.log(`Generating ${textArray.length} embeddings one at a time...`)

      // Initialize model once for all embeddings
      await this.initialize()

      const embeddings = []

      for (let i = 0; i < textArray.length; i++) {
        // Check for cancellation
        if (cancelled.value) {
          throw new Error('Embedding generation cancelled')
        }

        // Process one chunk at a time
        const embedding = await this._generateEmbeddingWithRetry(textArray[i])
        embeddings.push(embedding)

        // Calculate progress
        const processed = i + 1
        const percentage = Math.round((processed / textArray.length) * 100)

        // Log progress
        console.log(`Chunk ${processed}/${textArray.length} embeddings (${percentage}%)`)

        // Call progress callback
        onProgress(processed, textArray.length, percentage)

        // Yield to main thread after each chunk for UI updates
        if (i < textArray.length - 1) {
          await this._yieldToMainThread(10)
        }
      }

      console.log(`Successfully generated ${embeddings.length} embeddings`)
      return embeddings
    } catch (err) {
      console.error('Error generating embeddings:', err)
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
   * Yield control to the main thread to allow UI updates
   * @private
   */
  async _yieldToMainThread(delay = 0) {
    return new Promise(resolve => setTimeout(resolve, delay))
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
      embeddingDimension: 384,
      pooling: 'mean',
      normalized: true,
      device: this.device || 'not detected',
      gpuAccelerated: this.device === 'webgpu',
      initialized: this.initialized,
      status: this.initialized ? 'ready' : 'not initialized'
    }
  }
}
