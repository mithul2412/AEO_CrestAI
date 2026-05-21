import { useState } from 'react'

const PAGE_TYPES = ['product', 'landing', 'pricing', 'comparison', 'faq', 'service']

export function InputForm({ onSubmit, loading }) {
  const [mode, setMode] = useState('url') // 'url' | 'draft'
  const [url, setUrl] = useState('')
  const [draft, setDraft] = useState('')
  const [pageType, setPageType] = useState('product')
  const [targetCustomer, setTargetCustomer] = useState('')
  const [primaryAction, setPrimaryAction] = useState('book demo')
  const [competitors, setCompetitors] = useState('')
  const [category, setCategory] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (loading) return
    const compList = competitors.split(',').map(s => s.trim()).filter(Boolean)
    onSubmit({
      url: mode === 'url' ? url.trim() : '',
      draft_content: mode === 'draft' ? draft.trim() : '',
      page_type: pageType,
      target_customer: targetCustomer.trim(),
      primary_action: primaryAction.trim(),
      competitors: compList,
      category: category.trim(),
    })
  }

  const canSubmit = !loading && (mode === 'url' ? url.trim() : draft.trim().length > 100)

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 8 }}>
        {[['url', 'Analyze URL'], ['draft', 'Paste Draft Content']].map(([m, label]) => (
          <button key={m} type="button"
            onClick={() => setMode(m)}
            style={{
              padding: '7px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', border: '1px solid',
              borderColor: mode === m ? 'var(--accent)' : 'var(--border)',
              background: mode === m ? 'rgba(99,102,241,0.15)' : 'transparent',
              color: mode === m ? 'var(--accent)' : 'var(--fg-muted)',
              transition: 'all 0.15s',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* URL or draft */}
      {mode === 'url' ? (
        <div>
          <label style={labelStyle}>Page URL</label>
          <input className="input" type="url" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://yourcompany.com/product" required />
          <p style={hintStyle}>We'll fetch this page via Jina Reader and analyze it.</p>
        </div>
      ) : (
        <div>
          <label style={labelStyle}>Draft Page Content</label>
          <textarea className="input" value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="Paste your full draft page content here — at least a few paragraphs…"
            style={{ minHeight: 200 }} />
          <p style={hintStyle}>{draft.split(/\s+/).filter(Boolean).length} words · minimum 100</p>
        </div>
      )}

      {/* Row 1: page type + category */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={labelStyle}>Page Type</label>
          <select className="input" value={pageType} onChange={e => setPageType(e.target.value)}>
            {PAGE_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Product Category <span style={{ color: 'var(--fg-subtle)' }}>(optional)</span></label>
          <input className="input" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="e.g. AI customer support software" />
        </div>
      </div>

      {/* Row 2: target customer + primary action */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={labelStyle}>Target Customer</label>
          <input className="input" value={targetCustomer} onChange={e => setTargetCustomer(e.target.value)}
            placeholder="e.g. ecommerce brands with 10-100 agents" />
        </div>
        <div>
          <label style={labelStyle}>Primary Action</label>
          <input className="input" value={primaryAction} onChange={e => setPrimaryAction(e.target.value)}
            placeholder="e.g. book demo" />
        </div>
      </div>

      {/* Competitors */}
      <div>
        <label style={labelStyle}>Competitors <span style={{ color: 'var(--fg-subtle)' }}>(optional, comma-separated)</span></label>
        <input className="input" value={competitors} onChange={e => setCompetitors(e.target.value)}
          placeholder="e.g. Zendesk, Gorgias, Intercom" />
      </div>

      <button type="submit" className="btn btn-primary" disabled={!canSubmit}
        style={{ alignSelf: 'flex-start', padding: '10px 28px', fontSize: 15 }}>
        {loading ? <><span className="spin" style={spinStyle} /> Analyzing…</> : 'Run AEO Analysis →'}
      </button>
    </form>
  )
}

const labelStyle = {
  display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--fg-muted)',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6,
}
const hintStyle = { fontSize: 11, color: 'var(--fg-subtle)', marginTop: 5 }
const spinStyle = {
  display: 'inline-block', width: 14, height: 14,
  border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff',
  borderRadius: '50%',
}
