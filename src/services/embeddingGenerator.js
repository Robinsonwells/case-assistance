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
      // Use fp16 for WebGPU (faster), q8 for WASM (smaller)
      let dtype = 'q8'
      if (device === 'webgpu') {
        try {
          // Try fp16 first for better performance
          this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            device: device,
            dtype: 'fp16'
          })
          dtype = 'fp16'
          console.log('Using fp16 precision for WebGPU')
        } catch (err) {
          console.warn('fp16 not supported, falling back to fp32:', err.message)
          // Fall back to fp32 if fp16 fails
          this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
            device: device,
            dtype: 'fp32'
          })
          dtype = 'fp32'
        }
      } else {
        this.extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          device: device,
          dtype: dtype
        })
      }

      this.initialized = true
      console.log(`Embedding model initialized successfully on ${device}`)
    } catch (err) {
      console.error('Failed to initialize embedding model:', err)
      throw new Error(`Failed to initialize embedding model: ${err.message}`)
    }
  }

  /**
   * Force reinitialization of the model
   * Useful for switching devices or recovering from errors
   *
   * @returns {Promise<void>}
   */
  async reinitialize() {
    console.log('Forcing model reinitialization...')

    // Dispose of existing model
    if (this.extractor) {
      try {
        // Try to dispose of the pipeline if it has a dispose method
        if (typeof this.extractor.dispose === 'function') {
          await this.extractor.dispose()
        }
      } catch (err) {
        console.warn('Error disposing model:', err.message)
      }
    }

    // Reset state
    this.extractor = null
    this.initialized = false
    this.device = null

    // Reinitialize with new device detection
    await this.initialize()
  }

  /**
   * Check if WebGPU is available and switch to it if currently using WASM
   * Returns true if switched to WebGPU, false otherwise
   *
   * @returns {Promise<boolean>}
   */
  async tryUpgradeToWebGPU() {
    // Already using WebGPU
    if (this.device === 'webgpu') {
      console.log('Already using WebGPU')
      return false
    }

    // Check if WebGPU is available
    if (navigator.gpu) {
      try {
        const adapter = await navigator.gpu.requestAdapter()
        if (adapter) {
          console.log('WebGPU is now available! Upgrading from WASM to WebGPU...')
          await this.reinitialize()
          return this.device === 'webgpu'
        }
      } catch (err) {
        console.log('WebGPU still not available:', err.message)
      }
    }

    return false
  }

  /**
   * Detect the best available compute device
   * Priority: WebGPU (fastest) -> WASM (fallback)
   *
   * @private
   * @returns {Promise<string>} - Device identifier ('webgpu' or 'wasm')
   */
  async _detectDevice() {
    // Check for WebGPU support with retry logic
    if (navigator.gpu) {
      // Try multiple times with delays in case GPU is initializing
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const adapter = await navigator.gpu.requestAdapter({
            powerPreference: 'high-performance'
          })

          if (adapter) {
            const info = await adapter.requestAdapterInfo?.()
            console.log('WebGPU detected - GPU acceleration enabled')
            if (info) {
              console.log(`GPU: ${info.vendor} ${info.architecture || info.device || ''}`)
            }
            return 'webgpu'
          } else {
            console.warn(`WebGPU attempt ${attempt + 1}/3: No adapter available`)
            if (attempt < 2) {
              await new Promise(resolve => setTimeout(resolve, 500))
            }
          }
        } catch (err) {
          console.warn(`WebGPU attempt ${attempt + 1}/3 failed:`, err.message)
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 500))
          }
        }
      }

      console.warn('WebGPU: Failed after 3 attempts')
      console.warn('Try: 1) Update GPU drivers 2) Enable chrome://flags/#enable-unsafe-webgpu 3) Check chrome://gpu')
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
   * 5. Return Float32Array directly
   *
   * @param {string} text - Text to embed
   * @returns {Promise<Float32Array>} - 384-dimensional embedding vector
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

      // Return typed array directly (no conversion to JS array)
      // Faster and uses less memory
      return result.data
    } catch (err) {
      console.error('Error generating embedding:', err)
      throw new Error(`Failed to generate embedding: ${err.message}`)
    }
  }

  /**
   * Generate embeddings for multiple texts with micro-batching
   * Processes texts in small batches for optimal performance
   *
   * @param {array} textArray - Array of text strings to embed
   * @param {object} options - Configuration options
   * @param {function} options.onProgress - Progress callback function(current, total, percentage)
   * @param {number} options.batchSize - Number of texts to process per batch (default: auto-detect)
   * @returns {Promise<array>} - Array of embedding vectors (Float32Arrays)
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

      // Auto-detect optimal batch size based on device
      // WebGPU can handle larger batches, WASM benefits from smaller batches
      const defaultBatchSize = this.device === 'webgpu' ? 32 : 16
      const batchSize = options.batchSize || defaultBatchSize

      console.log(`Generating ${textArray.length} embeddings with batch size ${batchSize} on ${this.device}...`)

      // Initialize model once for all embeddings
      await this.initialize()

      const embeddings = []
      const totalBatches = Math.ceil(textArray.length / batchSize)
      let processed = 0
      let lastLoggedPercentage = -1

      for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        // Check for cancellation
        if (cancelled.value) {
          throw new Error('Embedding generation cancelled')
        }

        // Get batch slice
        const start = batchIndex * batchSize
        const end = Math.min(start + batchSize, textArray.length)
        const batch = textArray.slice(start, end)

        // Process batch - transformers.js will automatically batch internally
        // if we pass an array
        const batchResults = await this._generateBatchEmbeddingsWithRetry(batch)
        embeddings.push(...batchResults)

        // Update progress
        processed = end
        const percentage = Math.round((processed / textArray.length) * 100)

        // Log only when percentage changes (reduces console spam)
        if (percentage !== lastLoggedPercentage) {
          console.log(`Embeddings: ${processed}/${textArray.length} (${percentage}%)`)
          lastLoggedPercentage = percentage
        }

        // Call progress callback
        onProgress(processed, textArray.length, percentage)

        // Yield to main thread every few batches (not every chunk)
        if (batchIndex % 3 === 0 && batchIndex < totalBatches - 1) {
          await this._yieldToMainThread(0)
        }
      }

      console.log(`✓ Generated ${embeddings.length} embeddings using ${this.device}`)
      return embeddings
    } catch (err) {
      console.error('Error generating embeddings:', err)
      throw new Error(`Failed to generate embeddings: ${err.message}`)
    }
  }

  /**
   * Generate embeddings for a batch of texts with retry logic
   *
   * @private
   * @param {array} textBatch - Array of text strings to embed
   * @returns {Promise<array>} - Array of Float32Array embeddings
   */
  async _generateBatchEmbeddingsWithRetry(textBatch) {
    let lastError = null

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        // Process batch through the model
        const results = await Promise.all(
          textBatch.map(text => this._generateEmbeddingRaw(text))
        )
        return results
      } catch (err) {
        lastError = err

        // Only retry on specific transient errors
        const isTransient = err.message.includes('timeout') ||
                           err.message.includes('network') ||
                           err.message.includes('GPU context')

        if (!isTransient || attempt === this.maxRetries - 1) {
          throw err
        }

        // Shorter retry delay (100ms instead of 1000ms)
        console.warn(`Batch embedding attempt ${attempt + 1} failed, retrying in 100ms...`)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    throw lastError
  }

  /**
   * Generate single embedding without retry (raw operation)
   * Returns Float32Array directly for better performance
   *
   * @private
   * @param {string} text - Text to embed
   * @returns {Promise<Float32Array>} - Embedding vector
   */
  async _generateEmbeddingRaw(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Text must be a non-empty string')
    }

    // Extract features with pooling and normalization
    const result = await this.extractor(text, {
      pooling: 'mean',
      normalize: true
    })

    // Return typed array directly (no conversion to JS array)
    // This saves memory and allocation overhead
    return result.data
  }

  /**
   * Generate embedding with retry logic
   * Handles transient failures during embedding generation
   *
   * @private
   * @param {string} text - Text to embed
   * @returns {Promise<Float32Array>} - Embedding vector
   */
  async _generateEmbeddingWithRetry(text, retryCount = 0) {
    try {
      return await this.generateEmbedding(text)
    } catch (err) {
      // Only retry on specific transient errors
      const isTransient = err.message.includes('timeout') ||
                         err.message.includes('network') ||
                         err.message.includes('GPU context')

      if (isTransient && retryCount < this.maxRetries) {
        console.warn(
          `Retry ${retryCount + 1}/${this.maxRetries} for embedding generation:`,
          err.message
        )

        // Shorter retry delay (100ms instead of 1000ms)
        await new Promise(resolve => setTimeout(resolve, 100))

        return this._generateEmbeddingWithRetry(text, retryCount + 1)
      } else {
        throw new Error(`Failed to generate embedding: ${err.message}`)
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
