/**
 * KeywordSearcher - Search for keywords in document chunks
 *
 * Simple, efficient keyword matching that:
 * - Searches through all chunks for keyword matches
 * - Supports case-insensitive matching
 * - Tracks which keywords matched in each chunk
 * - Returns all chunks containing any of the keywords
 */
export default class KeywordSearcher {
  constructor() {
    this.caseSensitive = false
  }

  /**
   * Search for keywords in chunks
   *
   * @param {array} keywords - Array of keyword strings to search for
   * @param {array} chunks - Array of chunk objects with 'text' property
   * @returns {array} - Chunks that contain any of the keywords, with match metadata
   */
  searchChunks(keywords, chunks) {
    try {
      if (!Array.isArray(keywords) || keywords.length === 0) {
        console.warn('No keywords provided for search')
        return []
      }

      if (!Array.isArray(chunks) || chunks.length === 0) {
        console.warn('No chunks provided for search')
        return []
      }

      console.log(`Searching ${chunks.length} chunks for ${keywords.length} keywords...`)

      const normalizedKeywords = this.caseSensitive
        ? keywords
        : keywords.map(k => k.toLowerCase())

      const matchingChunks = []

      for (const chunk of chunks) {
        if (!chunk.text || typeof chunk.text !== 'string') {
          continue
        }

        const chunkText = this.caseSensitive
          ? chunk.text
          : chunk.text.toLowerCase()

        const matchedKeywords = []

        for (let i = 0; i < keywords.length; i++) {
          const keyword = normalizedKeywords[i]

          if (chunkText.includes(keyword)) {
            matchedKeywords.push({
              term: keywords[i],
              count: this._countOccurrences(chunkText, keyword)
            })
          }
        }

        if (matchedKeywords.length > 0) {
          matchingChunks.push({
            ...chunk,
            keywordMatches: matchedKeywords,
            keywordMatchCount: matchedKeywords.length,
            matchType: 'keyword'
          })
        }
      }

      console.log(`Found ${matchingChunks.length} chunks with keyword matches`)

      const topKeywords = this._getTopMatchedKeywords(matchingChunks, 5)
      if (topKeywords.length > 0) {
        console.log('Top matched keywords:', topKeywords.join(', '))
      }

      return matchingChunks

    } catch (err) {
      console.error('Error searching chunks for keywords:', err)
      return []
    }
  }

  /**
   * Count occurrences of a keyword in text
   * @private
   */
  _countOccurrences(text, keyword) {
    try {
      const regex = new RegExp(this._escapeRegex(keyword), 'gi')
      const matches = text.match(regex)
      return matches ? matches.length : 0
    } catch (err) {
      return 0
    }
  }

  /**
   * Escape special regex characters in keyword
   * @private
   */
  _escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  /**
   * Get top matched keywords from results
   * @private
   */
  _getTopMatchedKeywords(matchingChunks, limit = 5) {
    const keywordCounts = {}

    for (const chunk of matchingChunks) {
      if (!chunk.keywordMatches) continue

      for (const match of chunk.keywordMatches) {
        const term = match.term.toLowerCase()
        keywordCounts[term] = (keywordCounts[term] || 0) + match.count
      }
    }

    return Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([term]) => term)
  }

  /**
   * Filter out chunks that are already in the semantic results
   *
   * @param {array} keywordChunks - Chunks from keyword search
   * @param {array} semanticChunks - Chunks from semantic search
   * @returns {array} - Keyword chunks not in semantic results
   */
  filterDuplicates(keywordChunks, semanticChunks) {
    try {
      if (!Array.isArray(keywordChunks) || keywordChunks.length === 0) {
        return []
      }

      if (!Array.isArray(semanticChunks) || semanticChunks.length === 0) {
        return keywordChunks
      }

      const semanticTexts = new Set(
        semanticChunks.map(chunk => this._normalizeText(chunk.text))
      )

      const uniqueKeywordChunks = keywordChunks.filter(chunk => {
        const normalizedText = this._normalizeText(chunk.text)
        return !semanticTexts.has(normalizedText)
      })

      console.log(
        `Filtered out ${keywordChunks.length - uniqueKeywordChunks.length} duplicate chunks ` +
        `(${uniqueKeywordChunks.length} unique keyword chunks remaining)`
      )

      return uniqueKeywordChunks

    } catch (err) {
      console.error('Error filtering duplicate chunks:', err)
      return keywordChunks
    }
  }

  /**
   * Normalize text for duplicate detection
   * @private
   */
  _normalizeText(text) {
    if (!text || typeof text !== 'string') {
      return ''
    }

    return text
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 200)
  }

  /**
   * Get search statistics
   */
  getSearchStats(keywordChunks) {
    if (!Array.isArray(keywordChunks) || keywordChunks.length === 0) {
      return {
        totalMatches: 0,
        uniqueKeywords: 0,
        topKeywords: []
      }
    }

    const uniqueKeywords = new Set()
    const keywordCounts = {}

    for (const chunk of keywordChunks) {
      if (!chunk.keywordMatches) continue

      for (const match of chunk.keywordMatches) {
        const term = match.term.toLowerCase()
        uniqueKeywords.add(term)
        keywordCounts[term] = (keywordCounts[term] || 0) + match.count
      }
    }

    const topKeywords = Object.entries(keywordCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([term, count]) => ({ term, count }))

    return {
      totalMatches: keywordChunks.length,
      uniqueKeywords: uniqueKeywords.size,
      topKeywords
    }
  }
}
