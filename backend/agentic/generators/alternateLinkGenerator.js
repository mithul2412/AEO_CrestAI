function getProfileBaseUrl(options = {}) {
  return String(options.profileBaseUrl || process.env.AGENTIC_PROFILE_BASE_URL || 'http://localhost:3001/agent')
    .replace(/\/+$/, '')
}

export function getHostedProfileUrl(profile, options = {}) {
  const baseUrl = getProfileBaseUrl(options)
  return `${baseUrl}/${profile.slug}`
}

export function generateAlternateLinkSnippet(profile, options = {}) {
  const href = getHostedProfileUrl(profile, options)
  return `<link rel="alternate" type="application/json" href="${href}.json" title="AI-readable business profile" />`
}
