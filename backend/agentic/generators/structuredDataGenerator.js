function mapServiceProduct(item, type, profile) {
  return {
    id: item.id || '',
    type,
    name: item.name || '',
    description: item.description || item.sourceText || '',
    sourceUrl: item.sourceUrl || profile.source?.sourceUrl || '',
    sourceText: item.sourceText || '',
    status: item.status || 'active',
    confidence: Number(item.confidence) || 0,
    approvalRequired: Boolean(item.priceRange),
    ...(item.priceRange ? { priceRange: item.priceRange } : {}),
  }
}

export function generateStructuredServiceProductData(profile) {
  return [
    ...(profile.services || []).map(service => mapServiceProduct(service, 'service', profile)),
    ...(profile.products || []).map(product => mapServiceProduct(product, 'product', profile)),
  ]
}
