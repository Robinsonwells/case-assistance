import { callPerplexity } from '../lib/apiClient'

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
 * - NO API keys are ever exposed to the browser
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
    this.model = 'sonar-reasoning-pro'
    this.temperature = 0.3
    this.timeout = 30000
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

      const requestPayload = {
        systemPrompt,
        context,
        question,
        model: this.model,
        temperature: this.temperature
      }

      const data = await callPerplexity(requestPayload)

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response structure from Perplexity API')
      }

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

      const requestPayload = {
        prompt,
        model: this.model,
        temperature: this.temperature
      }

      const data = await callPerplexity(requestPayload)

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

  getConfig() {
    return {
      model: this.model,
      temperature: this.temperature,
      timeout: this.timeout,
      proxyUsed: 'Supabase Edge Function (perplexity-proxy)',
      apiKeyExposure: 'NEVER - API key only exists server-side'
    }
  }
}
