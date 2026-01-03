/**
 * TokenChunker - Deterministic token-based text chunking
 *
 * Used for PDFs and other layout-based documents where paragraph structure
 * is unreliable. Guarantees 100% content coverage with no information loss.
 *
 * Key principles:
 * - Fixed token windows with overlap
 * - No semantic inference
 * - Complete text coverage
 * - Predictable behavior
 */

export default class TokenChunker {
  constructor(config = {}) {
    // Target chunk size in tokens (approximate)
    this.targetTokens = config.targetTokens || 1000

    // Maximum chunk size in tokens
    this.maxTokens = config.maxTokens || 1200

    // Minimum chunk size in tokens
    this.minTokens = config.minTokens || 600

    // Overlap between chunks in tokens
    this.overlapTokens = config.overlapTokens || 300

    // Characters per token (rough approximation for English)
    this.charsPerToken = config.charsPerToken || 4
  }

  /**
   * Chunk text by token count with overlap
   *
   * @param {string} text - Raw text to chunk
   * @param {object} metadata - Optional metadata to attach to chunks (e.g., page ranges)
   * @returns {Array} - Array of chunk objects with text and metadata
   */
  chunkByTokens(text, metadata = {}) {
    try {
      const chunks = []

      if (!text || typeof text !== 'string') {
        console.warn('Invalid text input for chunkByTokens')
        return chunks
      }

      const cleanText = text.trim()
      if (cleanText.length === 0) {
        return chunks
      }

      // Convert tokens to approximate character counts
      const targetChars = this.targetTokens * this.charsPerToken
      const overlapChars = this.overlapTokens * this.charsPerToken

      let position = 0
      let chunkIndex = 0

      while (position < cleanText.length) {
        // Calculate chunk end position
        const chunkEnd = Math.min(position + targetChars, cleanText.length)

        // Extract chunk text
        let chunkText = cleanText.slice(position, chunkEnd)

        // If not at the end, try to break at sentence boundary for readability
        // (but never discard text - this is purely cosmetic)
        if (chunkEnd < cleanText.length) {
          const lastPeriod = chunkText.lastIndexOf('. ')
          const lastQuestion = chunkText.lastIndexOf('? ')
          const lastExclaim = chunkText.lastIndexOf('! ')
          const lastBreak = Math.max(lastPeriod, lastQuestion, lastExclaim)

          // Only break at sentence if it's in the last 20% of the chunk
          // This prevents chunks from being too small
          if (lastBreak > chunkText.length * 0.8) {
            chunkText = chunkText.slice(0, lastBreak + 2)
          }
        }

        // Calculate actual token count (approximate)
        const tokenCount = Math.round(chunkText.length / this.charsPerToken)

        // Create chunk object
        chunks.push({
          id: `token_chunk_${chunkIndex}`,
          text: chunkText.trim(),
          type: 'token',
          metadata: {
            chunkIndex,
            tokenStart: Math.round(position / this.charsPerToken),
            tokenEnd: Math.round((position + chunkText.length) / this.charsPerToken),
            charStart: position,
            charEnd: position + chunkText.length,
            tokenCount,
            ...metadata
          }
        })

        // Move position forward, accounting for overlap
        const actualChunkLength = chunkText.length
        position += actualChunkLength - overlapChars

        // Ensure we always make progress (avoid infinite loop)
        if (actualChunkLength === 0) {
          position += targetChars
        }

        chunkIndex++
      }

      console.log(`✓ Created ${chunks.length} token-based chunks`)
      console.log(`  Average chunk size: ${Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length)} chars`)
      console.log(`  Overlap: ${this.overlapTokens} tokens (~${overlapChars} chars)`)

      return chunks
    } catch (err) {
      console.error('Error in chunkByTokens:', err)
      return []
    }
  }

  /**
   * Get statistics about token-based chunks
   */
  getChunkStats(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        totalChunks: 0,
        totalTokens: 0,
        totalCharacters: 0,
        averageTokensPerChunk: 0,
        averageCharsPerChunk: 0,
        minChunkSize: 0,
        maxChunkSize: 0
      }
    }

    const sizes = chunks.map(c => c.text.length)
    const tokenCounts = chunks.map(c => c.metadata?.tokenCount || 0)
    const totalChars = sizes.reduce((sum, size) => sum + size, 0)
    const totalTokens = tokenCounts.reduce((sum, tokens) => sum + tokens, 0)

    return {
      totalChunks: chunks.length,
      totalTokens,
      totalCharacters: totalChars,
      averageTokensPerChunk: Math.round(totalTokens / chunks.length),
      averageCharsPerChunk: Math.round(totalChars / chunks.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes)
    }
  }
}
