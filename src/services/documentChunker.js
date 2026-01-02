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
   * Hybrid chunking strategy with sentence-based semantic paragraph boundaries
   *
   * Strategy:
   * - Never cuts mid-sentence (sentence boundaries only)
   * - Respects paragraph boundaries (natural semantic breaks)
   * - Small paragraphs (1-2 sentences): Buffered and merged with next paragraph
   * - Just-right paragraphs (3-5 sentences): Kept as single intact chunk
   * - Large paragraphs (6+ sentences): Sliding window with overlap
   *
   * Sliding Window for Large Paragraphs:
   * - Window Size: sentenceWindowSize sentences (default: 6)
   * - Overlap: sentenceOverlap sentences (default: 2)
   * - Step: windowSize - overlap (e.g., 6 - 2 = 4)
   *
   * @param {string} text - Raw document text to chunk
   * @param {number} sentenceWindowSize - Number of sentences per chunk for large paragraphs (default: 6)
   * @param {number} sentenceOverlap - Number of overlapping sentences between chunks (default: 2)
   * @returns {array} - Array of chunk objects with metadata
   */
  chunkHybrid(text, sentenceWindowSize = 6, sentenceOverlap = 2) {
    try {
      const chunks = []

      // Validate input
      if (!text || typeof text !== 'string') {
        console.warn('Invalid text input for chunkHybrid')
        return chunks
      }

      // Attach headers to content as context prefixes
      const processedText = this._attachHeadersToContent(text.trim())
      if (processedText.length === 0) {
        return chunks
      }

      // Split into paragraphs by double newlines
      const paragraphs = processedText.split(/\n\s*\n+/).filter(p => p.trim().length > 0)

      console.log(`Processing ${paragraphs.length} paragraphs with sentence-based semantic boundaries`)

      // Process each paragraph with buffering logic
      let paraIdx = 0
      while (paraIdx < paragraphs.length) {
        const paragraph = paragraphs[paraIdx].trim()

        // Skip empty paragraphs
        if (paragraph.length === 0) {
          console.warn(`Skipping empty paragraph at index ${paraIdx}`)
          paraIdx++
          continue
        }

        // Extract sentences from current paragraph
        const sentences = this._extractSentences(paragraph)

        if (sentences.length === 0) {
          console.warn(`No sentences extracted from paragraph ${paraIdx}, treating as single chunk`)
          chunks.push({
            id: `para_${paraIdx}_chunk_0`,
            text: paragraph,
            type: 'empty_sentence_fallback',
            metadata: {
              paragraph: paraIdx,
              chunkIndex: 0,
              sentenceStart: 0,
              sentenceEnd: 0,
              sentenceCount: 0,
              isBuffered: false,
              overlapWith: null
            }
          })
          paraIdx++
          continue
        }

        // RULE 1: Small Paragraph (1-2 sentences) - Buffer and merge with next
        if (sentences.length <= 2) {
          console.log(`Small paragraph detected (${sentences.length} sentences) at index ${paraIdx}, buffering...`)

          // Check if there's a next paragraph to merge with
          if (paraIdx + 1 < paragraphs.length) {
            const nextParagraph = paragraphs[paraIdx + 1].trim()
            const nextSentences = this._extractSentences(nextParagraph)

            // Merge current and next paragraph sentences
            const mergedSentences = [...sentences, ...nextSentences]
            console.log(`  → Merging with next paragraph: ${sentences.length} + ${nextSentences.length} = ${mergedSentences.length} sentences`)

            // Chunk the merged result with sliding window
            const mergedChunks = this._chunkSlidingWindow(
              mergedSentences,
              paraIdx,
              sentenceWindowSize,
              sentenceOverlap,
              true // isBuffered = true
            )
            chunks.push(...mergedChunks)

            // Skip next paragraph since we merged it
            paraIdx += 2
          } else {
            // Last paragraph is small - emit as single chunk
            console.log(`  → Last paragraph is small, emitting as single chunk`)
            chunks.push({
              id: `para_${paraIdx}_chunk_0`,
              text: sentences.join(' ').trim(),
              type: 'small_paragraph_last',
              metadata: {
                paragraph: paraIdx,
                chunkIndex: 0,
                sentenceStart: 0,
                sentenceEnd: sentences.length - 1,
                sentenceCount: sentences.length,
                isBuffered: false,
                overlapWith: null
              }
            })
            paraIdx++
          }
        }
        // RULE 2: Just-Right Paragraph (3-5 sentences) - Keep as single chunk
        else if (sentences.length >= 3 && sentences.length <= 5) {
          console.log(`Just-right paragraph (${sentences.length} sentences) at index ${paraIdx}, keeping intact`)
          chunks.push({
            id: `para_${paraIdx}_chunk_0`,
            text: paragraph,
            type: 'single_paragraph',
            metadata: {
              paragraph: paraIdx,
              chunkIndex: 0,
              sentenceStart: 0,
              sentenceEnd: sentences.length - 1,
              sentenceCount: sentences.length,
              isBuffered: false,
              overlapWith: null
            }
          })
          paraIdx++
        }
        // RULE 3: Large Paragraph (6+ sentences) - Apply sliding window
        else {
          console.log(`Large paragraph (${sentences.length} sentences) at index ${paraIdx}, applying sliding window`)
          const largeChunks = this._chunkSlidingWindow(
            sentences,
            paraIdx,
            sentenceWindowSize,
            sentenceOverlap,
            false // isBuffered = false
          )
          chunks.push(...largeChunks)
          paraIdx++
        }
      }

      console.log(`Created ${chunks.length} chunks from ${paragraphs.length} paragraphs using semantic boundaries`)
      return chunks
    } catch (err) {
      console.error('Error in chunkHybrid:', err)
      return []
    }
  }

  /**
   * Apply sliding window chunking to a list of sentences
   *
   * Creates overlapping chunks to preserve context between boundaries.
   * For example, with windowSize=6 and overlap=2:
   * - Chunk 1: sentences[0:6]
   * - Chunk 2: sentences[4:10] (overlaps with 2 sentences from Chunk 1)
   * - Chunk 3: sentences[8:14]
   *
   * @private
   * @param {array} sentences - Array of sentence strings
   * @param {number} paraIdx - Paragraph index for metadata
   * @param {number} windowSize - Number of sentences per chunk (default: 6)
   * @param {number} overlap - Number of overlapping sentences (default: 2)
   * @param {boolean} isBuffered - Whether this is from a merged small paragraph (default: false)
   * @returns {array} - Array of chunk objects
   */
  _chunkSlidingWindow(sentences, paraIdx, windowSize = 6, overlap = 2, isBuffered = false) {
    const chunks = []
    let step = windowSize - overlap

    // Validate step is positive
    if (step <= 0) {
      console.error(`Invalid window configuration: windowSize=${windowSize}, overlap=${overlap}. Step must be positive.`)
      // Fallback: use no overlap
      overlap = 0
      step = windowSize
    }

    let chunkIdx = 0
    for (let i = 0; i < sentences.length; i += step) {
      const endIdx = Math.min(i + windowSize, sentences.length)
      const chunkSentences = sentences.slice(i, endIdx)
      const chunkText = chunkSentences.join(' ').trim()

      // Determine if this chunk overlaps with previous
      const overlapWith = i > 0 ? `para_${paraIdx}_chunk_${chunkIdx - 1}` : null

      chunks.push({
        id: `para_${paraIdx}_chunk_${chunkIdx}`,
        text: chunkText,
        type: isBuffered ? 'merged_small_paragraphs' : 'paragraph_chunk',
        metadata: {
          paragraph: paraIdx,
          chunkIndex: chunkIdx,
          sentenceStart: i,
          sentenceEnd: endIdx - 1,
          sentenceCount: chunkSentences.length,
          isBuffered: isBuffered,
          overlapWith: overlapWith
        }
      })

      chunkIdx++

      // Stop if we've reached the end
      if (endIdx >= sentences.length) {
        break
      }
    }

    console.log(`  → Created ${chunks.length} chunks from ${sentences.length} sentences (window=${windowSize}, overlap=${overlap})`)
    return chunks
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
   * Attach legal document headers to following content as context prefixes
   *
   * Headers like case numbers, page numbers, and document metadata are preserved
   * by prepending them to the content that follows as compact prefixes.
   *
   * Example transformation:
   *   Before: "No. 12-3834\nPage 3\nPlaintiff's job required..."
   *   After: "[No. 12-3834 | Page 3] Plaintiff's job required..."
   *
   * @private
   * @param {string} text - Raw document text
   * @returns {string} - Text with headers attached as context prefixes
   */
  _attachHeadersToContent(text) {
    if (!text || text.length === 0) {
      return ''
    }

    const lines = text.split('\n')
    const result = []
    let currentHeader = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed.length === 0) {
        result.push(line)
        continue
      }

      const isHeader = this._isLegalHeader(trimmed)

      if (isHeader) {
        currentHeader.push(trimmed)
      } else {
        if (currentHeader.length > 0) {
          const headerPrefix = `[${currentHeader.join(' | ')}] `
          result.push(headerPrefix + line)
          currentHeader = []
        } else {
          result.push(line)
        }
      }
    }

    if (currentHeader.length > 0) {
      result.push(`[${currentHeader.join(' | ')}]`)
    }

    return result.join('\n')
  }

  /**
   * Determine if a line is a legal document header/metadata
   *
   * Recognizes common patterns:
   * - Case numbers (e.g., "No. 12-3834", "Case No. 2023-1234")
   * - Page numbers (e.g., "Page 3", "Page 12 of 45")
   * - Court identifiers (e.g., "UNITED STATES COURT OF APPEALS")
   * - Case names (e.g., "Smith v. Jones")
   * - Date stamps (e.g., "Filed: January 1, 2023")
   *
   * @private
   * @param {string} line - Trimmed line to check
   * @returns {boolean} - True if line appears to be a header
   */
  _isLegalHeader(line) {
    if (!line || line.length === 0) {
      return false
    }

    const headerPatterns = [
      /^No\.\s+\d{2,4}-\d{2,4}$/i,
      /^Case\s+No\.\s+[\d-]+$/i,
      /^Page\s+\d+(\s+of\s+\d+)?$/i,
      /^\d+$/,
      /^[A-Z\s]+COURT[A-Z\s]*$/,
      /^UNITED STATES/i,
      /^IN THE [A-Z\s]+ COURT/i,
      /^Filed:\s+/i,
      /^Decided:\s+/i,
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,
      /^[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+.*Plan$/,
      /^\d{2,4}-\d{2,4}$/
    ]

    for (const pattern of headerPatterns) {
      if (pattern.test(line)) {
        return true
      }
    }

    if (line.length < 100 && line === line.toUpperCase() && /^[A-Z\s.,'-]+$/.test(line)) {
      return true
    }

    return false
  }

  /**
   * Extract metadata prefix from chunk text
   *
   * If the chunk starts with a header prefix like "[No. 12-3834 | Page 3]",
   * this extracts it and returns both the metadata and clean content.
   *
   * @param {string} text - Chunk text that may contain metadata prefix
   * @returns {object} - {metadata: string|null, content: string, full: string}
   */
  extractMetadata(text) {
    if (!text || typeof text !== 'string') {
      return { metadata: null, content: text || '', full: text || '' }
    }

    const metadataMatch = text.match(/^\[(.*?)\]\s+/)

    if (metadataMatch) {
      const metadata = metadataMatch[1]
      const content = text.replace(/^\[.*?\]\s+/, '')

      return {
        metadata: metadata,
        content: content,
        full: text
      }
    }

    return {
      metadata: null,
      content: text,
      full: text
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
   * Get detailed chunking strategy statistics
   * Shows how the semantic paragraph boundary strategy was applied
   *
   * Provides insights into:
   * - How many chunks were created by each rule (small, just-right, large)
   * - How many chunks are from buffered/merged paragraphs
   * - Sentence count distribution
   * - Overlap statistics
   *
   * @param {array} chunks - Array of chunks to analyze
   * @returns {object} - Detailed strategy statistics
   */
  getChunkingStrategy(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        totalChunks: 0,
        strategy: 'Sentence-based with semantic paragraph boundaries',
        byType: {},
        byBuffered: { buffered: 0, direct: 0 },
        sentenceStats: {},
        overlapStats: {}
      }
    }

    // Count by type
    const byType = {}
    chunks.forEach(chunk => {
      byType[chunk.type] = (byType[chunk.type] || 0) + 1
    })

    // Count buffered vs direct chunks
    const byBuffered = { buffered: 0, direct: 0 }
    chunks.forEach(chunk => {
      if (chunk.metadata && chunk.metadata.isBuffered) {
        byBuffered.buffered++
      } else {
        byBuffered.direct++
      }
    })

    // Sentence count statistics
    const sentenceCounts = chunks
      .filter(c => c.metadata && typeof c.metadata.sentenceCount === 'number')
      .map(c => c.metadata.sentenceCount)

    const sentenceStats = sentenceCounts.length > 0 ? {
      total: sentenceCounts.reduce((sum, count) => sum + count, 0),
      average: Math.round((sentenceCounts.reduce((sum, count) => sum + count, 0) / sentenceCounts.length) * 10) / 10,
      min: Math.min(...sentenceCounts),
      max: Math.max(...sentenceCounts),
      distribution: this._getDistribution(sentenceCounts)
    } : {}

    // Overlap statistics
    const overlappingChunks = chunks.filter(c => c.metadata && c.metadata.overlapWith !== null)
    const overlapStats = {
      totalOverlapping: overlappingChunks.length,
      totalNonOverlapping: chunks.length - overlappingChunks.length,
      overlapPercentage: Math.round((overlappingChunks.length / chunks.length) * 100)
    }

    return {
      totalChunks: chunks.length,
      strategy: 'Sentence-based with semantic paragraph boundaries',
      byType,
      byBuffered,
      sentenceStats,
      overlapStats,
      rules: {
        small: 'Paragraphs with 1-2 sentences are buffered and merged with next paragraph',
        justRight: 'Paragraphs with 3-5 sentences are kept as single intact chunks',
        large: 'Paragraphs with 6+ sentences use sliding window (6 sentences, 2 overlap)'
      }
    }
  }

  /**
   * Get distribution of values (for statistics)
   *
   * @private
   * @param {array} values - Array of numbers to analyze
   * @returns {object} - Distribution object with counts
   */
  _getDistribution(values) {
    const distribution = {}
    values.forEach(val => {
      distribution[val] = (distribution[val] || 0) + 1
    })
    return distribution
  }
}
