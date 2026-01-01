export async function callPerplexity(payload) {
  const response = await fetch('/api/perplexity', {
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
