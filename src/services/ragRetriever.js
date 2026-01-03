import { cosineSimilarity } from '../utils/cosineSimilarity.js'

/**
 * RAGRetriever - Retrieval Augmented Generation logic
 *
 * What is RAG?
 * - Retrieval Augmented Generation combines document retrieval with LLM generation
 * - First, retrieve relevant documents/chunks based on query
 * - Then, generate answer using those documents as context
 * - This keeps answers grounded in actual source material
 *
 * Retrieval Strategy (Pure Semantic Search):
 * - Uses semantic embeddings for retrieval
 * - Semantic: Uses cosine similarity between question and chunk embeddings
 * - Deduplication: Removes near-duplicate chunks
 * - Requires embeddings for all chunks
 */
export default class RAGRetriever {
  constructor() {
    // Configuration for retrieval
    this.minChunkScore = 0 // Minimum score to include chunk

    // Deduplication threshold (cosine similarity)
    this.deduplicationThreshold = 0.85 // Remove chunks with > 85% similarity

    // Stats tracking for last retrieval
    this.lastRetrievalStats = null
  }

  /**
   * Find the most relevant chunks for a given question using semantic search
   *
   * Semantic Search Strategy:
   * - Uses pure semantic embeddings (cosine similarity)
   * - Requires embeddings for all chunks
   *
   * Process:
   * 1. Generate question embedding
   * 2. Deduplicate chunks based on embedding similarity
   * 3. Score each chunk using cosine similarity
   * 4. Sort by score descending
   * 5. Return top K chunks
   *
   * @param {string} question - User's question
   * @param {array} chunks - Array of chunk objects with 'text' and 'embedding' property
   * @param {number} topK - Number of top chunks to return (default: 15)
   * @param {object} embeddingGenerator - EmbeddingGenerator instance (required)
   * @returns {Promise<array>} - Top K relevant chunks with scores, sorted by relevance
   */
  async findRelevantChunks(question, chunks, topK = 15, embeddingGenerator = null) {
    try {
      // Validate inputs
      if (!question || typeof question !== 'string') {
        throw new Error('Question must be a non-empty string')
      }

      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunks array must not be empty')
      }

      // Validate embeddingGenerator
      if (!embeddingGenerator || !embeddingGenerator.isInitialized()) {
        throw new Error('Initialized EmbeddingGenerator is required for semantic search')
      }

      // Validate topK
      if (typeof topK !== 'number' || topK < 1 || topK > 50) {
        console.warn('topK should be between 1 and 50, defaulting to 15')
        topK = 15
      }

      // Limit topK to available chunks
      topK = Math.min(topK, chunks.length)

      console.log(`Finding ${topK} most relevant chunks from ${chunks.length} total chunks using semantic search`)

      // Step 1: Generate question embedding
      const questionEmbedding = await embeddingGenerator.generateEmbedding(question)
      console.log(`Generated question embedding (dimension: ${questionEmbedding.length})`)

      // Step 2: Ensure all chunks have embeddings
      const chunksWithEmbeddings = chunks.filter(chunk => chunk.embedding && Array.isArray(chunk.embedding))
      if (chunksWithEmbeddings.length === 0) {
        throw new Error('No chunks have embeddings. Run generateChunkEmbeddings() first.')
      }

      if (chunksWithEmbeddings.length < chunks.length) {
        console.warn(
          `Only ${chunksWithEmbeddings.length}/${chunks.length} chunks have embeddings. ` +
          'Some chunks will be excluded from search.'
        )
      }

      // Step 3: Deduplicate chunks based on embedding similarity
      const deduplicatedChunks = this._deduplicateChunks(chunksWithEmbeddings)
      console.log(`Deduplicated: ${chunks.length} -> ${deduplicatedChunks.length} chunks`)

      // Step 4: Calculate semantic scores
      const scoredChunks = deduplicatedChunks.map(chunk => {
        // Semantic score: cosine similarity
        const semanticScore = cosineSimilarity(questionEmbedding, chunk.embedding)

        return {
          ...chunk,
          score: semanticScore,
          semanticScore
        }
      })

      // Step 5: Sort by score descending
      const sortedChunks = scoredChunks.sort((a, b) => b.score - a.score)

      // Step 6: Get top K chunks
      const relevantChunks = sortedChunks.slice(0, topK)

      // Store stats for debugging
      this.lastRetrievalStats = {
        totalChunks: chunks.length,
        deduplicatedChunks: deduplicatedChunks.length,
        retrievedChunks: relevantChunks.length,
        semanticScores: relevantChunks.map(c => c.semanticScore),
        finalScores: relevantChunks.map(c => c.score),
        searchType: 'semantic'
      }

      console.log(`Retrieved ${relevantChunks.length} relevant chunks`)
      console.log('Top 3 scores:', relevantChunks.slice(0, 3).map(c => ({
        score: c.score.toFixed(3),
        semantic: c.semanticScore.toFixed(3)
      })))

      return relevantChunks
    } catch (err) {
      console.error('Error finding relevant chunks:', err)
      throw new Error(`Failed to find relevant chunks: ${err.message}`)
    }
  }


  /**
   * Generate embeddings for all chunks with batch processing and progress tracking
   *
   * This method pre-generates embeddings for all chunks so they can be reused
   * across multiple queries. Embeddings are stored directly in the chunk objects.
   *
   * @param {array} chunks - Array of chunk objects with 'text' property
   * @param {object} embeddingGenerator - EmbeddingGenerator instance
   * @param {object} options - Configuration options
   * @param {number} options.batchSize - Chunks to process per batch (default: 50)
   * @param {function} options.onProgress - Progress callback(current, total, percentage)
   * @returns {Promise<array>} - Chunks with embeddings attached
   */
  async generateChunkEmbeddings(chunks, embeddingGenerator, options = {}) {
    try {
      // Validate inputs
      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunks array must not be empty')
      }

      if (!embeddingGenerator || typeof embeddingGenerator.generateEmbedding !== 'function') {
        throw new Error('Valid EmbeddingGenerator instance required')
      }

      console.log(`Generating embeddings for ${chunks.length} chunks...`)

      // Extract text from chunks
      const texts = chunks.map(chunk => chunk.text || '')

      // Validate all chunks have text
      const emptyChunks = texts.filter(t => !t).length
      if (emptyChunks > 0) {
        console.warn(`${emptyChunks} chunks have empty text and will get zero embeddings`)
      }

      // Generate embeddings with batch processing
      const embeddings = await embeddingGenerator.generateEmbeddings(texts, {
        batchSize: options.batchSize || 50,
        onProgress: (current, total, percentage) => {
          console.log(`Generating embeddings: ${current}/${total} (${percentage}%)`)
          if (options.onProgress) {
            options.onProgress(current, total, percentage)
          }
        }
      })

      // Attach embeddings to chunks
      const chunksWithEmbeddings = chunks.map((chunk, idx) => ({
        ...chunk,
        embedding: embeddings[idx]
      }))

      console.log(`Successfully generated ${embeddings.length} embeddings`)

      return chunksWithEmbeddings
    } catch (err) {
      console.error('Error generating chunk embeddings:', err)
      throw new Error(`Failed to generate chunk embeddings: ${err.message}`)
    }
  }


  /**
   * Remove near-duplicate chunks based on embedding similarity
   *
   * Process:
   * 1. Compare each chunk to all previous chunks
   * 2. If similarity > threshold, skip (it's a duplicate)
   * 3. Otherwise, keep it
   *
   * This keeps the first occurrence of each unique chunk and removes
   * later near-duplicates.
   *
   * @private
   * @param {array} chunks - Chunks with embeddings
   * @param {number} threshold - Similarity threshold (default: 0.85)
   * @returns {array} - Deduplicated chunks
   */
  _deduplicateChunks(chunks, threshold = null) {
    try {
      // Use instance threshold if not provided
      threshold = threshold !== null ? threshold : this.deduplicationThreshold

      // Validate threshold
      if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
        console.warn('Invalid deduplication threshold, using default 0.85')
        threshold = 0.85
      }

      if (chunks.length <= 1) {
        return chunks
      }

      const uniqueChunks = []
      let duplicatesRemoved = 0

      for (let i = 0; i < chunks.length; i++) {
        const currentChunk = chunks[i]

        // Check if current chunk is similar to any already selected chunk
        let isDuplicate = false

        for (let j = 0; j < uniqueChunks.length; j++) {
          const similarity = cosineSimilarity(
            currentChunk.embedding,
            uniqueChunks[j].embedding
          )

          if (similarity > threshold) {
            isDuplicate = true
            duplicatesRemoved++
            break
          }
        }

        // Keep chunk if it's not a duplicate
        if (!isDuplicate) {
          uniqueChunks.push(currentChunk)
        }
      }

      if (duplicatesRemoved > 0) {
        console.log(`Removed ${duplicatesRemoved} near-duplicate chunks (threshold: ${threshold})`)
      }

      return uniqueChunks
    } catch (err) {
      console.error('Error deduplicating chunks:', err)
      // Return original chunks if deduplication fails
      return chunks
    }
  }


  /**
   * Get retrieval statistics
   * Useful for debugging and understanding retrieval quality
   *
   * Returns statistics from the last retrieval operation, including
   * semantic scores.
   *
   * @returns {object|null} - Statistics about the last retrieval, or null if no retrieval yet
   */
  getRetrievalStats() {
    if (!this.lastRetrievalStats) {
      console.warn('No retrieval stats available. Run findRelevantChunks() first.')
      return null
    }

    // Calculate additional statistics if available
    const stats = { ...this.lastRetrievalStats }

    if (stats.finalScores && stats.finalScores.length > 0) {
      const avgScore = stats.finalScores.reduce((a, b) => a + b, 0) / stats.finalScores.length
      stats.averageScore = Math.round(avgScore * 1000) / 1000

      stats.maxScore = Math.max(...stats.finalScores)
      stats.minScore = Math.min(...stats.finalScores)
    }

    if (stats.semanticScores && stats.semanticScores.length > 0) {
      const avgSemantic = stats.semanticScores.reduce((a, b) => a + b, 0) / stats.semanticScores.length
      stats.averageSemanticScore = Math.round(avgSemantic * 1000) / 1000
    }

    return stats
  }
}
