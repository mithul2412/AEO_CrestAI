const ARTIFACTS_BY_CHANGE = {
  page_content_changed: ['hosted_profile', 'llms_full_txt', 'claim_source_map'],
  pricing_changed: ['hosted_profile', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  new_service_or_product: ['hosted_profile', 'llms_txt', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  removed_service_or_product: ['hosted_profile', 'llms_txt', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  broken_action_link: ['action_metadata', 'hosted_profile'],
  robots_txt_changed: ['robots_recommendations', 'engine_readiness'],
  schema_removed: ['json_ld', 'engine_readiness'],
  faq_changed: ['hosted_profile', 'llms_full_txt', 'json_ld'],
  policy_changed: ['hosted_profile', 'llms_full_txt'],
  contact_info_changed: ['hosted_profile', 'action_metadata', 'llms_txt'],
  ai_standard_changed: ['robots_recommendations', 'engine_readiness', 'alternate_link'],
}

export const CHANGE_EVENT_TYPES = Object.freeze(Object.keys(ARTIFACTS_BY_CHANGE))

function itemMap(items = []) {
  return new Map(items.map(item => [item.id || item.name || item.question || item.claim, item]))
}

function normalizeValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => normalizeValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = normalizeValue(value[key])
      return acc
    }, {})
  }
  return value ?? ''
}

function valuesEqual(oldValue, newValue) {
  return JSON.stringify(normalizeValue(oldValue)) === JSON.stringify(normalizeValue(newValue))
}

function changed(type, path, oldValue, newValue, severity = 'medium', metadata = {}) {
  const affectedArtifacts = resolveAffectedArtifacts([{ type }])
  const approvalRequired = requiresApproval([{ type, oldValue, newValue, metadata }])
  return {
    type,
    path,
    oldValue,
    newValue,
    severity,
    affectedArtifacts,
    affected_artifacts: affectedArtifacts,
    approval_required: approvalRequired,
    auto_publish_allowed: !approvalRequired,
    requiresApproval: approvalRequired,
    metadata,
  }
}

function compareNamedCollections(changes, oldItems, newItems, pathPrefix, itemKind) {
  const oldMap = itemMap(oldItems)
  const newMap = itemMap(newItems)

  for (const [key, newItem] of newMap.entries()) {
    if (!oldMap.has(key)) {
      changes.push(changed('new_service_or_product', `${pathPrefix}.${key}`, null, newItem.name || key, 'medium', {
        item_kind: itemKind,
        item_id: key,
      }))
    }
  }

  for (const [key, oldItem] of oldMap.entries()) {
    if (!newMap.has(key)) {
      changes.push(changed('removed_service_or_product', `${pathPrefix}.${key}`, oldItem.name || key, null, 'high', {
        item_kind: itemKind,
        item_id: key,
      }))
    }
  }
}

export function resolveAffectedArtifacts(changes = []) {
  return [...new Set(changes.flatMap(change => ARTIFACTS_BY_CHANGE[change.type] || ['hosted_profile']))]
}

export function requiresApproval(changes = []) {
  return changes.some(change => {
    const text = `${change.type || ''} ${JSON.stringify(change.oldValue || '')} ${JSON.stringify(change.newValue || '')}`
    return change.type === 'pricing_changed'
      || change.type === 'policy_changed'
      || /\b(legal|policy|medical|financial|guarantee|guaranteed|certification|certifications|certified|rating|ratings|review|reviews|refund|availability|available|HIPAA|SOC 2|FDA)\b/i.test(text)
  })
}

export function detectProfileChanges(oldProfile = {}, newProfile = {}) {
  const changes = []

  if ((oldProfile.business?.description || '') !== (newProfile.business?.description || '')) {
    changes.push(changed('page_content_changed', 'business.description', oldProfile.business?.description || '', newProfile.business?.description || '', 'low'))
  }

  compareNamedCollections(changes, oldProfile.services || [], newProfile.services || [], 'services', 'service')
  compareNamedCollections(changes, oldProfile.products || [], newProfile.products || [], 'products', 'product')

  const oldPricing = (oldProfile.claims || []).filter(claim => claim.claimType === 'pricing').map(claim => claim.claim).join('\n')
  const newPricing = (newProfile.claims || []).filter(claim => claim.claimType === 'pricing').map(claim => claim.claim).join('\n')
  if (oldPricing !== newPricing) {
    changes.push(changed('pricing_changed', 'claims[pricing]', oldPricing, newPricing, 'high'))
  }

  const oldNonPricingClaims = (oldProfile.claims || []).filter(claim => claim.claimType !== 'pricing')
  const newNonPricingClaims = (newProfile.claims || []).filter(claim => claim.claimType !== 'pricing')
  if (!valuesEqual(oldNonPricingClaims, newNonPricingClaims)) {
    changes.push(changed('page_content_changed', 'claims', oldNonPricingClaims, newNonPricingClaims, 'medium'))
  }

  const oldActions = itemMap(oldProfile.actions || [])
  for (const action of newProfile.actions || []) {
    const oldAction = oldActions.get(action.id || action.name)
    if (oldAction?.status !== action.status && /book|demo|schedule|quote|contact|buy|order/i.test(`${action.type} ${action.label}`) && action.status === 'broken') {
      changes.push(changed('broken_action_link', `actions.${action.id || action.label}.status`, oldAction?.status, action.status, 'high'))
    }
  }

  if (!valuesEqual(oldProfile.faqs || [], newProfile.faqs || [])) {
    changes.push(changed('faq_changed', 'faqs', oldProfile.faqs || [], newProfile.faqs || [], 'medium'))
  }

  if (!valuesEqual(oldProfile.policies || [], newProfile.policies || [])) {
    changes.push(changed('policy_changed', 'policies', oldProfile.policies || [], newProfile.policies || [], 'high'))
  }

  if (!valuesEqual(oldProfile.trustSignals || [], newProfile.trustSignals || [])) {
    changes.push(changed('page_content_changed', 'trustSignals', oldProfile.trustSignals || [], newProfile.trustSignals || [], 'medium'))
  }

  if (!valuesEqual(oldProfile.business?.contact || {}, newProfile.business?.contact || {})) {
    changes.push(changed('contact_info_changed', 'business.contact', oldProfile.business?.contact || {}, newProfile.business?.contact || {}, 'medium'))
  }

  const oldMetadata = oldProfile.metadata || {}
  const newMetadata = newProfile.metadata || {}
  if (oldMetadata.robotsTxtHash && oldMetadata.robotsTxtHash !== newMetadata.robotsTxtHash) {
    changes.push(changed('robots_txt_changed', 'metadata.robotsTxtHash', oldMetadata.robotsTxtHash, newMetadata.robotsTxtHash, 'medium'))
  }
  if (oldMetadata.schemaHash && !newMetadata.schemaHash) {
    changes.push(changed('schema_removed', 'metadata.schemaHash', oldMetadata.schemaHash, newMetadata.schemaHash || '', 'high'))
  }
  if (oldMetadata.aiStandardVersion && oldMetadata.aiStandardVersion !== newMetadata.aiStandardVersion) {
    changes.push(changed('ai_standard_changed', 'metadata.aiStandardVersion', oldMetadata.aiStandardVersion, newMetadata.aiStandardVersion, 'medium'))
  }

  return changes.map(change => ({
    ...change,
    approval_required: requiresApproval([change]),
    auto_publish_allowed: !requiresApproval([change]),
    requiresApproval: requiresApproval([change]),
    affectedArtifacts: resolveAffectedArtifacts([change]),
    affected_artifacts: resolveAffectedArtifacts([change]),
  }))
}
