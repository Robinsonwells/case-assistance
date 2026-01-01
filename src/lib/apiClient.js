const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

export async function callPerplexity(payload) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration missing. Please check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.')
  }

  const edgeFunctionURL = `${supabaseUrl}/functions/v1/perplexity-proxy`

  const response = await fetch(edgeFunctionURL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Perplexity proxy failed: ${response.status} - ${errorData.error || response.statusText}`)
  }

  return response.json()
}
