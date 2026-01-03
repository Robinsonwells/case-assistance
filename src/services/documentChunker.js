/**
 * DocumentChunker - Text processing utility for breaking documents into chunks
 * Supports simple paragraph-based chunking
 */

export default class DocumentChunker {
  constructor() {
    // Pattern for spaced ellipses in legal documents (e.g., ". . ." or " . . . ")
    this.ellipsisPattern = /(\s*\.\s+){2,}/g
  }

  /**
   * Simple paragraph-based chunking
   * Splits document by paragraph boundaries only, no sentence-level processing
   * 
   * Useful for documents with natural paragraph breaks and less context overlap needed
   * 
   * @param {string} text - Raw document text to chunk
   * @returns {array} - Array of paragraph chunk objects
   */
  chunkByParagraph(text) {
    try {
      const chunks = []

      // Validate input
      if (!text || typeof text !== 'string') {
        console.warn('Invalid text input for chunkByParagraph')
        return chunks
      }

      // Clean up text
      const cleanText = text.trim()
      if (cleanText.length === 0) {
        return chunks
      }

      // Split into paragraphs by double newlines
      const paragraphs = cleanText
        .split(/\n\s*\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)

      // Create chunk for each paragraph
      paragraphs.forEach((paragraph, idx) => {
        chunks.push({
          id: `para_${idx}`,
          text: paragraph,
          type: 'paragraph',
          metadata: {
            paragraph: idx,
            paragraphCount: paragraphs.length
          }
        })
      })

      console.log(`✓ Created ${chunks.length} paragraph chunks`)
      return chunks
    } catch (err) {
      console.error('Error in chunkByParagraph:', err)
      return []
    }
  }

  /**
   * Get statistics about chunks
   * Useful for debugging and understanding chunk quality
   * 
   * @param {array} chunks - Array of chunks to analyze
   * @returns {object} - Statistics object
   */
  getChunkStats(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        totalChunks: 0,
        totalCharacters: 0,
        averageChunkSize: 0,
        minChunkSize: 0,
        maxChunkSize: 0,
        byType: {}
      }
    }

    const sizes = chunks.map(c => c.text.length)
    const totalChars = sizes.reduce((sum, size) => sum + size, 0)

    // Count by type
    const byType = {}
    chunks.forEach(chunk => {
      byType[chunk.type] = (byType[chunk.type] || 0) + 1
    })

    return {
      totalChunks: chunks.length,
      totalCharacters: totalChars,
      averageChunkSize: Math.round(totalChars / chunks.length),
      minChunkSize: Math.min(...sizes),
      maxChunkSize: Math.max(...sizes),
      byType
    }
  }

  /**
   * Validate chunks for common quality issues
   * 
   * Checks for:
   * - Chunks starting with lowercase (mid-sentence cuts)
   * - Chunks not ending with sentence terminators
   * - Chunks that are too short
   * 
   * @param {array} chunks - Array of chunk objects to validate
   * @returns {object} - Validation report with issues found
   */
  getChunkValidationReport(chunks) {
    const issues = []

    chunks.forEach((chunk, idx) => {
      const text = chunk.text

      // Issue 1: Starts with lowercase (indicates fragment)
      if (text && text.length > 0 && /^[a-z]/.test(text[0])) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'STARTS_WITH_LOWERCASE',
          text: text.substring(0, 50),
          severity: 'MEDIUM'
        })
      }

      // Issue 2: Doesn't end with . ! or ?
      if (text && text.length > 0 && !/[.!?"]$/.test(text)) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'NO_SENTENCE_TERMINATOR',
          text: text.substring(Math.max(0, text.length - 50)),
          severity: 'MEDIUM'
        })
      }

      // Issue 3: Too short (< 50 chars is probably garbage)
      if (text && text.length < 50) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'TOO_SHORT',
          length: text.length,
          severity: 'LOW'
        })
      }
    })

    // Group issues by severity
    const critical = issues.filter(i => i.severity === 'CRITICAL')
    const high = issues.filter(i => i.severity === 'HIGH')
    const medium = issues.filter(i => i.severity === 'MEDIUM')
    const low = issues.filter(i => i.severity === 'LOW')

    return {
      totalChunks: chunks.length,
      issueCount: issues.length,
      issues: issues,
      bySeverity: {
        critical: critical.length,
        high: high.length,
        medium: medium.length,
        low: low.length
      },
      report: `${issues.length} issues found in ${chunks.length} chunks (${critical.length} critical, ${high.length} high, ${medium.length} medium, ${low.length} low)`,
      isValid: critical.length === 0 && high.length === 0
    }
  }
}
