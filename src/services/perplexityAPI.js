/**
 * PerplexityAPI - Integration with Perplexity API for LLM-powered answers
 *
 * What's happening:
 * 1. RAG pipeline retrieves relevant chunks from documents
 * 2. Chunks are sent as context to Perplexity API via secure edge function
 * 3. Perplexity generates answer grounded in the provided context
 * 4. Answer is returned to user
 *
 * Privacy & Security:
 * - Perplexity offers Zero Data Retention (ZDR) - data not used for training
 * - Only chunk context is sent (never full documents)
 * - API key is stored securely server-side (not exposed in client bundle)
 * - All requests go through Supabase Edge Function proxy
 *
 * Model Choice: sonar-reasoning-pro
 * - Advanced reasoning for complex legal analysis
 * - Fast API responses
 * - Fact-grounded responses
 *
 * Temperature: 0.3 (low)
 * - Favors factual, deterministic responses
 * - Good for legal/compliance Q&A where accuracy matters more than creativity
 */
export default class PerplexityAPI {
  constructor() {
    // Supabase edge function endpoint
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase configuration missing')
      throw new Error('Supabase configuration not found')
    }

    this.edgeFunctionURL = `${supabaseUrl}/functions/v1/perplexity-proxy`
    this.supabaseAnonKey = supabaseAnonKey

    // Request configuration
    this.model = 'sonar-reasoning-pro'
    this.temperature = 0.3 // Low temperature for factual responses
    this.timeout = 30000 // 30 second timeout
  }

  /**
   * Query Perplexity with context from RAG
   *
   * This is the final step in the RAG pipeline:
   * - Takes context (retrieved document chunks)
   * - Sends question + context to Perplexity via edge function
   * - Returns answer grounded in provided context
   *
   * @param {object} params - Query parameters
   * @param {string} params.systemPrompt - System instructions for the model
   * @param {string} params.context - Document chunks as context (from RAG retrieval)
   * @param {string} params.question - User's question
   * @returns {Promise<string>} - Answer from Perplexity
   */
  async query({ systemPrompt, context, question }) {
    try {
      // Validate inputs
      if (!systemPrompt || typeof systemPrompt !== 'string') {
        throw new Error('systemPrompt must be a non-empty string')
      }

      if (!context || typeof context !== 'string') {
        throw new Error('context must be a non-empty string')
      }

      if (!question || typeof question !== 'string') {
        throw new Error('question must be a non-empty string')
      }

      console.log('Querying Perplexity API via edge function...')
      console.log(`Context length: ${context.length} characters`)
      console.log(`Question: ${question.substring(0, 100)}...`)

      // Build the request payload
      const requestPayload = {
        systemPrompt,
        context,
        question,
        model: this.model,
        temperature: this.temperature
      }

      // Make the API request with timeout
      const response = await this._fetchWithTimeout(
        this.edgeFunctionURL,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestPayload)
        },
        this.timeout
      )

      // Handle API errors
      if (!response.ok) {
        await this._handleAPIError(response)
      }

      // Parse response
      const data = await response.json()

      // Validate response structure
      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response structure from Perplexity API')
      }

      // Extract answer
      const answer = data.choices[0].message.content

      console.log('Successfully received answer from Perplexity API')
      return answer
    } catch (err) {
      console.error('Error querying Perplexity API:', err)
      throw new Error(`Failed to query Perplexity: ${err.message}`)
    }
  }

  /**
   * Simple query without context
   * Useful for direct questions without document context
   *
   * @param {string} prompt - Question to ask
   * @returns {Promise<string>} - Answer from Perplexity
   */
  async querySimple(prompt) {
    try {
      if (!prompt || typeof prompt !== 'string') {
        throw new Error('prompt must be a non-empty string')
      }

      console.log('Querying Perplexity API (simple) via edge function...')

      // Build simple request (no context)
      const requestPayload = {
        prompt,
        model: this.model,
        temperature: this.temperature
      }

      // Make the API request
      const response = await this._fetchWithTimeout(
        this.edgeFunctionURL,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestPayload)
        },
        this.timeout
      )

      // Handle errors
      if (!response.ok) {
        await this._handleAPIError(response)
      }

      // Parse response
      const data = await response.json()

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response structure from Perplexity API')
      }

      const answer = data.choices[0].message.content
      return answer
    } catch (err) {
      console.error('Error in querySimple:', err)
      throw new Error(`Failed to query Perplexity: ${err.message}`)
    }
  }

  /**
   * Fetch with timeout
   * Handles network requests with a timeout to prevent hanging
   * 
   * @private
   * @param {string} url - Request URL
   * @param {object} options - Fetch options
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<Response>} - Fetch response
   */
  async _fetchWithTimeout(url, options, timeout) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(timeoutId)
      return response
    } catch (err) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`)
      }
      throw err
    }
  }

  /**
   * Handle API error responses
   * Provides specific error messages for different HTTP status codes
   *
   * @private
   * @param {Response} response - Fetch response object
   */
  async _handleAPIError(response) {
    let errorMessage = `HTTP ${response.status}`

    switch (response.status) {
      case 400:
        errorMessage = 'Bad request - invalid parameters'
        break

      case 401:
        errorMessage = 'Unauthorized - API key invalid or expired. Check PERPLEXITY_API_KEY configuration.'
        break

      case 403:
        errorMessage = 'Forbidden - access denied to this model'
        break

      case 429:
        errorMessage = 'Rate limited - too many requests. Please wait and try again.'
        break

      case 500:
        errorMessage = 'Server error - Perplexity API is experiencing issues'
        break

      case 503:
        errorMessage = 'Service unavailable - Perplexity API is temporarily down'
        break

      default:
        // Try to extract error message from response
        try {
          const errorData = await response.json()
          if (errorData.error) {
            errorMessage = typeof errorData.error === 'string' ? errorData.error : errorData.error.message || errorMessage
          }
        } catch (e) {
          // Fallback to status text
          errorMessage = response.statusText || `HTTP ${response.status}`
        }
    }

    throw new Error(errorMessage)
  }

  /**
   * Check API connectivity and authentication
   * Useful for diagnostics and status checks
   *
   * @returns {Promise<boolean>} - True if API is accessible
   */
  async checkConnectivity() {
    try {
      // Try a simple request
      const response = await this._fetchWithTimeout(
        this.edgeFunctionURL,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.supabaseAnonKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: 'test',
            model: this.model,
            temperature: 0.1
          })
        },
        5000 // 5 second timeout for connectivity check
      )

      return response.ok || response.status === 429 // OK or rate limited (not auth error)
    } catch (err) {
      console.error('Connectivity check failed:', err)
      return false
    }
  }

  /**
   * Get API configuration info
   * Useful for debugging
   *
   * @returns {object} - Configuration details
   */
  getConfig() {
    return {
      model: this.model,
      edgeFunctionURL: this.edgeFunctionURL,
      temperature: this.temperature,
      timeout: this.timeout,
      supabaseConfigured: !!this.supabaseAnonKey
    }
  }
}
