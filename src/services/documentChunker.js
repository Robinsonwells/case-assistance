/**
 * DocumentChunker - Text processing utility for breaking documents into chunks
 * Supports multiple chunking strategies with overlap for better context preservation
 */
export default class DocumentChunker {
  constructor() {
    // Sentence regex pattern - matches sentences ending with . ! or ?
    this.sentencePattern = /[^.!?]+[.!?]+/g
  }

  /**
   * Hybrid chunking strategy combining paragraphs and sentences with overlap
   * 
   * Strategy: 
   * - First splits document into paragraphs (separated by double newlines)
   * - Then splits each paragraph into sentences
   * - Creates chunks from sentences with configurable overlap
   * - Overlap helps preserve context between chunks for better embeddings
   * 
   * Example with sentenceOverlap=1:
   * Sentences: ["A.", "B.", "C.", "D."]
   * Chunks: ["A. B.", "B. C.", "C. D."]
   * 
   * @param {string} text - Raw document text to chunk
   * @param {number} sentenceOverlap - Number of overlapping sentences between chunks (default: 1)
   * @returns {array} - Array of chunk objects with metadata
   */
  chunkHybrid(text, sentenceOverlap = 1) {
    try {
      const chunks = []

      // Validate input
      if (!text || typeof text !== 'string') {
        console.warn('Invalid text input for chunkHybrid')
        return chunks
      }

      // Clean up text - trim and handle extra whitespace
      const cleanText = text.trim()
      if (cleanText.length === 0) {
        return chunks
      }

      // Split into paragraphs by double newlines
      const paragraphs = cleanText.split(/\n\s*\n+/).filter(p => p.trim().length > 0)

      // Process each paragraph
      paragraphs.forEach((paragraph, paraIdx) => {
        // Clean up paragraph
        const cleanParagraph = paragraph.trim()

        // Split paragraph into sentences
        const sentences = this._extractSentences(cleanParagraph)

        if (sentences.length === 0) {
          // If no sentences found, treat entire paragraph as one chunk
          chunks.push({
            id: `para_${paraIdx}_chunk_0`,
            text: cleanParagraph,
            type: 'paragraph',
            metadata: {
              paragraph: paraIdx,
              sentenceIndex: 0,
              overlapWith: null
            }
          })
          return
        }

        // Create chunks with sentence overlap
        for (let i = 0; i < sentences.length; i++) {
          // Determine start index (go back sentenceOverlap sentences, but not before 0)
          const startIdx = Math.max(0, i - sentenceOverlap)

          // Determine end index (include current sentence and one after if overlap)
          const endIdx = i + 1

          // Extract sentences for this chunk
          const chunkSentences = sentences.slice(startIdx, endIdx)

          // Join sentences with space and trim
          const chunkText = chunkSentences.join(' ').trim()

          // Only add chunk if it has meaningful content
          if (chunkText.length > 0) {
            chunks.push({
              id: `para_${paraIdx}_sent_${i}`,
              text: chunkText,
              type: 'paragraph_sentence',
              metadata: {
                paragraph: paraIdx,
                sentenceIndex: i,
                sentenceCount: sentences.length,
                overlapWith: i > 0 ? `para_${paraIdx}_sent_${i - 1}` : null
              }
            })
          }
        }
      })

      console.log(`Created ${chunks.length} chunks from ${paragraphs.length} paragraphs`)
      return chunks
    } catch (err) {
      console.error('Error in chunkHybrid:', err)
      return []
    }
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

      // Split into paragraphs
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

      console.log(`Created ${chunks.length} paragraph chunks`)
      return chunks
    } catch (err) {
      console.error('Error in chunkByParagraph:', err)
      return []
    }
  }

  /**
   * Extract sentences from text using regex pattern
   * Handles common edge cases
   * 
   * @private
   * @param {string} text - Text to extract sentences from
   * @returns {array} - Array of sentences (strings)
   */
  _extractSentences(text) {
    try {
      if (!text || text.length === 0) {
        return []
      }

      // Use regex to find sentences
      const matches = text.match(this.sentencePattern)

      if (!matches) {
        // No sentence terminators found - return text as single sentence
        return [text.trim()]
      }

      // Clean up sentences - trim whitespace
      return matches
        .map(sentence => sentence.trim())
        .filter(sentence => sentence.length > 0)
    } catch (err) {
      console.error('Error extracting sentences:', err)
      return [text] // Return original text as fallback
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
}
