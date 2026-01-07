import PerplexityAPI from './perplexityAPI'

/**
 * KeywordExtractor - Extract keywords and variations from user questions
 *
 * Uses Perplexity API to intelligently identify:
 * - Main concepts and keywords in the user's question
 * - General synonyms and variations for each keyword
 * - Domain-specific terminology when appropriate
 *
 * This enables robust keyword search that catches chunks semantic search might miss
 */
export default class KeywordExtractor {
  constructor() {
    this.perplexityAPI = new PerplexityAPI()
    this.timeout = 10000
  }

  /**
   * Extract keywords and their variations from a question
   *
   * @param {string} question - User's question
   * @returns {Promise<object>} - {keywords: [{term, variations}], error: null}
   */
  async extractKeywords(question) {
    try {
      if (!question || typeof question !== 'string' || question.trim().length === 0) {
        throw new Error('Question must be a non-empty string')
      }

      console.log('Extracting keywords from question:', question)

      const prompt = `You are a keyword extraction expert. Analyze the following question and extract the main keywords and concepts.

For each keyword, provide general synonyms and variations that someone might use when asking about the same concept.

Question: "${question}"

Return your response as a JSON object with this exact structure:
{
  "keywords": [
    {
      "term": "main keyword",
      "variations": ["synonym1", "synonym2", "variation1"]
    }
  ]
}

Rules:
1. Extract 3-7 main keywords or phrases from the question
2. For each keyword, provide 2-5 general synonyms or variations
3. Include both the singular and plural forms when relevant
4. Include common abbreviations when relevant
5. Focus on the core concepts being asked about
6. Keep it simple - don't over-engineer
7. Return ONLY the JSON object, nothing else

Examples:
- "pain" → ["discomfort", "ache", "painful", "hurting"]
- "medication" → ["medicine", "drug", "prescription", "treatment"]
- "eligibility" → ["eligible", "qualification", "entitled", "qualify"]
- "insurance coverage" → ["coverage", "insurance", "covered", "benefits"]`

      const answer = await this.perplexityAPI.querySimple(prompt)

      const parsed = this._parseKeywordResponse(answer)

      if (!parsed.keywords || parsed.keywords.length === 0) {
        console.warn('No keywords extracted, returning empty result')
        return { keywords: [], error: null }
      }

      console.log(`Extracted ${parsed.keywords.length} keywords:`,
        parsed.keywords.map(k => k.term).join(', '))

      return { keywords: parsed.keywords, error: null }

    } catch (err) {
      console.error('Error extracting keywords:', err)
      return {
        keywords: [],
        error: err.message || 'Failed to extract keywords'
      }
    }
  }

  /**
   * Parse the LLM response to extract keywords
   * @private
   */
  _parseKeywordResponse(response) {
    try {
      let jsonStr = response.trim()

      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        jsonStr = jsonMatch[0]
      }

      const parsed = JSON.parse(jsonStr)

      if (!parsed.keywords || !Array.isArray(parsed.keywords)) {
        throw new Error('Invalid response format: missing keywords array')
      }

      const validKeywords = parsed.keywords.filter(k => {
        return k.term &&
               typeof k.term === 'string' &&
               Array.isArray(k.variations)
      })

      return { keywords: validKeywords }

    } catch (err) {
      console.error('Error parsing keyword response:', err)
      console.error('Response was:', response)

      const fallbackKeywords = this._extractFallbackKeywords(response)
      return { keywords: fallbackKeywords }
    }
  }

  /**
   * Extract basic keywords as fallback if JSON parsing fails
   * @private
   */
  _extractFallbackKeywords(text) {
    try {
      const words = text
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(word => word.length > 3)
        .filter(word => {
          const commonWords = ['that', 'this', 'with', 'from', 'have', 'what', 'when', 'where', 'which']
          return !commonWords.includes(word)
        })
        .slice(0, 5)

      return words.map(word => ({
        term: word,
        variations: [word]
      }))

    } catch (err) {
      console.error('Fallback keyword extraction failed:', err)
      return []
    }
  }

  /**
   * Get all keyword terms as flat array (including variations)
   */
  getAllTerms(keywordResult) {
    if (!keywordResult || !keywordResult.keywords) {
      return []
    }

    const allTerms = []

    for (const keyword of keywordResult.keywords) {
      allTerms.push(keyword.term.toLowerCase())

      if (keyword.variations && Array.isArray(keyword.variations)) {
        keyword.variations.forEach(v => {
          allTerms.push(v.toLowerCase())
        })
      }
    }

    return [...new Set(allTerms)]
  }
}
