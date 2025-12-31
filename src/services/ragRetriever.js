/**
 * RAGRetriever - Retrieval Augmented Generation logic
 * 
 * What is RAG?
 * - Retrieval Augmented Generation combines document retrieval with LLM generation
 * - First, retrieve relevant documents/chunks based on query
 * - Then, generate answer using those documents as context
 * - This keeps answers grounded in actual source material
 * 
 * Retrieval Strategy (MVP - Keyword Matching):
 * - Simple approach: match keywords from question to chunk text
 * - Scores chunks based on keyword overlap
 * - Fast and works well for legal documents with specific terminology
 * 
 * Future Improvement (Embedding-based):
 * - Use cosine similarity between question embedding and chunk embeddings
 * - More semantic understanding, better for paraphrased content
 * - Slower but more accurate retrieval
 */
export default class RAGRetriever {
  constructor() {
    // Configuration for retrieval
    this.minChunkScore = 0 // Minimum score to include chunk
    this.keywordMinLength = 3 // Only consider words of 3+ chars
  }

  /**
   * Find the most relevant chunks for a given question
   * 
   * Current approach: Keyword matching (simple, fast, effective for legal docs)
   * Future approach: Embedding similarity (more semantic understanding)
   * 
   * Process:
   * 1. Extract keywords from question
   * 2. Score each chunk based on keyword matches
   * 3. Sort by score descending
   * 4. Return top K chunks
   * 
   * @param {string} question - User's question
   * @param {array} chunks - Array of chunk objects with 'text' property
   * @param {number} topK - Number of top chunks to return (default: 5)
   * @returns {Promise<array>} - Top K relevant chunks with scores, sorted by relevance
   */
  async findRelevantChunks(question, chunks, topK = 5) {
    try {
      // Validate inputs
      if (!question || typeof question !== 'string') {
        throw new Error('Question must be a non-empty string')
      }

      if (!Array.isArray(chunks) || chunks.length === 0) {
        throw new Error('Chunks array must not be empty')
      }

      // Validate topK
      if (typeof topK !== 'number' || topK < 1 || topK > 10) {
        console.warn('topK should be between 1 and 10, defaulting to 5')
        topK = 5
      }

      // Limit topK to available chunks
      topK = Math.min(topK, chunks.length)

      console.log(`Finding ${topK} most relevant chunks from ${chunks.length} total chunks`)

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

      // Filter out zero-score chunks and get top K
      const relevantChunks = sortedChunks
        .filter(chunk => chunk.score > this.minChunkScore)
        .slice(0, topK)

      // If we have fewer than topK matches, fill with highest scores even if zero
      if (relevantChunks.length < topK) {
        const additionalChunks = sortedChunks
          .slice(relevantChunks.length, topK)
        relevantChunks.push(...additionalChunks)
      }

      console.log(`Retrieved ${relevantChunks.length} relevant chunks`)
      console.log('Top chunk scores:', relevantChunks.slice(0, 3).map(c => c.score))

      return relevantChunks
    } catch (err) {
      console.error('Error finding relevant chunks:', err)
      throw new Error(`Failed to find relevant chunks: ${err.message}`)
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
   * Calculate cosine similarity between two embedding vectors
   * Useful for embedding-based retrieval (future enhancement)
   * 
   * Formula: similarity = (a · b) / (||a|| * ||b||)
   * - Returns value between -1 and 1 (normalized embeddings typically 0 to 1)
   * 
   * @param {array} vectorA - First embedding vector
   * @param {array} vectorB - Second embedding vector
   * @returns {number} - Cosine similarity score
   */
  cosineSimilarity(vectorA, vectorB) {
    try {
      // Validate inputs
      if (!Array.isArray(vectorA) || !Array.isArray(vectorB)) {
        throw new Error('Both inputs must be arrays')
      }

      if (vectorA.length !== vectorB.length) {
        throw new Error('Vectors must have same length')
      }

      if (vectorA.length === 0) {
        throw new Error('Vectors cannot be empty')
      }

      // Calculate dot product
      let dotProduct = 0
      for (let i = 0; i < vectorA.length; i++) {
        dotProduct += vectorA[i] * vectorB[i]
      }

      // Calculate magnitudes
      let magnitudeA = 0
      let magnitudeB = 0
      for (let i = 0; i < vectorA.length; i++) {
        magnitudeA += vectorA[i] * vectorA[i]
        magnitudeB += vectorB[i] * vectorB[i]
      }
      magnitudeA = Math.sqrt(magnitudeA)
      magnitudeB = Math.sqrt(magnitudeB)

      // Avoid division by zero
      if (magnitudeA === 0 || magnitudeB === 0) {
        return 0
      }

      // Return cosine similarity
      return dotProduct / (magnitudeA * magnitudeB)
    } catch (err) {
      console.error('Error calculating cosine similarity:', err)
      return 0
    }
  }

  /**
   * Get retrieval statistics
   * Useful for debugging and understanding retrieval quality
   * 
   * @param {array} retrievedChunks - Chunks returned from findRelevantChunks
   * @returns {object} - Statistics about the retrieval
   */
  getRetrievalStats(retrievedChunks) {
    if (!Array.isArray(retrievedChunks) || retrievedChunks.length === 0) {
      return {
        retrievedCount: 0,
        averageScore: 0,
        scoreRange: [0, 0]
      }
    }

    const scores = retrievedChunks.map(c => c.score)
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

    return {
      retrievedCount: retrievedChunks.length,
      averageScore: Math.round(avgScore * 100) / 100,
      maxScore: Math.max(...scores),
      minScore: Math.min(...scores),
      scoreRange: [Math.min(...scores), Math.max(...scores)]
    }
  }
}
