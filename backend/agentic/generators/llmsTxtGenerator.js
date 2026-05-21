import { getHostedProfileUrl } from './alternateLinkGenerator.js'

function pickContactLines(profile) {
  const contact = profile.business?.contact || {}
  const lines = []

  if (contact.bookingUrl) lines.push(`- Book: ${contact.bookingUrl}`)
  if (contact.demoUrl && contact.demoUrl !== contact.bookingUrl) lines.push(`- Demo: ${contact.demoUrl}`)
  if (contact.quoteUrl) lines.push(`- Request quote: ${contact.quoteUrl}`)
  if (contact.contactUrl) lines.push(`- Contact: ${contact.contactUrl}`)
  if (contact.email) lines.push(`- Email: ${contact.email}`)
  if (contact.phone) lines.push(`- Phone: ${contact.phone}`)

  return lines
}

export function generateLlmsTxt(profile, options = {}) {
  const name = profile.business?.name || profile.business?.domain || profile.slug
  const description = profile.business?.description || 'AI-readable business profile generated from sourced page content.'
  const serviceLines = (profile.services || []).slice(0, 6).map(service => {
    const detail = service.description || service.sourceText || ''
    return `- ${service.name}${detail && detail !== service.name ? `: ${detail}` : ''}`
  })
  const productLines = (profile.products || []).slice(0, 6).map(product => {
    const detail = product.description || product.sourceText || ''
    return `- ${product.name}${detail && detail !== product.name ? `: ${detail}` : ''}`
  })
  const pageLines = (profile.pages || []).slice(0, 5).map(page => `- ${page.title || page.url}: ${page.url}`)
  const contactLines = pickContactLines(profile)

  return [
    `# ${name}`,
    '',
    `> ${description}`,
    '',
    '## Services',
    ...(serviceLines.length ? serviceLines : ['- Not detected']),
    ...(productLines.length ? ['', '## Products', ...productLines] : []),
    '',
    '## How to engage',
    ...(contactLines.length ? contactLines : ['- Not detected']),
    '',
    '## Key pages',
    ...(pageLines.length ? pageLines : ['- Not detected']),
    '',
    '## AI-readable profile',
    `- ${getHostedProfileUrl(profile, options)}`,
    '',
  ].join('\n')
}
