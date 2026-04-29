const ARTIFACTS_BY_CHANGE = {
  page_content_changed: ['hosted_profile', 'llms_full_txt', 'claim_source_map'],
  pricing_changed: ['hosted_profile', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  new_service_added: ['hosted_profile', 'llms_txt', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  service_removed: ['hosted_profile', 'llms_txt', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  new_product_added: ['hosted_profile', 'llms_txt', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  product_removed: ['hosted_profile', 'llms_txt', 'llms_full_txt', 'json_ld', 'structured_service_product_data'],
  broken_booking_link: ['action_metadata', 'hosted_profile'],
  robots_txt_changed: ['robots_recommendations', 'engine_readiness'],
  schema_removed: ['json_ld', 'engine_readiness'],
  faq_changed: ['hosted_profile', 'llms_full_txt', 'json_ld'],
  policy_changed: ['hosted_profile', 'llms_full_txt'],
  contact_info_changed: ['hosted_profile', 'action_metadata', 'llms_txt'],
  ai_standard_changed: ['robots_recommendations', 'engine_readiness', 'alternate_link'],
}

function itemMap(items = []) {
  return new Map(items.map(item => [item.id || item.name || item.question || item.claim, item]))
}

function changed(type, path, oldValue, newValue, severity = 'medium') {
  const approval = requiresApproval([{ type, oldValue, newValue }])
  return {
    type,
    path,
    oldValue,
    newValue,
    severity,
    requiresApproval: approval,
    affectedArtifacts: resolveAffectedArtifacts([{ type }]),
  }
}

function compareNamedCollections(changes, oldItems, newItems, addedType, removedType, pathPrefix) {
  const oldMap = itemMap(oldItems)
  const newMap = itemMap(newItems)

  for (const [key, newItem] of newMap.entries()) {
    if (!oldMap.has(key)) {
      changes.push(changed(addedType, `${pathPrefix}.${key}`, null, newItem.name || key, 'medium'))
    }
  }

  for (const [key, oldItem] of oldMap.entries()) {
    if (!newMap.has(key)) {
      changes.push(changed(removedType, `${pathPrefix}.${key}`, oldItem.name || key, null, 'high'))
    }
  }
}

export function resolveAffectedArtifacts(changes = []) {
  return [...new Set(changes.flatMap(change => ARTIFACTS_BY_CHANGE[change.type] || ['hosted_profile']))]
}

export function requiresApproval(changes = []) {
  return changes.some(change => {
    const text = `${change.type || ''} ${change.oldValue || ''} ${change.newValue || ''}`
    return change.type === 'pricing_changed'
      || change.type === 'policy_changed'
      || /\b(legal|medical|financial|guarantee|guaranteed|certified|rating|review|refund|availability|HIPAA|SOC 2|FDA)\b/i.test(text)
  })
}

export function detectProfileChanges(oldProfile = {}, newProfile = {}) {
  const changes = []

  if ((oldProfile.business?.description || '') !== (newProfile.business?.description || '')) {
    changes.push(changed('page_content_changed', 'business.description', oldProfile.business?.description || '', newProfile.business?.description || '', 'low'))
  }

  compareNamedCollections(changes, oldProfile.services || [], newProfile.services || [], 'new_service_added', 'service_removed', 'services')
  compareNamedCollections(changes, oldProfile.products || [], newProfile.products || [], 'new_product_added', 'product_removed', 'products')

  const oldPricing = (oldProfile.claims || []).filter(claim => claim.claimType === 'pricing').map(claim => claim.claim).join('\n')
  const newPricing = (newProfile.claims || []).filter(claim => claim.claimType === 'pricing').map(claim => claim.claim).join('\n')
  if (oldPricing !== newPricing) {
    changes.push(changed('pricing_changed', 'claims[pricing]', oldPricing, newPricing, 'high'))
  }

  const oldActions = itemMap(oldProfile.actions || [])
  for (const action of newProfile.actions || []) {
    const oldAction = oldActions.get(action.id || action.name)
    if (oldAction?.status !== action.status && /book|demo|schedule/i.test(`${action.type} ${action.label}`) && action.status === 'broken') {
      changes.push(changed('broken_booking_link', `actions.${action.id || action.label}.status`, oldAction?.status, action.status, 'high'))
    }
  }

  if (JSON.stringify(oldProfile.faqs || []) !== JSON.stringify(newProfile.faqs || [])) {
    changes.push(changed('faq_changed', 'faqs', oldProfile.faqs || [], newProfile.faqs || [], 'medium'))
  }

  if (JSON.stringify(oldProfile.policies || []) !== JSON.stringify(newProfile.policies || [])) {
    changes.push(changed('policy_changed', 'policies', oldProfile.policies || [], newProfile.policies || [], 'high'))
  }

  if (JSON.stringify(oldProfile.business?.contact || {}) !== JSON.stringify(newProfile.business?.contact || {})) {
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
    requiresApproval: requiresApproval([change]),
    affectedArtifacts: resolveAffectedArtifacts([change]),
  }))
}
