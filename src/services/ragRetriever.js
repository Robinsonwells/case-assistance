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
 * Retrieval Strategy (Hybrid Search):
 * - Combines semantic embeddings (70%) + keyword matching (30%)
 * - Semantic: Uses cosine similarity between question and chunk embeddings
 * - Keyword: Matches keywords from question to chunk text
 * - Deduplication: Removes near-duplicate chunks
 * - Fallback: Pure keyword search if no embeddings provided
 */
export default class RAGRetriever {
  constructor() {
    // Configuration for retrieval
    this.minChunkScore = 0 // Minimum score to include chunk
    this.keywordMinLength = 3 // Only consider words of 3+ chars

    // Hybrid search weights (must sum to 1.0)
    this.semanticWeight = 0.7 // Weight for semantic similarity
    this.keywordWeight = 0.3 // Weight for keyword matching

    // Deduplication threshold (cosine similarity)
    this.deduplicationThreshold = 0.85 // Remove chunks with > 85% similarity

    // Stats tracking for last retrieval
    this.lastRetrievalStats = null
  }

  /**
   * Find the most relevant chunks for a given question using hybrid search
   *
   * Hybrid Search Strategy:
   * - If embeddingGenerator provided: Combines semantic (70%) + keyword (30%) scores
   * - If no embeddingGenerator: Falls back to keyword-only search
   *
   * Process:
   * 1. Generate question embedding (if generator provided)
   * 2. Deduplicate chunks (if embeddings available)
   * 3. Score each chunk with semantic + keyword scores
   * 4. Sort by combined score descending
   * 5. Return top K chunks
   *
   * @param {string} question - User's question
   * @param {array} chunks - Array of chunk objects with 'text' and optionally 'embedding' property
   * @param {number} topK - Number of top chunks to return (default: 10)
   * @param {object} embeddingGenerator - EmbeddingGenerator instance (optional)
   * @returns {Promise<array>} - Top K relevant chunks with scores, sorted by relevance
   */
  async findRelevantChunks(question, chunks, topK = 10, embeddingGenerator = null) {
    try {
      // Validate inputs
      if (!question || typeof question !== 'string') {
        throw new Error('Question must be a non-empty string')
      }

      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunks array must not be empty')
      }

      // Validate topK
      if (typeof topK !== 'number' || topK < 1 || topK > 50) {
        console.warn('topK should be between 1 and 50, defaulting to 10')
        topK = 10
      }

      // Limit topK to available chunks
      topK = Math.min(topK, chunks.length)

      console.log(`Finding ${topK} most relevant chunks from ${chunks.length} total chunks`)

      // Determine if we can use hybrid search
      const useHybridSearch = embeddingGenerator && embeddingGenerator.isInitialized()

      if (!useHybridSearch) {
        console.warn(
          'No EmbeddingGenerator provided or not initialized. Using keyword-only search. ' +
          'For better results, pass an initialized EmbeddingGenerator.'
        )
        return this._keywordOnlySearch(question, chunks, topK)
      }

      // Hybrid search path
      console.log('Using hybrid search (semantic + keyword)')

      // Step 1: Generate question embedding
      const questionEmbedding = await embeddingGenerator.generateEmbedding(question)
      console.log(`Generated question embedding (dimension: ${questionEmbedding.length})`)

      // Step 2: Ensure all chunks have embeddings
      const chunksWithEmbeddings = chunks.filter(chunk => chunk.embedding && Array.isArray(chunk.embedding))
      if (chunksWithEmbeddings.length === 0) {
        console.warn('No chunks have embeddings. Falling back to keyword-only search.')
        return this._keywordOnlySearch(question, chunks, topK)
      }

      if (chunksWithEmbeddings.length < chunks.length) {
        console.warn(
          `Only ${chunksWithEmbeddings.length}/${chunks.length} chunks have embeddings. ` +
          'Consider running generateChunkEmbeddings() first.'
        )
      }

      // Step 3: Deduplicate chunks based on embedding similarity
      const deduplicatedChunks = this._deduplicateChunks(chunksWithEmbeddings)
      console.log(`Deduplicated: ${chunks.length} -> ${deduplicatedChunks.length} chunks`)

      // Step 4: Extract keywords for keyword scoring
      const keywords = this._extractKeywords(question)
      console.log(`Extracted ${keywords.length} keywords from question`)

      // Step 5: Calculate both semantic and keyword scores
      const scoredChunks = deduplicatedChunks.map(chunk => {
        // Semantic score: cosine similarity
        const semanticScore = cosineSimilarity(questionEmbedding, chunk.embedding)

        // Keyword score: normalized keyword matching
        const rawKeywordScore = this._scoreChunk(chunk.text, keywords)
        const maxKeywordScore = keywords.length * 3 // Max 3 points per keyword
        const keywordScore = this._normalizeScore(rawKeywordScore, maxKeywordScore)

        // Combined score: weighted average
        const finalScore = (semanticScore * this.semanticWeight) + (keywordScore * this.keywordWeight)

        return {
          ...chunk,
          score: finalScore,
          semanticScore,
          keywordScore,
          rawKeywordScore
        }
      })

      // Step 6: Sort by final score descending
      const sortedChunks = scoredChunks.sort((a, b) => b.score - a.score)

      // Step 7: Get top K chunks
      const relevantChunks = sortedChunks.slice(0, topK)

      // Store stats for debugging
      this.lastRetrievalStats = {
        totalChunks: chunks.length,
        deduplicatedChunks: deduplicatedChunks.length,
        retrievedChunks: relevantChunks.length,
        semanticScores: relevantChunks.map(c => c.semanticScore),
        keywordScores: relevantChunks.map(c => c.keywordScore),
        finalScores: relevantChunks.map(c => c.score),
        semanticWeight: this.semanticWeight,
        keywordWeight: this.keywordWeight,
        searchType: 'hybrid'
      }

      console.log(`Retrieved ${relevantChunks.length} relevant chunks`)
      console.log('Top 3 scores:', relevantChunks.slice(0, 3).map(c => ({
        final: c.score.toFixed(3),
        semantic: c.semanticScore.toFixed(3),
        keyword: c.keywordScore.toFixed(3)
      })))

      return relevantChunks
    } catch (err) {
      console.error('Error finding relevant chunks:', err)
      throw new Error(`Failed to find relevant chunks: ${err.message}`)
    }
  }

  /**
   * Fallback: Keyword-only search (when no embeddings available)
   *
   * @private
   * @param {string} question - User's question
   * @param {array} chunks - Array of chunks
   * @param {number} topK - Number of chunks to return
   * @returns {Promise<array>} - Top K chunks
   */
  async _keywordOnlySearch(question, chunks, topK) {
    // Extract keywords from question
    const keywords = this._extractKeywords(question)
    console.log(`Extracted ${keywords.length} keywords from question:`, keywords)

    if (keywords.length === 0) {
      console.warn('No keywords extracted from question. Returning first K chunks.')
      return chunks.slice(0, topK)
    }

    // Score each chunk
    const scoredChunks = chunks.map(chunk => ({
      ...chunk,
      score: this._scoreChunk(chunk.text, keywords)
    }))

    // Sort by score descending
    const sortedChunks = scoredChunks.sort((a, b) => b.score - a.score)

    // Get top K
    const relevantChunks = sortedChunks.slice(0, topK)

    // Store stats
    this.lastRetrievalStats = {
      totalChunks: chunks.length,
      retrievedChunks: relevantChunks.length,
      finalScores: relevantChunks.map(c => c.score),
      searchType: 'keyword-only'
    }

    console.log(`Retrieved ${relevantChunks.length} relevant chunks (keyword-only)`)
    console.log('Top chunk scores:', relevantChunks.slice(0, 3).map(c => c.score))

    return relevantChunks
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
   * Normalize a score to 0-1 range
   *
   * @private
   * @param {number} score - Raw score
   * @param {number} maxScore - Maximum possible score
   * @returns {number} - Normalized score [0, 1]
   */
  _normalizeScore(score, maxScore) {
    if (maxScore === 0) return 0
    return Math.min(1, Math.max(0, score / maxScore))
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
   * Extract and normalize keywords from question
   * Filters out common stop words and short words
   *
   * @private
   * @param {string} question - Question text to extract keywords from
   * @returns {array} - Array of keyword strings
   */
  _extractKeywords(question) {
    // Common stop words to ignore (English)
    const stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
      'if', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or',
      'such', 'that', 'the', 'to', 'was', 'will', 'with', 'what', 'who',
      'when', 'where', 'why', 'how', 'can', 'could', 'would', 'should',
      'do', 'does', 'did', 'have', 'has', 'had', 'am', 'been', 'being'
    ])

    // Split into words and normalize
    const words = question
      .toLowerCase()
      .split(/\s+/) // Split on whitespace
      .map(word => word.replace(/[^\w'-]/g, '')) // Remove special chars
      .filter(word => {
        // Keep words that are:
        // - At least minChunkScore chars
        // - Not stop words
        // - Not numbers only
        return (
          word.length >= this.keywordMinLength &&
          !stopWords.has(word) &&
          !/^\d+$/.test(word)
        )
      })

    // Return unique keywords
    return [...new Set(words)]
  }

  /**
   * Score a chunk based on keyword matches
   * Higher score = more relevant
   * 
   * Scoring:
   * - +1 point for each keyword match
   * - Case-insensitive matching
   * - Partial word matches count (e.g., "compliance" matches "comply")
   * 
   * @private
   * @param {string} chunkText - Text of chunk to score
   * @param {array} keywords - Keywords to match against
   * @returns {number} - Score (higher = more relevant)
   */
  _scoreChunk(chunkText, keywords) {
    if (!chunkText || keywords.length === 0) {
      return 0
    }

    const chunkLower = chunkText.toLowerCase()
    let score = 0

    // Count how many keywords appear in chunk
    keywords.forEach(keyword => {
      // Count occurrences of keyword in chunk
      // This counts both exact matches and partial matches
      const regex = new RegExp(`\\b${keyword}`, 'gi')
      const matches = chunkText.match(regex) || []
      
      // Add 1 point per match (max 3 points per keyword for saturation)
      score += Math.min(matches.length, 3)
    })

    return score
  }

  /**
   * Get retrieval statistics
   * Useful for debugging and understanding retrieval quality
   *
   * Returns statistics from the last retrieval operation, including
   * semantic scores, keyword scores, and combined scores.
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

    if (stats.keywordScores && stats.keywordScores.length > 0) {
      const avgKeyword = stats.keywordScores.reduce((a, b) => a + b, 0) / stats.keywordScores.length
      stats.averageKeywordScore = Math.round(avgKeyword * 1000) / 1000
    }

    return stats
  }
}
