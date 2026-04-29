import { getHostedProfileUrl } from './alternateLinkGenerator.js'

function section(title, lines) {
  return [`## ${title}`, ...(lines.length ? lines : ['- Not detected']), '']
}

export function generateLlmsFullTxt(profile, options = {}) {
  const name = profile.business?.name || profile.business?.domain || profile.slug
  const description = profile.business?.description || 'No sourced description detected.'
  const serviceLines = (profile.services || []).map(service => {
    const source = service.sourceUrl ? ` Source: ${service.sourceUrl}` : ''
    return `- ${service.name}${service.description ? `: ${service.description}` : ''}${source}`
  })
  const productLines = (profile.products || []).map(product => {
    const source = product.sourceUrl ? ` Source: ${product.sourceUrl}` : ''
    return `- ${product.name}${product.description ? `: ${product.description}` : ''}${source}`
  })
  const actionLines = (profile.actions || []).map(action => `- ${action.label || action.type}: ${action.url || action.fallbackContact || 'Not detected'}`)
  const faqLines = (profile.faqs || []).map(faq => `- Q: ${faq.question}\n  A: ${faq.answer}\n  Source: ${faq.sourceUrl || profile.source?.sourceUrl || 'Not detected'}`)
  const claimLines = (profile.claims || []).map(claim => `- ${claim.claim}\n  Source: ${claim.sourceUrl || 'Not detected'}\n  Evidence: ${claim.sourceText || 'Not detected'}`)
  const pageLines = (profile.pages || []).map(page => `- ${page.title || page.url}: ${page.url}`)
  const policyLines = (profile.policies || []).map(policy => `- ${policy.name || policy.policy || policy.sourceText}`)
  const trustLines = (profile.trustSignals || []).map(signal => `- ${signal.name || signal.claim || signal.sourceText}`)

  return [
    `# ${name} AI-readable Profile`,
    '',
    description,
    '',
    `Hosted profile: ${getHostedProfileUrl(profile, options)}`,
    `Source URL: ${profile.source?.sourceUrl || 'Not detected'}`,
    `Last updated: ${profile.metadata?.updatedAt || profile.metadata?.createdAt || 'Not detected'}`,
    '',
    ...section('Services', serviceLines),
    ...section('Products', productLines),
    ...section('Actions', actionLines),
    ...section('FAQs', faqLines),
    ...section('Policies', policyLines),
    ...section('Trust signals', trustLines),
    ...section('Claim-source map', claimLines),
    ...section('Key pages', pageLines),
  ].join('\n')
}
