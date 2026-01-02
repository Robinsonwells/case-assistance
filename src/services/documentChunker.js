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
   * - Just-right paragraphs (3-7 sentences): Kept as single intact chunk
   * - Large paragraphs (8+ sentences): Sliding window with overlap
   *
   * Sliding Window for Large Paragraphs:
   * - Window Size: sentenceWindowSize sentences (default: 8)
   * - Overlap: sentenceOverlap sentences (default: 2)
   * - Step: windowSize - overlap (e.g., 8 - 2 = 6)
   *
   * @param {string} text - Raw document text to chunk
   * @param {number} sentenceWindowSize - Number of sentences per chunk for large paragraphs (default: 8)
   * @param {number} sentenceOverlap - Number of overlapping sentences between chunks (default: 2)
   * @returns {array} - Array of chunk objects with metadata
   */
  chunkHybrid(text, sentenceWindowSize = 8, sentenceOverlap = 2) {
    try {
      const chunks = []

      // Validate input
      if (!text || typeof text !== 'string') {
        console.warn('Invalid text input for chunkHybrid')
        return chunks
      }

      // STEP 1: Strip headers entirely (don't preserve inline)
      const cleanedText = this._stripLegalHeaders(text.trim())
      if (cleanedText.length === 0) {
        return chunks
      }

      // STEP 2: Split into paragraphs by double newlines
      const paragraphs = cleanedText.split(/\n\s*\n+/).filter(p => p.trim().length > 0)

      console.log(`Processing ${paragraphs.length} paragraphs with per-paragraph sliding windows`)

      let chunkIndex = 0
      const step = sentenceWindowSize - sentenceOverlap

      for (let paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
        let paragraph = paragraphs[paraIdx].trim()

        // Skip empty paragraphs
        if (paragraph.length === 0) continue

        // ORPHAN RESCUE: Check if this is a fragment that should be merged
        if (this._isFragmentParagraph(paragraph)) {
          console.log(`  ⚠️  Fragment para ${paraIdx}: "${paragraph.substring(0, 50)}..."`)

          // Look ahead and merge with next paragraph(s) until we find a complete one
          let mergedText = paragraph
          let lookAhead = 1

          while (paraIdx + lookAhead < paragraphs.length) {
            const nextPara = paragraphs[paraIdx + lookAhead].trim()

            if (nextPara.length === 0) {
              lookAhead++
              continue
            }

            // Merge fragment with next paragraph
            mergedText = (mergedText + ' ' + nextPara).trim()

            // If next paragraph is NOT a fragment, we're done merging
            if (!this._isFragmentParagraph(nextPara)) {
              console.log(`  ✓ Merged with para ${paraIdx + lookAhead}`)
              break
            }

            lookAhead++
          }

          // Skip all merged paragraphs
          paraIdx += (lookAhead - 1)
          paragraph = mergedText
        }

        // Extract sentences from current paragraph
        const sentences = this._extractSentences(paragraph)

        if (sentences.length === 0) continue

        console.log(`  Para ${paraIdx}: ${sentences.length} sentences`)

        // APPLY SLIDING WINDOW PER PARAGRAPH (not global buffer)
        for (let i = 0; i < sentences.length; i += step) {
          const endIdx = Math.min(i + sentenceWindowSize, sentences.length)
          const chunkSentences = sentences.slice(i, endIdx)
          let chunkText = chunkSentences.join(' ').trim()

          // CRITICAL: Validate and fix sentence boundaries
          chunkText = this._fixSentenceBoundaries(chunkText, chunkIndex === 0)

          // Only add if chunk is valid
          if (chunkText.length > 0) {
            chunks.push({
              id: `chunk_${chunkIndex}`,
              text: chunkText,
              type: 'paragraph_chunk',
              metadata: {
                paragraph: paraIdx,
                chunkIndex: chunkIndex,
                sentenceStart: i,
                sentenceEnd: endIdx - 1,
                sentenceCount: chunkSentences.length,
                overlapWith: i > 0 ? `chunk_${chunkIndex - 1}` : null
              }
            })

            console.log(`    → Chunk ${chunkIndex} (${chunkSentences.length} sentences)`)
            chunkIndex++
          }

          // If we've reached the end of sentences, break
          if (endIdx >= sentences.length) break
        }
      }

      console.log(`✓ Created ${chunks.length} chunks from ${paragraphs.length} paragraphs`)
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
   * Strip legal document headers entirely from text
   *
   * Removes header-only lines (case numbers, page numbers, etc.) to prevent
   * them from polluting chunks and breaking sentence boundaries.
   *
   * Example transformation:
   *   Before: "No. 12-3834\nPage 3\nPlaintiff's job required..."
   *   After: "Plaintiff's job required..."
   *
   * @private
   * @param {string} text - Raw document text
   * @returns {string} - Text with headers completely removed
   */
  _stripLegalHeaders(text) {
    if (!text || text.length === 0) {
      return ''
    }

    let cleaned = text
      .split('\n')
      .filter(line => {
        const trimmed = line.trim()

        // Skip empty lines (we'll handle them later)
        if (trimmed.length === 0) {
          return true
        }

        // Remove ENTIRE lines that are ONLY headers
        const isHeaderLine = this._isLegalHeader(trimmed)

        return !isHeaderLine
      })
      .join('\n')

    // Remove mid-line page citations: " No. 12-3834 ... Page X " between sentences
    cleaned = cleaned.replace(/\s+No\.\s+\d{2,4}-\d{4}[^\n.!?]*?Page\s+\d+\s+/g, ' ')

    // Remove standalone page markers mid-text
    cleaned = cleaned.replace(/\s+Page\s+\d+\s+/g, ' ')

    // Reduce multiple blank lines to single blank line
    cleaned = cleaned.replace(/\n\s*\n\s*\n+/g, '\n\n')

    // Clean up multiple spaces
    cleaned = cleaned.replace(/  +/g, ' ')

    return cleaned.trim()
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
      // Case numbers (relaxed - match anywhere in line)
      /No\.\s+\d{2,4}-\d{2,4}/i,
      /Case\s+No\.\s+[\d-]+/i,
      /^\d{2,4}-\d{2,4}$/,

      // Full case name patterns (e.g., "Javery v. Lucent Tech., Inc. Long Term Disability Plan")
      /^[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+.*Plan$/,
      /v\.\s+[A-Z][a-z]+.*(?:Plan|Inc\.|Corp\.|LLC)$/,

      // Page numbers
      /^Page\s+\d+/i,
      /^\d+$/,

      // Court identifiers
      /^[A-Z\s]+COURT[A-Z\s]*$/,
      /^UNITED STATES/i,
      /^IN THE [A-Z\s]+ COURT/i,

      // Dates
      /^Filed:\s+/i,
      /^Decided:\s+/i,
      /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/,

      // Section headers
      /^(BACKGROUND|OPINION|STANDARD OF REVIEW|CONCLUSION|FACTS|ANALYSIS|DISCUSSION)$/i
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
   * Detects paragraph fragments that should be merged with adjacent paragraphs
   *
   * Fragments are incomplete text units caused by:
   * - PDF page breaks splitting sentences
   * - Legal citations split across lines
   * - Weird formatting (". . . text . . .")
   * - Mid-sentence continuations
   *
   * Detection criteria:
   * 1. Too short (< 80 chars) - likely incomplete
   * 2. Starts with lowercase or punctuation - continuation from previous page
   * 3. Doesn't end with sentence terminator - incomplete sentence
   * 4. Incomplete citation like "(Admin. R." or "[his]"
   * 5. Weird ellipsis formatting ". . . text . . ."
   *
   * @private
   * @param {string} text - Paragraph text to check
   * @returns {boolean} - True if paragraph is a fragment
   */
  _isFragmentParagraph(text) {
    if (!text || text.length === 0) {
      return false
    }

    const trimmed = text.trim()

    // 1. Too short - likely incomplete (unless it's a proper short sentence)
    if (trimmed.length < 80 && !/^[A-Z].*[.!?]$/.test(trimmed)) {
      return true
    }

    // 2. Starts with lowercase - continuation from previous page
    // Example: "supporting [Lucent] employees and consultants..."
    if (/^[a-z]/.test(trimmed)) {
      return true
    }

    // 3. Starts with punctuation (excluding valid opening like quotes)
    // Example: ". . disability . . . from engaging..."
    if (/^[.,;:()\[\]]/.test(trimmed)) {
      return true
    }

    // 4. Doesn't end with sentence terminator
    // Exception: Allow if it's a proper bullet point or numbered list
    if (!/[.!?"]$/.test(trimmed) && !/^\d+\./.test(trimmed)) {
      return true
    }

    // 5. Incomplete citation patterns
    // Example: "(Admin. R." or "(Admin. R. at" or "[his]"
    if (/\(Admin\.\s+R\.\s*$/.test(trimmed) || /\(Admin\.\s+R\.\s+at\s*$/.test(trimmed)) {
      return true
    }

    // 6. Weird ellipsis formatting common in legal docs
    // Example: ". . disability . . ." or ". . . from engaging . . ."
    if (/^\.\s+\.\s+/.test(trimmed) || /\.\s+\.\s+\.$/.test(trimmed)) {
      return true
    }

    // 7. Ends with incomplete bracket or parenthesis reference
    // Example: "...as defined in the Plan ("
    if (/\($/.test(trimmed) || /\[$/.test(trimmed)) {
      return true
    }

    return false
  }

  /**
   * CRITICAL: Ensure chunks start with uppercase and end with sentence terminator
   *
   * Validates and repairs sentence boundaries to prevent mid-sentence cuts.
   * A proper chunk must:
   * 1. Start with uppercase letter or digit (never lowercase)
   * 2. End with . ! or ? (proper sentence terminator)
   *
   * @private
   * @param {string} chunkText - Raw chunk text
   * @param {boolean} isFirstChunk - If true, allows some leniency
   * @returns {string} - Fixed chunk text with valid boundaries
   */
  _fixSentenceBoundaries(chunkText, isFirstChunk = false) {
    if (!chunkText || chunkText.length === 0) {
      return ''
    }

    // Trim whitespace
    chunkText = chunkText.trim()

    // CHECK START: Chunk should start with uppercase letter or digit
    const firstChar = chunkText[0]
    if (!isFirstChunk && /^[a-z]/.test(firstChar)) {
      // PROBLEM: Chunk starts with lowercase - this is a mid-sentence cut
      console.warn(
        `⚠️  Chunk starts with lowercase '${firstChar}': "${chunkText.substring(0, 50)}..."`
      )

      // Find the last sentence-ending punctuation before this point
      const lastPeriodIdx = chunkText.lastIndexOf('.')
      const lastExclamIdx = chunkText.lastIndexOf('!')
      const lastQuestIdx = chunkText.lastIndexOf('?')
      const lastSentenceEnd = Math.max(lastPeriodIdx, lastExclamIdx, lastQuestIdx)

      if (lastSentenceEnd > 0) {
        // Rewind: keep only complete sentences
        chunkText = chunkText.substring(0, lastSentenceEnd + 1).trim()
        console.log(`   ✓ Rewound to last sentence boundary`)
      } else {
        // No sentence boundary found - this chunk is corrupt
        console.error('   ✗ No sentence boundary found. Discarding chunk.')
        return ''
      }
    }

    // CHECK END: Chunk should end with . ! or ?
    const lastChar = chunkText[chunkText.length - 1]
    if (!/[.!?]$/.test(lastChar)) {
      // PROBLEM: Chunk doesn't end with sentence terminator
      console.warn(`⚠️  Chunk ends with '${lastChar}', not punctuation`)

      // Find the last sentence-ending punctuation
      const lastPeriodIdx = chunkText.lastIndexOf('.')
      const lastExclamIdx = chunkText.lastIndexOf('!')
      const lastQuestIdx = chunkText.lastIndexOf('?')
      const lastSentenceEnd = Math.max(lastPeriodIdx, lastExclamIdx, lastQuestIdx)

      if (lastSentenceEnd > chunkText.length * 0.5) {
        // If the last sentence ends more than halfway through, use it
        chunkText = chunkText.substring(0, lastSentenceEnd + 1).trim()
        console.log(`   ✓ Trimmed to last sentence boundary`)
      } else {
        // Otherwise, add a period (incomplete sentence, but salvageable)
        console.warn('   ⚠️  Adding period to incomplete sentence')
        chunkText = chunkText + '.'
      }
    }

    // CHECK: Detect incomplete sentence patterns
    // Pattern: "...fast-paced and it involved Under the terms" (lowercase to uppercase = sentence break)
    const sentences = chunkText.match(/[^.!?]+[.!?]/g) || []

    if (sentences.length > 1) {
      const lastSentence = sentences[sentences.length - 1].trim()

      // Check if last sentence has incomplete structure
      // E.g., ends with preposition or ends with lowercase followed by uppercase
      if (
        /\s(in|of|to|and|or|with|from|at|by|as|because|that|which|who)\s*[.!?]$/.test(lastSentence) ||
        /[a-z]\s+[A-Z]/.test(lastSentence.substring(Math.max(0, lastSentence.length - 30)))
      ) {
        console.warn(`⚠️  Last sentence looks incomplete: "${lastSentence.substring(0, 50)}..."`)

        // Remove the last sentence entirely
        chunkText = sentences.slice(0, -1).join(' ').trim()

        if (chunkText.length < 50) {
          console.warn('   ✗ Chunk too small after removing incomplete sentence. Discarding.')
          return ''
        }
      }
    }

    // CRITICAL: Strip trailing headers that leaked through
    // Common pattern: "...sentence. No. 12-3834 Javery v. Lucent Tech., Inc."
    const trailingHeaderPatterns = [
      /\s+No\.\s+\d{2,4}-\d{4}.*$/i,
      /\s+\d{2,4}-\d{4}.*$/,
      /\s+Page\s+\d+.*$/i,
      /\s+[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+.*$/
    ]

    for (const pattern of trailingHeaderPatterns) {
      if (pattern.test(chunkText)) {
        const beforeStrip = chunkText
        chunkText = chunkText.replace(pattern, '').trim()

        // If we stripped something, make sure chunk still ends with punctuation
        if (chunkText !== beforeStrip) {
          console.log(`   ✓ Stripped trailing header`)

          if (!/[.!?]$/.test(chunkText)) {
            // Find last punctuation after stripping
            const lastPeriodIdx = chunkText.lastIndexOf('.')
            const lastExclamIdx = chunkText.lastIndexOf('!')
            const lastQuestIdx = chunkText.lastIndexOf('?')
            const lastSentenceEnd = Math.max(lastPeriodIdx, lastExclamIdx, lastQuestIdx)

            if (lastSentenceEnd > 0) {
              chunkText = chunkText.substring(0, lastSentenceEnd + 1).trim()
            }
          }
        }
        break // Only apply first matching pattern
      }
    }

    // FINAL CHECK: Minimum viable chunk size
    const MIN_CHUNK_SIZE = 80
    if (chunkText.length < MIN_CHUNK_SIZE) {
      console.warn(`⚠️  Chunk too small after fixes (${chunkText.length} chars). Discarding.`)
      return ''
    }

    return chunkText
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
        justRight: 'Paragraphs with 3-7 sentences are kept as single intact chunks',
        large: 'Paragraphs with 8+ sentences use sliding window (8 sentences, 2 overlap)'
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

  /**
   * Validate chunks for common quality issues
   *
   * Checks for:
   * - Chunks starting with lowercase (mid-sentence cuts)
   * - Chunks not ending with sentence terminators
   * - Chunks containing headers
   * - Chunks that are too short
   *
   * @param {array} chunks - Array of chunk objects to validate
   * @returns {object} - Validation report with issues found
   */
  getChunkValidationReport(chunks) {
    const issues = []

    chunks.forEach((chunk, idx) => {
      const text = chunk.text

      // Issue 1: Starts with lowercase (indicates mid-sentence cut)
      if (text && text.length > 0 && /^[a-z]/.test(text[0])) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'STARTS_WITH_LOWERCASE',
          text: text.substring(0, 50),
          severity: 'CRITICAL'
        })
      }

      // Issue 2: Doesn't end with . ! or ?
      if (text && text.length > 0 && !/[.!?]$/.test(text)) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'NO_SENTENCE_TERMINATOR',
          text: text.substring(Math.max(0, text.length - 50)),
          severity: 'HIGH'
        })
      }

      // Issue 3: Contains mid-line page headers (shouldn't happen after stripping)
      if (text && /No\.\s+\d{2,4}-\d{4}/.test(text)) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'CONTAINS_HEADER',
          severity: 'HIGH'
        })
      }

      // Issue 4: Too short (< 50 chars is probably garbage)
      if (text && text.length < 50) {
        issues.push({
          chunkId: chunk.id,
          chunkIndex: idx,
          issue: 'TOO_SHORT',
          length: text.length,
          severity: 'MEDIUM'
        })
      }
    })

    // Group issues by severity
    const critical = issues.filter(i => i.severity === 'CRITICAL')
    const high = issues.filter(i => i.severity === 'HIGH')
    const medium = issues.filter(i => i.severity === 'MEDIUM')

    return {
      totalChunks: chunks.length,
      issueCount: issues.length,
      issues: issues,
      bySeverity: {
        critical: critical.length,
        high: high.length,
        medium: medium.length
      },
      report: `${issues.length} issues found in ${chunks.length} chunks (${critical.length} critical, ${high.length} high, ${medium.length} medium)`,
      isValid: critical.length === 0 && high.length === 0
    }
  }
}
