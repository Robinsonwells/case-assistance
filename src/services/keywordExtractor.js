import { pipeline } from '@xenova/transformers'
import PerplexityAPI from './perplexityAPI'

/**
 * KeywordExtractor - Extract keywords and variations from user questions
 *
 * Default: Uses local browser-based LLM (Qwen2.5-0.5B-Instruct)
 * - Fully private, no data leaves browser
 * - Works offline after initial model download
 * - Zero API costs
 * - ~300 MB one-time download, ~600 MB RAM usage
 *
 * Fallback: Perplexity API (if local model fails or disabled)
 *
 * This enables robust keyword search that catches chunks semantic search might miss
 */
export default class KeywordExtractor {
  constructor(options = {}) {
    this.useLocalModel = options.useLocalModel !== false
    this.localGenerator = null
    this.modelLoading = false
    this.modelLoaded = false
    this.perplexityAPI = new PerplexityAPI()
    this.timeout = 10000
    this.progressCallback = options.progressCallback || null
  }

  /**
   * Initialize the local LLM model
   * Downloads and caches the model (~300 MB one-time download)
   */
  async initialize() {
    if (this.modelLoaded || this.modelLoading) {
      return
    }

    if (!this.useLocalModel) {
      console.log('Local model disabled, using API fallback')
      return
    }

    try {
      this.modelLoading = true
      console.log('Loading local keyword extraction model (Qwen2.5-0.5B)...')

      if (this.progressCallback) {
        this.progressCallback({ status: 'loading', message: 'Initializing model...' })
      }

      this.localGenerator = await pipeline(
        'text-generation',
        'onnx-community/Qwen2.5-0.5B-Instruct',
        {
          device: 'webgpu',
          dtype: 'q4',
          progress_callback: (progress) => {
            console.log(`Model loading progress:`, progress)
            if (this.progressCallback) {
              this.progressCallback({
                status: 'downloading',
                message: `Downloading model... ${progress.status || ''}`,
                progress: progress
              })
            }
          }
        }
      )

      this.modelLoaded = true
      this.modelLoading = false
      console.log('Local keyword extraction model ready')

      if (this.progressCallback) {
        this.progressCallback({ status: 'ready', message: 'Model ready' })
      }

    } catch (err) {
      console.error('Failed to load local model:', err)
      this.modelLoading = false
      this.modelLoaded = false
      this.useLocalModel = false

      if (this.progressCallback) {
        this.progressCallback({
          status: 'error',
          message: 'Failed to load local model, falling back to API',
          error: err.message
        })
      }
    }
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

      if (this.useLocalModel && !this.modelLoaded && !this.modelLoading) {
        await this.initialize()
      }

      if (this.useLocalModel && this.modelLoaded) {
        return await this._extractLocalLLM(question)
      } else {
        console.log('Using Perplexity API fallback for keyword extraction')
        return await this._extractPerplexityAPI(question)
      }

    } catch (err) {
      console.error('Error extracting keywords:', err)
      return {
        keywords: [],
        error: err.message || 'Failed to extract keywords'
      }
    }
  }

  /**
   * Extract keywords using local browser-based LLM
   * @private
   */
  async _extractLocalLLM(question) {
    try {
      console.log('Using local LLM for keyword extraction')

      const prompt = `<|im_start|>system
You are a keyword extraction expert. Extract 3-7 main keywords from the question and provide 2-5 variations for each.
Return ONLY valid JSON, nothing else.<|im_end|>
<|im_start|>user
Question: "${question}"

Return JSON: {"keywords":[{"term":"word","variations":["syn1","syn2"]}]}

JSON:<|im_end|>
<|im_start|>assistant
`

      const output = await this.localGenerator(prompt, {
        max_new_tokens: 250,
        temperature: 0.3,
        do_sample: false,
        top_p: 0.9
      })

      const generatedText = output[0].generated_text

      const jsonStart = generatedText.indexOf('{')
      const jsonPart = jsonStart !== -1 ? generatedText.substring(jsonStart) : generatedText

      const parsed = this._parseKeywordResponse(jsonPart)

      if (!parsed.keywords || parsed.keywords.length === 0) {
        console.warn('No keywords extracted by local model, using fallback')
        return { keywords: [], error: null }
      }

      console.log(`Local LLM extracted ${parsed.keywords.length} keywords:`,
        parsed.keywords.map(k => k.term).join(', '))

      return { keywords: parsed.keywords, error: null }

    } catch (err) {
      console.error('Local LLM extraction failed:', err)
      console.log('Falling back to Perplexity API')
      return await this._extractPerplexityAPI(question)
    }
  }

  /**
   * Extract keywords using Perplexity API
   * @private
   */
  async _extractPerplexityAPI(question) {
    try {
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
      console.error('Perplexity API extraction failed:', err)
      throw err
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
