/**
 * DocumentChunker - Text processing utility for structured documents
 *
 * IMPORTANT: Only use for documents with explicit paragraph structure:
 * - .txt files
 * - .doc/.docx files
 * - .md files
 * - Any format with reliable \n\n paragraph breaks
 *
 * Do NOT use for PDFs - use TokenChunker instead.
 */

export default class DocumentChunker {
  constructor(config = {}) {
    // Maximum paragraph size before splitting (in characters)
    this.maxParagraphSize = config.maxParagraphSize || 5000
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

      // Split on double newlines (paragraph boundaries)
      const paragraphs = cleanText
        .split(/\n\s*\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 0)

      // Process each paragraph
      paragraphs.forEach((paragraph, idx) => {
        // If paragraph exceeds max size, split it by tokens
        if (paragraph.length > this.maxParagraphSize) {
          const subChunks = this._splitOversizedParagraph(paragraph, idx)
          chunks.push(...subChunks)
        } else {
          chunks.push({
            id: `para_${idx}`,
            text: paragraph,
            type: 'paragraph',
            metadata: {
              paragraphIndex: idx,
              totalParagraphs: paragraphs.length
            }
          })
        }
      })

      console.log(`✓ Created ${chunks.length} paragraph chunks from ${paragraphs.length} paragraphs`)
      return chunks
    } catch (err) {
      console.error('Error in chunkByParagraph:', err)
      return []
    }
  }

  /**
   * Split oversized paragraphs into smaller chunks
   * @private
   */
  _splitOversizedParagraph(paragraph, paragraphIndex) {
    const chunks = []
    const targetSize = 1200 // characters
    const overlap = 200 // characters

    let position = 0
    let subIndex = 0

    while (position < paragraph.length) {
      const chunkEnd = Math.min(position + targetSize, paragraph.length)
      let chunkText = paragraph.slice(position, chunkEnd)

      // Try to break at sentence boundary if not at end
      if (chunkEnd < paragraph.length) {
        const lastPeriod = chunkText.lastIndexOf('. ')
        const lastQuestion = chunkText.lastIndexOf('? ')
        const lastExclaim = chunkText.lastIndexOf('! ')
        const lastBreak = Math.max(lastPeriod, lastQuestion, lastExclaim)

        if (lastBreak > chunkText.length * 0.8) {
          chunkText = chunkText.slice(0, lastBreak + 2)
        }
      }

      chunks.push({
        id: `para_${paragraphIndex}_sub_${subIndex}`,
        text: chunkText.trim(),
        type: 'paragraph_split',
        metadata: {
          paragraphIndex,
          subChunkIndex: subIndex,
          isSplit: true
        }
      })

      position += chunkText.length - overlap
      if (chunkText.length === 0) position += targetSize
      subIndex++
    }

    return chunks
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
