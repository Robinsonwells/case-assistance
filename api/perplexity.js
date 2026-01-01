export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const apiKey = process.env.PERPLEXITY_API_KEY

    if (!apiKey) {
      console.error('PERPLEXITY_API_KEY environment variable is not set in Vercel')
      return res.status(500).json({
        error: 'API key not configured on server. Please add PERPLEXITY_API_KEY in Vercel: Project → Settings → Environment Variables.'
      })
    }

    const { systemPrompt, context, question, prompt, model = 'sonar-reasoning-pro', temperature = 0.3 } = req.body

    let messages

    if (systemPrompt && context && question) {
      messages = [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Context:\n\n${context}\n\nQuestion: ${question}`
        }
      ]
    } else if (prompt) {
      messages = [
        {
          role: 'user',
          content: prompt
        }
      ]
    } else {
      return res.status(400).json({
        error: 'Either provide (systemPrompt, context, question) or (prompt)'
      })
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages,
        temperature
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Perplexity API error: ${response.status}`, errorText)

      let errorMessage = `Perplexity API error: ${response.status}`

      if (response.status === 401) {
        errorMessage = 'Perplexity API authentication failed. The PERPLEXITY_API_KEY may be invalid or expired.'
      } else if (response.status === 429) {
        errorMessage = 'Perplexity API rate limit exceeded. Please wait and try again.'
      } else if (response.status === 500) {
        errorMessage = 'Perplexity API is experiencing server issues. Please try again later.'
      } else {
        errorMessage = `Perplexity API error: ${response.status} - ${errorText}`
      }

      return res.status(response.status).json({ error: errorMessage })
    }

    const data = await response.json()
    return res.status(200).json(data)
  } catch (error) {
    console.error('Error in Perplexity proxy:', error)
    return res.status(500).json({ error: error.message })
  }
}
