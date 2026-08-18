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
  if (value === 'allowed' || value === true) return { label: 'Allowed', tone: 'ok' }
  if (value === 'blocked' || value === false) return { label: 'Blocked', tone: 'danger' }
  if (value === 'unknown' || value == null) return { label: 'Unknown', tone: 'muted' }
  return { label: String(value), tone: 'muted' }
}

export default function Source() {
  const { hasFetched, pageIntelligence, sourceSignals, markdown, normalizedUrl, charCount } = useRun()
  const [previewOpen, setPreviewOpen] = useState(false)

  if (!hasFetched) {
    return (
      <EmptyBlock
        kicker="Source Audit"
        title="No page loaded"
        copy="Fetch a live URL from Overview to inspect the crawl, extraction, and source signals Crest used."
      />
    )
  }

  const access = pageIntelligence?.access || {}
  const extraction = pageIntelligence?.extraction || {}
  const robots = access.robots || {}
  const warnings = [...(access.warnings || []), ...(extraction.warnings || [])]
  const llmsTxt = sourceSignals?.llmsTxt || {}
  const llmsFullTxt = sourceSignals?.llmsFullTxt || {}
  const crawlerEntries = Object.entries(robots).map(([key, value]) => {
    const status = statusValue(value)
    return {
      key,
      name: CRAWLER_LABEL[key] || key,
      status: status.label,
      tone: status.tone,
    }
  })
  const crawlerIssues = crawlerEntries.filter(crawler => crawler.tone !== 'ok')
  const crawlerAccess = crawlerEntries.length === 0
    ? { label: 'Not checked', tone: 'muted' }
    : crawlerIssues.length === 0
      ? { label: 'All checked crawlers allowed', tone: 'ok' }
      : {
          label: `${crawlerIssues.length} crawler ${crawlerIssues.length === 1 ? 'issue' : 'issues'} detected`,
          tone: crawlerIssues.some(crawler => crawler.tone === 'danger') ? 'danger' : 'warn',
        }

  const httpTone = access.statusCode >= 400 ? 'danger'
    : access.statusCode >= 300 ? 'warn'
    : access.statusCode ? 'ok' : 'muted'

  return (
    <>
      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Source Audit</span>
            <h2 className="h-2">{normalizedUrl || 'Source page'}</h2>
            <p className="caption">Use this view when a score looks surprising and you need to verify what Crest fetched, extracted, and checked.</p>
          </div>
          <StatPill tone={httpTone}>HTTP {access.statusCode ?? '—'}</StatPill>
        </div>

        <div className="data-list">
          <DataRow label="HTTP status" value={access.statusCode ?? 'Unknown'} tone={httpTone} />
          <DataRow label="Final URL" value={access.finalUrl || normalizedUrl || '—'} />
          <DataRow label="Canonical" value={access.canonical || 'Not declared'} tone={access.canonical ? null : 'muted'} />
          <DataRow
            label="Search eligibility"
            hint="Whether search and AI systems are likely allowed to include this page."
            value={access.indexable === false ? 'Blocked' : access.indexable === true ? 'Allowed' : 'Unknown'}
            tone={access.indexable === false ? 'danger' : access.indexable === true ? 'ok' : 'muted'}
          />
          <DataRow
            label="AI crawler access"
            hint="Summarizes robots policy for checked AI/search crawlers."
            value={crawlerAccess.label}
            tone={crawlerAccess.tone}
          />
          {crawlerIssues.map(crawler => (
            <DataRow key={crawler.key} label={crawler.name} value={crawler.status} tone={crawler.tone} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">Extracted Identity</span>
            <h2 className="h-2">What Crest recognized on the page.</h2>
          </div>
        </div>
        <div className="data-list">
          <DataRow label="Title" value={extraction.title || 'Missing'} tone={extraction.title ? null : 'danger'} mono={false} />
          <DataRow label="H1" value={extraction.h1 || 'Missing'} tone={extraction.h1 ? null : 'danger'} mono={false} />
          <DataRow label="Word count" value={(extraction.wordCount || 0).toLocaleString()} />
          <DataRow label="Char count" value={charCount.toLocaleString()} />
        </div>
      </section>

      <section className="section">
        <div className="section__head">
          <div className="section__head-titles">
            <span className="kicker">AI-readable Signals</span>
            <h2 className="h-2">Files and markup Crest checked.</h2>
          </div>
        </div>
        <div className="data-list">
          <DataRow
            label="Schema types"
            value={extraction.schemaTypes?.length ? extraction.schemaTypes.join(', ') : 'None detected'}
            tone={extraction.schemaTypes?.length ? 'ok' : 'muted'}
            mono={false}
          />
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
            <span className="kicker">AI-readable source preview</span>
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
