function cleanObject(value) {
  if (Array.isArray(value)) {
    return value.map(cleanObject).filter(item => item !== undefined)
  }

  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [key, cleanObject(item)])
      .filter(([, item]) => item !== undefined && item !== '' && !(Array.isArray(item) && item.length === 0))
  )
}

function actionToSchema(action) {
  if (!action.url || !/^https?:\/\//i.test(action.url)) return null
  const actionType = action.type === 'search' ? 'SearchAction' : 'Action'
  return cleanObject({
    '@type': actionType,
    name: action.label || action.type,
    target: action.url,
  })
}

function breadcrumbFromPage(page) {
  if (!page?.url) return null
  let parsed
  try {
    parsed = new URL(page.url)
  } catch {
    return null
  }

  const parts = parsed.pathname.split('/').filter(Boolean)
  if (parts.length < 2) return null

  const itemListElement = [
    {
      '@type': 'ListItem',
      position: 1,
      name: parsed.hostname.replace(/^www\./, ''),
      item: parsed.origin,
    },
    ...parts.map((part, index) => ({
      '@type': 'ListItem',
      position: index + 2,
      name: part.replace(/[-_]+/g, ' '),
      item: new URL(`/${parts.slice(0, index + 1).join('/')}`, parsed.origin).toString(),
    })),
  ]

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement,
  }
}

export function generateJsonLd(profile) {
  const page = profile.pages?.[0] || {}
  const potentialAction = (profile.actions || [])
    .map(actionToSchema)
    .filter(Boolean)

  const organization = cleanObject({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: profile.business?.name || profile.business?.domain,
    url: profile.source?.origin || page.url,
    description: profile.business?.description,
    email: profile.business?.contact?.email,
    telephone: profile.business?.contact?.phone,
    sameAs: profile.business?.sameAs || [],
    potentialAction,
  })

  const webpage = cleanObject({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: page.title || profile.business?.name,
    url: page.url || profile.source?.sourceUrl,
    description: page.summary || profile.business?.description,
    about: profile.business?.name || profile.business?.domain,
  })

  const serviceObjects = (profile.services || []).map(service => cleanObject({
    '@context': 'https://schema.org',
    '@type': 'Service',
    '@id': service.id,
    name: service.name,
    description: service.description || service.sourceText,
    url: service.sourceUrl || profile.source?.sourceUrl,
    provider: {
      '@type': 'Organization',
      name: profile.business?.name || profile.business?.domain,
      url: profile.source?.origin,
    },
  }))

  const productObjects = (profile.products || []).map(product => cleanObject({
    '@context': 'https://schema.org',
    '@type': 'Product',
    '@id': product.id,
    name: product.name,
    description: product.description || product.sourceText,
    url: product.sourceUrl || profile.source?.sourceUrl,
  }))

  const approvedFaqs = (profile.faqs || []).filter(faq => faq.question && faq.answer)
  const faqObject = approvedFaqs.length > 0
    ? cleanObject({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: approvedFaqs.map(faq => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      })
    : null

  return [
    organization,
    webpage,
    ...serviceObjects,
    ...productObjects,
    faqObject,
    breadcrumbFromPage(page),
  ].filter(Boolean)
}
