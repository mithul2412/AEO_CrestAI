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
    requiresApproval: true,
  })
  expect(pricingChange.affectedArtifacts).toEqual(expect.arrayContaining([
    'hosted_profile',
    'llms_full_txt',
    'json_ld',
    'structured_service_product_data',
  ]))
})

test('detectProfileChanges flags new and removed services/products', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()
  newProfile.services.push({
    id: 'service-new-audit',
    name: 'AI Visibility Audit Service',
    sourceUrl: newProfile.source.sourceUrl,
    sourceText: 'AI Visibility Audit Service',
  })
  newProfile.products = []

  const changes = detectProfileChanges(oldProfile, newProfile)

  expect(changes).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'new_service_added' }),
    expect.objectContaining({ type: 'product_removed' }),
  ]))
})

test('detectProfileChanges flags booking link, FAQ, policy, contact, robots, schema, and standard changes', () => {
  const oldProfile = buildProfile()
  const newProfile = buildProfile()

  oldProfile.actions[0].status = 'active'
  newProfile.actions[0] = { ...newProfile.actions[0], status: 'broken' }
  newProfile.faqs = newProfile.faqs.slice(0, 1)
  oldProfile.policies = [{ name: 'Refund policy', sourceText: 'No refund policy listed.' }]
  newProfile.policies = [{ name: 'Refund policy', sourceText: 'Refunds are available for 30 days.' }]
  newProfile.business.contact.email = 'new-readiness@crest.example'
  oldProfile.metadata.robotsTxtHash = 'robots-v1'
  newProfile.metadata.robotsTxtHash = 'robots-v2'
  oldProfile.metadata.schemaHash = 'schema-v1'
  newProfile.metadata.schemaHash = ''
  oldProfile.metadata.aiStandardVersion = '2025-01'
  newProfile.metadata.aiStandardVersion = '2026-01'

  const changes = detectProfileChanges(oldProfile, newProfile)
  const types = changes.map(change => change.type)

  expect(types).toEqual(expect.arrayContaining([
    'broken_booking_link',
    'faq_changed',
    'policy_changed',
    'contact_info_changed',
    'robots_txt_changed',
    'schema_removed',
    'ai_standard_changed',
  ]))
  expect(changes.find(change => change.type === 'policy_changed').requiresApproval).toBe(true)
})

test('resolveAffectedArtifacts and requiresApproval expose scaffolding helpers', () => {
  expect(resolveAffectedArtifacts([{ type: 'pricing_changed' }, { type: 'contact_info_changed' }])).toEqual(expect.arrayContaining([
    'hosted_profile',
    'json_ld',
    'action_metadata',
  ]))
  expect(requiresApproval([{ type: 'pricing_changed' }])).toBe(true)
  expect(requiresApproval([{ type: 'page_content_changed', newValue: 'Minor copy update' }])).toBe(false)
})
