import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectProfileChanges, requiresApproval, resolveAffectedArtifacts } from '../agentic/services/changeDetectionService.js'
import { extractCanonicalProfile } from '../agentic/services/profileExtractor.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureMarkdown = fs.readFileSync(path.join(__dirname, 'fixtures', 'agenticSampleMarkdown.md'), 'utf8')

function buildProfile() {
  return extractCanonicalProfile({
    url: 'https://crest.example/services/ai-readiness',
    markdown: fixtureMarkdown,
    sourceSignals: {
      sourceUrl: 'https://crest.example/services/ai-readiness',
      origin: 'https://crest.example',
    },
  })
}

test('detectProfileChanges returns no changes for matching profiles', () => {
  const oldProfile = buildProfile()
  const newProfile = structuredClone(oldProfile)

  expect(detectProfileChanges(oldProfile, newProfile)).toEqual([])
})

test('detectProfileChanges flags pricing changes as approval-required', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()
  newProfile.claims = newProfile.claims.map(claim => claim.claimType === 'pricing'
    ? {
        ...claim,
        claim: 'Pricing starts at $12,000 per month for managed readiness programs.',
        sourceText: 'Pricing starts at $12,000 per month for managed readiness programs.',
      }
    : claim)

  const changes = detectProfileChanges(oldProfile, newProfile)
  const pricingChange = changes.find(change => change.type === 'pricing_changed')

  expect(pricingChange).toMatchObject({
    type: 'pricing_changed',
    severity: 'high',
    approval_required: true,
    auto_publish_allowed: false,
    requiresApproval: true,
  })
  expect(pricingChange.affectedArtifacts).toEqual(expect.arrayContaining([
    'hosted_profile',
    'llms_full_txt',
    'json_ld',
    'structured_service_product_data',
  ]))
})

test('detectProfileChanges flags new service/product additions', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()
  newProfile.services.push({
    id: 'service-new-audit',
    name: 'AI Visibility Audit Service',
    sourceUrl: newProfile.source.sourceUrl,
    sourceText: 'AI Visibility Audit Service',
  })
  newProfile.products.push({
    id: 'product-agentic-dashboard',
    name: 'Agentic Monitoring Dashboard',
    sourceUrl: newProfile.source.sourceUrl,
    sourceText: 'Agentic Monitoring Dashboard',
  })

  const changes = detectProfileChanges(oldProfile, newProfile)

  expect(changes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'new_service_or_product',
      path: 'services.service-new-audit',
      approval_required: false,
      auto_publish_allowed: true,
      metadata: expect.objectContaining({ item_kind: 'service' }),
    }),
    expect.objectContaining({
      type: 'new_service_or_product',
      path: 'products.product-agentic-dashboard',
      metadata: expect.objectContaining({ item_kind: 'product' }),
    }),
  ]))
})

test('detectProfileChanges flags removed service/product entries', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()
  oldProfile.services.push({
    id: 'service-retired',
    name: 'Retired Readiness Sprint',
    sourceUrl: oldProfile.source.sourceUrl,
    sourceText: 'Retired Readiness Sprint',
  })
  oldProfile.products.push({
    id: 'product-retired',
    name: 'Retired Readiness Report',
    sourceUrl: oldProfile.source.sourceUrl,
    sourceText: 'Retired Readiness Report',
  })

  const changes = detectProfileChanges(oldProfile, newProfile)

  expect(changes).toEqual(expect.arrayContaining([
    expect.objectContaining({
      type: 'removed_service_or_product',
      path: 'services.service-retired',
      metadata: expect.objectContaining({ item_kind: 'service' }),
    }),
    expect.objectContaining({
      type: 'removed_service_or_product',
      path: 'products.product-retired',
      metadata: expect.objectContaining({ item_kind: 'product' }),
    }),
  ]))
})

test('detectProfileChanges flags contact info changes', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()

  newProfile.business.contact.email = 'new-readiness@crest.example'

  const changes = detectProfileChanges(oldProfile, newProfile)

  expect(changes).toEqual([
    expect.objectContaining({
      type: 'contact_info_changed',
      path: 'business.contact',
      approval_required: false,
      auto_publish_allowed: true,
    }),
  ])
})

test('detectProfileChanges flags FAQ changes', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()

  newProfile.faqs = newProfile.faqs.slice(0, 1)

  const changes = detectProfileChanges(oldProfile, newProfile)

  expect(changes).toEqual([
    expect.objectContaining({
      type: 'faq_changed',
      path: 'faqs',
      affected_artifacts: expect.arrayContaining(['hosted_profile', 'llms_full_txt', 'json_ld']),
    }),
  ])
})

test('detectProfileChanges flags action, policy, robots, schema, and standard changes', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()

  oldProfile.actions[0].status = 'active'
  newProfile.actions[0] = { ...newProfile.actions[0], status: 'broken' }
  oldProfile.policies = [{ name: 'Refund policy', sourceText: 'No refund policy listed.' }]
  newProfile.policies = [{ name: 'Refund policy', sourceText: 'Refunds are available for 30 days.' }]
  oldProfile.metadata.robotsTxtHash = 'robots-v1'
  newProfile.metadata.robotsTxtHash = 'robots-v2'
  oldProfile.metadata.schemaHash = 'schema-v1'
  newProfile.metadata.schemaHash = ''
  oldProfile.metadata.aiStandardVersion = '2025-01'
  newProfile.metadata.aiStandardVersion = '2026-01'

  const changes = detectProfileChanges(oldProfile, newProfile)
  const types = changes.map(change => change.type)

  expect(types).toEqual(expect.arrayContaining([
    'broken_action_link',
    'policy_changed',
    'robots_txt_changed',
    'schema_removed',
    'ai_standard_changed',
  ]))
  expect(changes.find(change => change.type === 'policy_changed').approval_required).toBe(true)
})

test('resolveAffectedArtifacts and requiresApproval expose change-event helpers', () => {
  expect(resolveAffectedArtifacts([{ type: 'pricing_changed' }, { type: 'contact_info_changed' }])).toEqual(expect.arrayContaining([
    'hosted_profile',
    'json_ld',
    'action_metadata',
  ]))
  expect(requiresApproval([{ type: 'pricing_changed' }])).toBe(true)
  expect(requiresApproval([{ type: 'page_content_changed', newValue: 'Certified financial guarantee available now' }])).toBe(true)
  expect(requiresApproval([{ type: 'page_content_changed', newValue: 'Minor copy update' }])).toBe(false)
})
