function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function listLines(items, formatter) {
  if (!items?.length) return ['- Not detected']
  return items.map(formatter)
}

export function buildHostedProfileJson(record) {
  return {
    canonicalProfile: record.profile,
    artifacts: {
      llmsTxt: record.artifacts?.llmsTxt,
      llmsFullTxt: record.artifacts?.llmsFullTxt,
      jsonLd: record.artifacts?.jsonLd,
      faqBlock: record.artifacts?.faqBlock,
      actionMetadata: record.artifacts?.actionMetadata,
      claimSourceMap: record.artifacts?.claimSourceMap,
      structuredServiceProductData: record.artifacts?.structuredServiceProductData,
      robotsRecommendations: record.artifacts?.robotsRecommendations,
      alternateLinkSnippet: record.artifacts?.alternateLinkSnippet,
    },
    validation: record.validation,
    engineReadiness: record.engineReadiness,
    hostedProfile: record.hostedProfile,
    storage: {
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      version: record.version,
      monitoring: record.monitoring || null,
      versionHistory: (record.versionHistory || []).map(item => ({
        version: item.version,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        storedAt: item.storedAt,
        changeEvents: item.changeEvents || [],
      })),
    },
    generatedAt: record.storedAt,
  }
}

export function buildHostedProfileMarkdown(record) {
  const profile = record.profile || {}
  const business = profile.business || {}
  const contact = business.contact || {}
  const metadata = profile.metadata || {}

  return [
    `# ${business.name || business.domain || record.slug}`,
    '',
    business.description || 'No sourced description detected.',
    '',
    `Source: ${profile.source?.sourceUrl || 'Not detected'}`,
    `Last updated: ${metadata.updatedAt || metadata.createdAt || record.storedAt || 'Not detected'}`,
    `Validation: ${record.validation?.ok ? 'ok' : 'needs review'}`,
    '',
    '## Services',
    ...listLines(profile.services, service => `- ${service.name}${service.description ? `: ${service.description}` : ''}`),
    '',
    '## Products',
    ...listLines(profile.products, product => `- ${product.name}${product.description ? `: ${product.description}` : ''}`),
    '',
    '## Contact',
    ...(contact.email || contact.phone || contact.bookingUrl || contact.quoteUrl || contact.contactUrl
      ? [
          contact.email ? `- Email: ${contact.email}` : '',
          contact.phone ? `- Phone: ${contact.phone}` : '',
          contact.bookingUrl ? `- Booking: ${contact.bookingUrl}` : '',
          contact.quoteUrl ? `- Quote: ${contact.quoteUrl}` : '',
          contact.contactUrl ? `- Contact: ${contact.contactUrl}` : '',
        ].filter(Boolean)
      : ['- Not detected']),
    '',
    '## Actions',
    ...listLines(record.artifacts?.actionMetadata, action => `- ${action.label || action.type}: ${action.url || action.fallbackContact || 'Not detected'}`),
    '',
    '## FAQs',
    ...listLines(profile.faqs, faq => `- Q: ${faq.question}\n  A: ${faq.answer}\n  Source: ${faq.sourceUrl || profile.source?.sourceUrl || 'Not detected'}`),
    '',
    '## Claims And Sources',
    ...listLines(record.artifacts?.claimSourceMap, claim => `- ${claim.claim}\n  Source: ${claim.sourceUrl || 'Not detected'}\n  Evidence: ${claim.sourceText || 'Not detected'}`),
    '',
    '## Engine Readiness',
    ...Object.entries(record.engineReadiness || {}).map(([engine, readout]) => `- ${engine}: ${readout.score}/100`),
    '',
  ].join('\n')
}

export function buildHostedProfileHtml(record) {
  const profile = record.profile || {}
  const business = profile.business || {}
  const markdown = buildHostedProfileMarkdown(record)
  const validation = record.validation?.ok ? 'OK' : 'Needs review'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(business.name || business.domain || record.slug)} AI Profile</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6;margin:0;background:#f8fafc;color:#0f172a}
    main{max-width:920px;margin:0 auto;padding:40px 24px}
    header{border-bottom:1px solid #cbd5e1;margin-bottom:24px;padding-bottom:20px}
    h1{margin:0 0 8px;font-size:32px}
    .meta{color:#475569}
    .badge{display:inline-block;border:1px solid #94a3b8;border-radius:999px;padding:4px 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
    pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;border-radius:8px;padding:18px;overflow:auto}
  </style>
</head>
<body>
  <main>
    <header>
      <span class="badge">${escapeHtml(validation)}</span>
      <h1>${escapeHtml(business.name || business.domain || record.slug)}</h1>
      <div class="meta">Source: ${escapeHtml(profile.source?.sourceUrl || 'Not detected')}</div>
      <div class="meta">Generated: ${escapeHtml(record.storedAt || '')}</div>
    </header>
    <pre>${escapeHtml(markdown)}</pre>
  </main>
</body>
</html>`
}
