import { useState } from 'react'
import { useRun } from '../state/RunContext.jsx'
import DataRow from '../components/primitives/DataRow.jsx'
import StatPill from '../components/primitives/StatPill.jsx'
import { EmptyBlock } from '../components/primitives/StateBlocks.jsx'

const CRAWLER_LABEL = {
  googlebot: 'Googlebot',
  oaiSearchBot: 'OAI-SearchBot',
  gptBot: 'GPTBot',
  perplexityBot: 'PerplexityBot',
}

function statusValue(value) {
  if (value === true) return { label: 'Allowed', tone: 'ok' }
  if (value === false) return { label: 'Blocked', tone: 'danger' }
  if (value == null) return { label: 'Unknown', tone: 'muted' }
  return { label: String(value), tone: 'muted' }
}

export default function Source() {
  const { hasFetched, pageIntelligence, sourceSignals, markdown, normalizedUrl, charCount } = useRun()
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!hasFetched) {
    return (
      <EmptyBlock
        kicker="Source"
        title="No page loaded"
        copy="Fetch a live URL from Overview to populate this view."
      />
    )
  }

  const access = pageIntelligence?.access || {}
  const extraction = pageIntelligence?.extraction || {}
  const robots = access.robots || {}
  const warnings = [...(access.warnings || []), ...(extraction.warnings || [])]
  const llmsTxt = sourceSignals?.llmsTxt || {}
  const llmsFullTxt = sourceSignals?.llmsFullTxt || {}

  const httpTone = access.statusCode >= 400 ? 'danger'
    : access.statusCode >= 300 ? 'warn'
    : access.statusCode ? 'ok' : 'muted'

  return (
    <>
      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Source · what AI saw</span>
            <h2 className="h-2">{normalizedUrl || 'Source page'}</h2>
          </div>
          <StatPill tone={httpTone}>HTTP {access.statusCode ?? '—'}</StatPill>
        </div>

        <div className="data-list">
          <DataRow label="Final URL" value={access.finalUrl || normalizedUrl || '—'} />
          <DataRow label="Canonical" value={access.canonical || 'Not declared'} tone={access.canonical ? null : 'muted'} />
          <DataRow
            label="Search eligibility"
            hint="Whether search and AI systems are likely allowed to include this page."
            value={access.indexable === false ? 'Blocked' : access.indexable === true ? 'Allowed' : 'Unknown'}
            tone={access.indexable === false ? 'danger' : access.indexable === true ? 'ok' : 'muted'}
          />
          <DataRow label="Word count" value={(extraction.wordCount || 0).toLocaleString()} />
          <DataRow label="Char count" value={charCount.toLocaleString()} />
          <DataRow
            label="llms.txt"
            value={llmsTxt.present ? 'Found' : 'Missing'}
            tone={llmsTxt.present ? 'ok' : 'muted'}
          />
          <DataRow
            label="llms-full.txt"
            value={llmsFullTxt.present ? 'Found' : 'Missing'}
            tone={llmsFullTxt.present ? 'ok' : 'muted'}
          />
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Crawler matrix</span>
            <h2 className="h-2">Robots policy by AI agent.</h2>
          </div>
        </div>
        <div className="data-list">
          {Object.entries(robots).length === 0 && (
            <DataRow label="No robots policy detected" value="Unknown" tone="muted" />
          )}
          {Object.entries(robots).map(([key, value]) => {
            const v = statusValue(value)
            return <DataRow key={key} label={CRAWLER_LABEL[key] || key} value={v.label} tone={v.tone} />
          })}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Extraction</span>
            <h2 className="h-2">What AI sees as page identity.</h2>
          </div>
        </div>
        <div className="data-list">
          <DataRow label="Title" value={extraction.title || 'Missing'} tone={extraction.title ? null : 'danger'} />
          <DataRow label="H1" value={extraction.h1 || 'Missing'} tone={extraction.h1 ? null : 'danger'} />
          <DataRow
            label="Schema types"
            value={extraction.schemaTypes?.length ? extraction.schemaTypes.join(', ') : 'None detected'}
            tone={extraction.schemaTypes?.length ? 'ok' : 'muted'}
          />
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Warnings</span>
            <h2 className="h-2">Invisible content risks.</h2>
          </div>
          <StatPill tone={warnings.length ? 'warn' : 'ok'}>
            {warnings.length || 0} flagged
          </StatPill>
        </div>
        <div className="warning-list">
          {warnings.length ? warnings.map((w, i) => (
            <div key={`${w}-${i}`} className="warning-item">{w}</div>
          )) : (
            <div className="warning-item ok">No major access or extraction warnings detected.</div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">AI-readable preview</span>
            <h2 className="h-2">The markdown Crest.ai analyzed.</h2>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPreviewOpen(v => !v)}>
            {previewOpen ? 'Hide preview' : 'Show preview'}
          </button>
        </div>
        {previewOpen && (
          <pre className="code-block">
            {markdown ? markdown.slice(0, 8000) : 'No markdown available.'}
            {markdown && markdown.length > 8000 ? `\n\n… +${(markdown.length - 8000).toLocaleString()} more characters` : ''}
          </pre>
        )}
      </section>
    </>
  )
}
