const BACKEND_URL = import.meta.env.VITE_BACKEND_URL

export async function callPerplexity(payload) {
  const response = await fetch(BACKEND_URL, {
    method: 'POST',
    headers: {
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
