import { isSafeActionUrl } from '../utils/validation.js'

const VALID_ACTION_TYPES = new Set([
  'book_demo',
  'request_quote',
  'buy',
  'contact',
  'call',
  'email',
  'schedule',
  'search',
  'download',
  'start_trial',
  'unknown',
])

export function generateActionMetadata(profile) {
  return (profile.actions || []).map(action => {
    const type = VALID_ACTION_TYPES.has(action.type) ? action.type : 'unknown'
    const url = action.url || ''
    const urlLooksSafe = !url || isSafeActionUrl(url)

    return {
      id: action.id || '',
      type,
      label: action.label || type,
      url,
      status: urlLooksSafe ? (action.status || 'active') : 'needs_review',
      sourceUrl: action.sourceUrl || profile.source?.sourceUrl || '',
      fallbackContact: action.fallbackContact || '',
      confidence: Number(action.confidence) || 0,
    }
  })
}
