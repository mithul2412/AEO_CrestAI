import { useState } from 'react'
import HostedProfilePreview from './HostedProfilePreview.jsx'
import ValidationReport from './ValidationReport.jsx'

const TABS = [
  ['overview', 'Overview'],
  ['profile', 'AI Profile'],
  ['llmsTxt', 'llms.txt'],
  ['llmsFullTxt', 'llms-full.txt'],
  ['jsonLd', 'JSON-LD'],
  ['faqBlock', 'FAQ block'],
  ['actionMetadata', 'Action metadata'],
  ['claimSourceMap', 'Claim-source map'],
  ['structuredServiceProductData', 'Structured data'],
  ['robotsRecommendations', 'robots.txt'],
  ['alternateLinkSnippet', 'rel alternate'],
  ['validation', 'Validation'],
  ['engineReadiness', 'Engine readiness'],
  ['hosted', 'Hosted links'],
]

function stringify(value) {
  if (value == null || value === '') return 'Not detected'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function copyValue(value) {
  const text = stringify(value)
  navigator.clipboard?.writeText(text)
}

function CopyBlock({ value, label = 'Copy' }) {
  return (
    <div className="agentic-code-wrap">
      <div className="agentic-code-actions">
        <button type="button" className="chip" onClick={() => copyValue(value)}>
          {label}
        </button>
      </div>
      <pre className="agentic-code">{stringify(value)}</pre>
    </div>
  )
}

function Overview({ result }) {
  const profile = result.canonicalProfile || {}
  const business = profile.business || {}
  const artifacts = result.artifacts || {}

  return (
    <div className="agentic-overview">
      <div className="agentic-summary-grid">
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Profile</span>
          <strong>{business.name || business.domain || 'Not detected'}</strong>
        </div>
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Slug</span>
          <strong>{result.slug || 'Not detected'}</strong>
        </div>
        <div className={`agentic-summary-card ${result.validation?.ok ? 'good' : 'warn'}`}>
          <span className="agentic-card-label">Validation</span>
          <strong>{result.validation?.ok ? 'OK' : 'Needs review'}</strong>
        </div>
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Artifacts</span>
          <strong>{Object.keys(artifacts).length}</strong>
        </div>
      </div>
      <p className="agentic-muted">
        {business.description || 'Not detected'}
      </p>
    </div>
  )
}

function EngineReadiness({ engineReadiness }) {
  const entries = Object.entries(engineReadiness || {})
  if (entries.length === 0) return <div className="agentic-empty">No engine readiness returned.</div>

  return (
    <div className="engine-readiness-grid">
      {entries.map(([engine, readout]) => (
        <div key={engine} className="engine-readiness-card">
          <div className="agentic-card-label">{engine}</div>
          <strong>{readout.score ?? 'Not detected'}</strong>
          <div className="agentic-check-list compact">
            {(readout.checks || []).map(check => (
              <div key={check.id} className={`agentic-check ${check.passed ? 'pass' : 'warn'}`}>
                <span>{check.passed ? 'Pass' : 'Warn'}</span>
                <small>{check.label}</small>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ArtifactTabs({ result }) {
  const [activeTab, setActiveTab] = useState('overview')
  const artifacts = result.artifacts || {}

  const tabContent = {
    overview: <Overview result={result} />,
    profile: <CopyBlock value={result.canonicalProfile} label="Copy profile" />,
    llmsTxt: <CopyBlock value={artifacts.llmsTxt} label="Copy llms.txt" />,
    llmsFullTxt: <CopyBlock value={artifacts.llmsFullTxt} label="Copy llms-full.txt" />,
    jsonLd: <CopyBlock value={`<script type="application/ld+json">\n${JSON.stringify(artifacts.jsonLd || [], null, 2)}\n</script>`} label="Copy JSON-LD" />,
    faqBlock: <CopyBlock value={artifacts.faqBlock} label="Copy FAQ" />,
    actionMetadata: <CopyBlock value={artifacts.actionMetadata} label="Copy actions" />,
    claimSourceMap: <CopyBlock value={artifacts.claimSourceMap} label="Copy claims" />,
    structuredServiceProductData: <CopyBlock value={artifacts.structuredServiceProductData} label="Copy structured data" />,
    robotsRecommendations: <CopyBlock value={artifacts.robotsRecommendations} label="Copy robots recommendations" />,
    alternateLinkSnippet: <CopyBlock value={artifacts.alternateLinkSnippet} label="Copy snippet" />,
    validation: <ValidationReport validation={result.validation} />,
    engineReadiness: <EngineReadiness engineReadiness={result.engineReadiness} />,
    hosted: <HostedProfilePreview hostedProfile={result.hostedProfile} />,
  }

  return (
    <div className="artifact-tabs">
      <div className="artifact-tab-list" role="tablist" aria-label="Agentic artifacts">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            className={`tab-btn${activeTab === id ? ' active' : ''}`}
            onClick={() => setActiveTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="artifact-tab-panel" role="tabpanel">
        {tabContent[activeTab]}
      </div>
    </div>
  )
}
