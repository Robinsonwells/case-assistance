/**
 * DocumentChunker - Text processing utility for breaking documents into chunks
 * Splits ONLY by paragraph boundaries (double newlines)
 */

export default class DocumentChunker {
  constructor() {
    // Pattern for spaced ellipses in legal documents (e.g., ". . ." or " . . . ")
    this.ellipsisPattern = /(\s*\.\s+){2,}/g
  }

  /**
   * Simple paragraph-based chunking
   * Splits document by paragraph boundaries only (double newlines)
   *
   * @param {string} text - Raw document text to chunk
   * @returns {array} - Array of paragraph chunk objects
   */
  chunkByParagraph(text) {
    try {
      const chunks = []

      if (!text || typeof text !== 'string') {
        console.warn('Invalid text input for chunkByParagraph')
        return chunks
      }

      const cleanText = text.trim()
      if (cleanText.length === 0) {
        return chunks
      }

      const paragraphs = cleanText
        .split(/\n\s*\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)

      const mergedParagraphs = this._mergeHeadingsWithContent(paragraphs)

      mergedParagraphs.forEach((paragraph, idx) => {
        chunks.push({
          id: `para_${idx}`,
          text: paragraph,
          type: 'paragraph',
          metadata: {
            paragraph: idx,
            paragraphCount: mergedParagraphs.length
          }
        })
      })

      console.log(`✓ Created ${chunks.length} paragraph chunks (merged from ${paragraphs.length} raw paragraphs)`)
      return chunks
    } catch (err) {
      console.error('Error in chunkByParagraph:', err)
      return []
    }
  }

  /**
   * Merge orphaned section headings with following content
   * @private
   * @param {Array<string>} paragraphs - Raw paragraphs
   * @returns {Array<string>} - Merged paragraphs
   */
  _mergeHeadingsWithContent(paragraphs) {
    const merged = []
    let i = 0

    while (i < paragraphs.length) {
      const para = paragraphs[i]

      const isHeading = this._isHeadingLike(para)

      if (isHeading && i + 1 < paragraphs.length) {
        const nextPara = paragraphs[i + 1]
        merged.push(`${para}\n\n${nextPara}`)
        i += 2
      } else {
        merged.push(para)
        i++
      }
    }

    return merged
  }

  /**
   * Check if a paragraph looks like a heading
   * @private
   * @param {string} text - Text to check
   * @returns {boolean} - True if looks like a heading
   */
  _isHeadingLike(text) {
    if (!text || text.length === 0) return false

    if (text.length > 100) return false

    if (/^[A-Z\s]+$/.test(text) && text.length < 50) {
      return true
    }

    if (/^[A-Z][A-Za-z\s]+$/.test(text) && text.length < 80 && !/[.!?]$/.test(text)) {
      return true
    }

    const romanNumeralPattern = /^[IVX]+\.\s+[A-Z]/
    if (romanNumeralPattern.test(text) && text.length < 80) {
      return true
    }

    return false
  }

  /**
   * Get statistics about chunks
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
   */
  getChunkValidationReport(chunks) {
    const issues = []

    chunks.forEach((chunk, idx) => {
      const text = chunk.text

      // Issue 1: Starts with lowercase
      if (text && text.length > 0 && /^[a-z]/.test(text[0])) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'STARTS_WITH_LOWERCASE',
          text: text.substring(0, 50),
          severity: 'MEDIUM'
        })
      }

      // Issue 2: Doesn't end with punctuation
      if (text && text.length > 0 && !/[.!?"]$/.test(text)) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'NO_SENTENCE_TERMINATOR',
          text: text.substring(Math.max(0, text.length - 50)),
          severity: 'MEDIUM'
        })
      }

      // Issue 3: Too short
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
