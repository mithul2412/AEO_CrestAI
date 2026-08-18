export async function readApiError(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || ''

  try {
    if (contentType.includes('application/json')) {
      const data = await response.json()
      if (data?.error) return data.error
    } else {
      const text = await response.text()
      if (text.trim()) return text.trim()
    }
  } catch {
    // Fall through to the provided fallback message.
  }

  return fallbackMessage
}
