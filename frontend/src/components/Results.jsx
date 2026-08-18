import { useState } from 'react'
import { ScoreRing, scoreColor, scoreLabel } from './ScoreRing.jsx'

const DIM_LABELS = {
  specificity: 'Specificity',
  query_coverage: 'Query Coverage',
  extractability: 'Extractability',
  competitor_gap: 'Competitor Gap',
  trust_density: 'Trust Density',
  action_clarity: 'Action Clarity',
}
const DIM_WEIGHTS = {
  specificity: '25%', query_coverage: '20%', extractability: '20%',
  competitor_gap: '15%', trust_density: '10%', action_clarity: '10%',
}

export function Results({ result }) {
  const [tab, setTab] = useState('scorecard')
  const { scorecard, rewrites, decomposition, competitor_research, queries } = result
  const dims = scorecard?.dimensions || {}
  const overall = scorecard?.overall_score ?? 0
  const improvements = scorecard?.top_3_improvements || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} className="slide-up">

      {/* Hero */}
      <div className="card" style={{ padding: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <ScoreRing score={overall} label="AEO Score" size={110} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="tag tag-teal" style={{ marginBottom: 8 }}>{result.page_type} page</div>
            <h2 style={{ fontSize: '1.4rem', marginBottom: 4 }}>{result.url || 'Draft analysis'}</h2>
            {result.target_customer && (
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', marginBottom: 10 }}>
                For: {result.target_customer}
              </p>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <span className={`tag ${overall >= 70 ? 'tag-teal' : overall >= 45 ? 'tag-orange' : 'tag-rose'}`}>
                {scoreLabel(overall)} AEO readiness
              </span>
              <span className="tag tag-subtle">{result.word_count?.toLocaleString()} words</span>
              <span className="tag tag-subtle">{queries?.length || 0} queries tested</span>
              {competitor_research?.pages_analyzed > 0 && (
                <span className="tag tag-subtle">{competitor_research.pages_analyzed} competitor pages analyzed</span>
              )}
            </div>
          </div>

          {/* Mini dimension grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {Object.entries(DIM_LABELS).map(([key, label]) => {
              const s = dims[key]?.score ?? null
              return (
                <div key={key} className="card-2" style={{ padding: '8px 12px', textAlign: 'center', minWidth: 80 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: scoreColor(s) }}>{s ?? '—'}</div>
                  <div style={{ fontSize: 10, color: 'var(--fg-subtle)', marginTop: 2 }}>{label}</div>
                </div>
              )
            })}
          </div>
        </div>

        {scorecard?.score_rationale && (
          <p style={{ marginTop: 14, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            {scorecard.score_rationale}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {[
          ['scorecard', '📊 Scorecard'],
          ['rewrites', '✍️ Rewrites'],
          ['gaps', '🎯 Gap Analysis'],
          ['competitors', '⚔️ Competitors'],
          ['queries', '🔍 Queries'],
        ].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              borderColor: tab === id ? 'var(--accent)' : 'var(--border)',
              background: tab === id ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: tab === id ? 'var(--accent)' : 'var(--fg-muted)',
              transition: 'all 0.15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Scorecard tab ─────────────────────────────────────── */}
      {tab === 'scorecard' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {Object.entries(DIM_LABELS).map(([key, label]) => {
            const dim = dims[key] || {}
            const s = dim.score ?? null
            return (
              <DimCard key={key} label={label} score={s} weight={DIM_WEIGHTS[key]}
                evidence={dim.evidence} gap={dim.gap} benchmarkNote={dim.benchmark_note}
                answered={dim.answered_queries} unanswered={dim.unanswered_queries}
                found={dim.found_signals} missing={dim.missing_signals}
              />
            )
          })}

          {improvements.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <SectionHeader label="Top 3 Improvements" accent="teal" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 12 }}>
                {improvements.map((imp, i) => (
                  <div key={i} className="card-2" style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>#{i + 1}</span>
                      <span className={`tag ${imp.effort === 'low' ? 'tag-teal' : imp.effort === 'medium' ? 'tag-orange' : 'tag-rose'}`}>
                        {imp.effort} effort
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--teal)', fontWeight: 600 }}>+{imp.expected_score_delta}pts</span>
                    </div>
                    <p style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{imp.improvement}</p>
                    <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 3 }}>Fixes: {imp.dimension}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Rewrites tab ──────────────────────────────────────── */}
      {tab === 'rewrites' && rewrites && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {rewrites.rewritten_intro?.text && (
            <ContentBlock title="Rewritten Intro" rationale={rewrites.rewritten_intro.rationale}
              content={rewrites.rewritten_intro.text} />
          )}
          {rewrites.rewritten_h2_headings?.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <SectionHeader label="Rewritten H2 Headings" accent="accent" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {rewrites.rewritten_h2_headings.map((h, i) => (
                  <div key={i} className="card-2" style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 2 }}>Before</div>
                        <div style={{ fontSize: 13, color: 'var(--fg-muted)', textDecoration: 'line-through' }}>{h.original}</div>
                      </div>
                      <div style={{ fontSize: 16, color: 'var(--border-strong)' }}>→</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 2 }}>After</div>
                        <div style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{h.improved}</div>
                      </div>
                    </div>
                    {h.why && <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 6 }}>{h.why}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {rewrites.faq_block?.length > 0 && (
            <FAQBlock faqs={rewrites.faq_block} />
          )}
          {rewrites.comparison_section?.text && (
            <ContentBlock title="Comparison Section"
              rationale={`Covers: ${rewrites.comparison_section.competitors_covered?.join(', ')}`}
              content={rewrites.comparison_section.text} />
          )}
          {rewrites.cta_rewrite?.improved && (
            <div className="card" style={{ padding: 20 }}>
              <SectionHeader label="CTA Rewrite" accent="accent" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <div className="card-2" style={{ padding: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginBottom: 6 }}>BEFORE</div>
                  <p style={{ fontSize: 14, color: 'var(--fg-muted)', textDecoration: 'line-through' }}>{rewrites.cta_rewrite.original || '(no CTA found)'}</p>
                </div>
                <div className="card-2" style={{ padding: 14, borderColor: 'rgba(45,212,191,0.2)' }}>
                  <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 6 }}>AFTER</div>
                  <p style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 600 }}>{rewrites.cta_rewrite.improved}</p>
                </div>
              </div>
              {rewrites.cta_rewrite.rationale && (
                <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 10 }}>{rewrites.cta_rewrite.rationale}</p>
              )}
            </div>
          )}
          {rewrites.before_after_summary && (
            <div className="card" style={{ padding: 16, borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)' }}>
              <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.7 }}>{rewrites.before_after_summary}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Gap Analysis tab ──────────────────────────────────── */}
      {tab === 'gaps' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 20 }}>
            <SectionHeader label="Page Decomposition" accent="teal" />
            <DecompCard d={decomposition} />
          </div>
          {dims.query_coverage?.unanswered_queries?.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <SectionHeader label={`Unanswered Queries (${dims.query_coverage.unanswered_queries.length})`} accent="rose" />
              <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 6, marginBottom: 12 }}>
                These are queries your target customers type — and your page doesn't answer them.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {dims.query_coverage.unanswered_queries.map((q, i) => (
                  <div key={i} className="card-2" style={{ padding: '8px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span style={{ color: 'var(--rose)', fontSize: 12 }}>✗</span>
                    <span style={{ fontSize: 13 }}>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Competitors tab ───────────────────────────────────── */}
      {tab === 'competitors' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {competitor_research?.key_insight && (
            <div className="card" style={{ padding: 16, borderColor: 'rgba(99,102,241,0.2)', background: 'rgba(99,102,241,0.05)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Key Insight</div>
              <p style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.7 }}>{competitor_research.key_insight}</p>
            </div>
          )}
          <BenchmarkCard benchmark={competitor_research?.benchmark} decomposition={decomposition} />
          {competitor_research?.must_have_sections?.length > 0 && (
            <div className="card" style={{ padding: 20 }}>
              <SectionHeader label="Must-Have Sections (top pages)" accent="teal" />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {competitor_research.must_have_sections.map((s, i) => (
                  <div key={i} className="card-2" style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.section}</span>
                      <span style={{ fontSize: 12, color: 'var(--teal)' }}>{Math.round((s.frequency || 0) * 100)}% of pages</span>
                    </div>
                    {s.why_it_matters && <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{s.why_it_matters}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Queries tab ───────────────────────────────────────── */}
      {tab === 'queries' && queries?.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <SectionHeader label={`${queries.length} Query Variants Generated`} accent="teal" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
            {queries.map((q, i) => (
              <div key={i} className="card-2" style={{ padding: '8px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={`tag tag-${intentColor(q.intent)}`} style={{ flexShrink: 0, minWidth: 90, justifyContent: 'center' }}>
                  {q.intent}
                </span>
                <span style={{ fontSize: 13 }}>{q.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label, accent = 'teal' }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: `var(--${accent})`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {label}
    </div>
  )
}

function DimCard({ label, score, weight, evidence, gap, answered, unanswered, found, missing }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)}
        style={{ width: '100%', padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: scoreColor(score) }}>{score ?? '—'}</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg)' }}>{label}</div>
            <div style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>Weight: {weight}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 80 }}>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${score ?? 0}%`, background: scoreColor(score), borderRadius: 2, transition: 'width 0.8s ease' }} />
              </div>
            </div>
            <span style={{ fontSize: 11, color: 'var(--fg-subtle)' }}>{open ? '▲' : '▼'}</span>
          </div>
        </div>
      </button>
      {open && (
        <div style={{ padding: '0 18px 16px', borderTop: '1px solid var(--border)' }}>
          {evidence && <InfoRow label="Evidence" text={evidence} />}
          {gap && <InfoRow label="Gap" text={gap} color="var(--orange)" />}
          {answered?.length > 0 && <TagList label="Answers" items={answered} color="teal" />}
          {unanswered?.length > 0 && <TagList label="Missing" items={unanswered} color="rose" />}
          {found?.length > 0 && <TagList label="Found" items={found} color="teal" />}
          {missing?.length > 0 && <TagList label="Missing" items={missing} color="rose" />}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, text, color = 'var(--fg-muted)' }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <p style={{ fontSize: 12, color, lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}

function TagList({ label, items, color }) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {items.slice(0, 8).map((item, i) => (
          <span key={i} className={`tag tag-${color}`}>{item}</span>
        ))}
      </div>
    </div>
  )
}

function ContentBlock({ title, rationale, content }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <SectionHeader label={title} accent="accent" />
          {rationale && <p style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 4 }}>{rationale}</p>}
        </div>
        <button className="btn btn-ghost" onClick={copy} style={{ fontSize: 12, padding: '5px 12px' }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>
      <div className="card-2" style={{ padding: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--fg)', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>{content}</p>
      </div>
    </div>
  )
}

function FAQBlock({ faqs }) {
  const [open, setOpen] = useState(null)
  const allText = faqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n')
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(allText)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <SectionHeader label={`FAQ Block (${faqs.length} questions)`} accent="accent" />
        <button className="btn btn-ghost" onClick={copy} style={{ fontSize: 12, padding: '5px 12px' }}>
          {copied ? '✓ Copied' : 'Copy all'}
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {faqs.map((f, i) => (
          <div key={i} className="card-2" style={{ overflow: 'hidden' }}>
            <button onClick={() => setOpen(open === i ? null : i)}
              style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)' }}>{f.question}</span>
              <span style={{ fontSize: 11, color: 'var(--fg-subtle)', flexShrink: 0 }}>{open === i ? '▲' : '▼'}</span>
            </button>
            {open === i && (
              <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                <p style={{ fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7, paddingTop: 10 }}>{f.answer}</p>
                {f.targets_query && (
                  <p style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 6 }}>Targets: "{f.targets_query}"</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function BenchmarkCard({ benchmark, decomposition }) {
  if (!benchmark) return null
  const ts = decomposition?.trust_signals || {}
  const yourTrust = (ts.named_customers?.length || 0) + (ts.testimonials_with_attribution || 0) + (ts.case_study_metrics?.length || 0)
  const yourClaims = decomposition?.claims?.filter(c => c.type === 'specific').length || 0
  const yourFAQ = decomposition?.faq_question_count || 0

  const rows = [
    ['Specific claims', yourClaims, benchmark.avg_specific_claims],
    ['FAQ questions', yourFAQ, benchmark.avg_faq_questions],
    ['Trust signals', yourTrust, benchmark.avg_trust_signals],
  ]
  return (
    <div className="card" style={{ padding: 20 }}>
      <SectionHeader label="Your Page vs. Competitor Benchmark" accent="teal" />
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(([label, yours, bench]) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{label}</span>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: yours >= bench ? 'var(--teal)' : 'var(--rose)', fontWeight: 600 }}>{yours}</span>
                <span style={{ color: 'var(--fg-subtle)' }}> / {bench} avg</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 6, height: 6 }}>
              <div style={{ flex: 1, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(100, (yours / Math.max(bench * 1.5, 1)) * 100)}%`, background: yours >= bench ? 'var(--teal)' : 'var(--rose)', transition: 'width 0.8s ease', borderRadius: 3 }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DecompCard({ d }) {
  if (!d) return null
  const claims = d.claims || []
  const specific = claims.filter(c => c.type === 'specific')
  const vague = claims.filter(c => c.type === 'vague')
  return (
    <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        <Stat label="Specific claims" value={specific.length} color="teal" />
        <Stat label="Vague claims" value={vague.length} color="rose" />
        <Stat label="FAQ questions" value={d.faq_question_count || 0} color={d.faq_present ? 'teal' : 'rose'} />
        <Stat label="Specificity score" value={`${d.specificity_score ?? 0}/100`} color={d.specificity_score >= 50 ? 'teal' : 'orange'} />
      </div>
      {d.value_prop && (
        <div className="card-2" style={{ padding: '10px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--fg-subtle)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Value Proposition Detected</div>
          <p style={{ fontSize: 13, color: 'var(--fg)' }}>{d.value_prop}</p>
        </div>
      )}
      {vague.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: 'var(--rose)', marginBottom: 6 }}>Vague claims to fix:</div>
          {vague.slice(0, 4).map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--fg-muted)', paddingLeft: 10, borderLeft: '2px solid var(--rose)', marginBottom: 4 }}>{c.text}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div className="card-2" style={{ padding: '10px 14px' }}>
      <div style={{ fontSize: 18, fontWeight: 700, color: `var(--${color})` }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--fg-subtle)', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function intentColor(intent) {
  return { informational: 'accent', comparison: 'rose', commercial: 'teal', action: 'orange', trust: 'subtle', problem_first: 'subtle' }[intent] || 'subtle'
}
