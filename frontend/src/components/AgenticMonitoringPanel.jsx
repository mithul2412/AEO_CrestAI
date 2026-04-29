import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  approveAgenticApproval,
  listAgenticApprovals,
  listAgenticProfiles,
  rejectAgenticApproval,
  rescanAgenticProfile,
} from '../utils/agenticApi.js'

function formatDate(value) {
  if (!value) return 'Not detected'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function stringifyValue(value) {
  if (value == null || value === '') return 'Not detected'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function statusLabel(value) {
  return String(value || 'not_scanned').replace(/_/g, ' ')
}

function artifactLabel(value) {
  return String(value || '').replace(/_/g, ' ')
}

function ApprovalCard({ approval, onApprove, onReject, busyId }) {
  const busy = busyId === approval.id
  const eventSummaries = approval.eventSummaries || []
  const affectedArtifacts = approval.affectedArtifacts || []
  const oldValues = approval.oldValues || []
  const newValues = approval.newValues || []

  return (
    <div className="approval-card">
      <div className="approval-card-head">
        <div>
          <div className="agentic-card-label">Approval</div>
          <strong>{approval.status || 'pending'}</strong>
        </div>
        <span className={`summary-pill ${approval.status === 'pending' ? 'warn' : 'ok'}`}>
          {approval.status || 'pending'}
        </span>
      </div>

      <div className="approval-events">
        {eventSummaries.map(event => (
          <div key={event.id || `${event.type}-${event.path}`} className="approval-event">
            <div className="approval-event-main">
              <strong>{event.type?.replace(/_/g, ' ') || 'Change detected'}</strong>
              <span>{event.path || 'profile'}</span>
            </div>
            <small>{event.summary || 'Approval required before publishing.'}</small>
          </div>
        ))}
      </div>

      {affectedArtifacts.length > 0 && (
        <div className="agentic-pill-row" aria-label="Affected artifacts">
          {affectedArtifacts.map(artifact => (
            <span key={artifact} className="summary-pill">
              {artifactLabel(artifact)}
            </span>
          ))}
        </div>
      )}

      {(oldValues.length > 0 || newValues.length > 0) && (
        <div className="approval-values">
          {(eventSummaries.length ? eventSummaries : [{ id: 'change' }]).map(event => {
            const oldValue = oldValues.find(item => item.eventId === event.id)
            const newValue = newValues.find(item => item.eventId === event.id)
            return (
              <div key={event.id || 'change'} className="approval-value-pair">
                <div>
                  <span className="agentic-card-label">Old</span>
                  <pre>{stringifyValue(oldValue?.value)}</pre>
                </div>
                <div>
                  <span className="agentic-card-label">New</span>
                  <pre>{stringifyValue(newValue?.value)}</pre>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {approval.status === 'pending' && (
        <div className="approval-actions">
          <button
            type="button"
            className="chip chip-primary"
            onClick={() => onApprove(approval.id)}
            disabled={busy}
          >
            {busy ? 'Approving...' : 'Approve'}
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => onReject(approval.id)}
            disabled={busy}
          >
            {busy ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      )}
    </div>
  )
}

export default function AgenticMonitoringPanel({ result, onResultUpdate }) {
  const slug = result?.slug
  const [profileSummary, setProfileSummary] = useState(null)
  const [approvals, setApprovals] = useState([])
  const [rescanContent, setRescanContent] = useState('')
  const [rescanResult, setRescanResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [approvalBusyId, setApprovalBusyId] = useState('')
  const [error, setError] = useState('')

  const refreshState = useCallback(async () => {
    if (!slug) return
    const [profilesData, approvalsData] = await Promise.all([
      listAgenticProfiles(),
      listAgenticApprovals({ status: 'pending' }),
    ])
    setProfileSummary((profilesData.profiles || []).find(profile => profile.slug === slug) || null)
    setApprovals((approvalsData.approvals || []).filter(approval => approval.slug === slug))
  }, [slug])

  useEffect(() => {
    setError('')
    setRescanResult(null)
    void refreshState().catch(err => {
      setError(err?.message || 'Unable to load agentic monitoring state')
    })
  }, [refreshState])

  const monitoring = profileSummary?.monitoring || result?.storage?.monitoring || {}
  const version = profileSummary?.version || result?.storage?.version || 1
  const updatedAt = profileSummary?.updatedAt || profileSummary?.storedAt || result?.canonicalProfile?.metadata?.updatedAt
  const sourceUrl = result?.canonicalProfile?.source?.sourceUrl || result?.hostedProfile?.htmlUrl || ''
  const detectedChanges = rescanResult?.changes || []

  const hasSourceUrl = useMemo(() => Boolean(result?.canonicalProfile?.source?.sourceUrl), [result])

  const runRescan = useCallback(async useContent => {
    if (!slug) return
    setLoading(true)
    setError('')
    try {
      const payload = useContent && rescanContent.trim()
        ? { markdown: rescanContent.trim() }
        : {}
      const data = await rescanAgenticProfile(slug, payload)
      setRescanResult(data)
      if (data.publishedProfile) {
        onResultUpdate?.({
          canonicalProfile: data.publishedProfile.profile,
          artifacts: data.publishedProfile.artifacts,
          validation: data.publishedProfile.validation,
          engineReadiness: data.publishedProfile.engineReadiness,
          hostedProfile: data.publishedProfile.hostedProfile,
        })
      }
      await refreshState()
    } catch (err) {
      setError(err?.message || 'Agentic rescan failed')
    } finally {
      setLoading(false)
    }
  }, [onResultUpdate, refreshState, rescanContent, slug])

  const handleApprove = useCallback(async id => {
    setApprovalBusyId(id)
    setError('')
    try {
      const data = await approveAgenticApproval(id, { reviewerNote: 'Approved in Crest UI' })
      if (data.publishedProfile) {
        onResultUpdate?.({
          canonicalProfile: data.publishedProfile.profile,
          artifacts: data.publishedProfile.artifacts,
          validation: data.publishedProfile.validation,
          engineReadiness: data.publishedProfile.engineReadiness,
          hostedProfile: data.publishedProfile.hostedProfile,
        })
      }
      setApprovals(current => current.map(item => item.id === id ? data.approval : item).filter(item => item.status === 'pending'))
      await refreshState()
    } catch (err) {
      setError(err?.message || 'Approval failed')
    } finally {
      setApprovalBusyId('')
    }
  }, [onResultUpdate, refreshState])

  const handleReject = useCallback(async id => {
    setApprovalBusyId(id)
    setError('')
    try {
      const data = await rejectAgenticApproval(id, { reviewerNote: 'Rejected in Crest UI' })
      setApprovals(current => current.map(item => item.id === id ? data.approval : item).filter(item => item.status === 'pending'))
      await refreshState()
    } catch (err) {
      setError(err?.message || 'Rejection failed')
    } finally {
      setApprovalBusyId('')
    }
  }, [refreshState])

  if (!slug) return null

  return (
    <div className="agentic-monitoring-panel" data-testid="agentic-monitoring-panel">
      <div className="agentic-monitoring-head">
        <div>
          <div className="agentic-card-label">Monitoring</div>
          <strong>Living AI profile</strong>
        </div>
        <span className={`summary-pill ${monitoring.lastRescanStatus === 'approval_required' ? 'warn' : 'ok'}`}>
          {statusLabel(monitoring.lastRescanStatus)}
        </span>
      </div>

      {error && (
        <div className="error-bar" role="alert">
          Agentic monitoring failed: {error}
        </div>
      )}

      <div className="agentic-summary-grid agentic-monitoring-grid">
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Version</span>
          <strong>{version}</strong>
        </div>
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Last updated</span>
          <strong>{formatDate(updatedAt)}</strong>
        </div>
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Last scanned</span>
          <strong>{formatDate(monitoring.lastScannedAt)}</strong>
        </div>
        <div className="agentic-summary-card">
          <span className="agentic-card-label">Status</span>
          <strong>{statusLabel(monitoring.lastRescanStatus)}</strong>
        </div>
      </div>

      <div className="agentic-monitoring-summary">
        <span className="agentic-card-label">Last rescan summary</span>
        <p>{monitoring.lastRescanSummary || 'No rescan has run for this profile yet.'}</p>
        {sourceUrl && <small>Source: {sourceUrl}</small>}
      </div>

      <div className="agentic-rescan-controls">
        <textarea
          className="preview-textarea agentic-rescan-textarea"
          value={rescanContent}
          onChange={event => setRescanContent(event.target.value)}
          placeholder="Optional: paste updated markdown/content for a test rescan."
          aria-label="Updated markdown for rescan"
        />
        <div className="agentic-panel-actions">
          <button
            type="button"
            className="btn-send"
            onClick={() => runRescan(false)}
            disabled={loading || !hasSourceUrl}
          >
            {loading ? <><span className="spinner" /> Rescanning...</> : 'Rescan stored source URL'}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => runRescan(true)}
            disabled={loading || !rescanContent.trim()}
          >
            Rescan pasted content
          </button>
        </div>
      </div>

      {rescanResult && (
        <div className="agentic-rescan-result">
          <div className="agentic-monitoring-head">
            <div>
              <div className="agentic-card-label">Rescan result</div>
              <strong>{statusLabel(rescanResult.status)}</strong>
            </div>
            <span className={`summary-pill ${rescanResult.status === 'approval_required' ? 'warn' : 'ok'}`}>
              {rescanResult.changed ? 'Changes detected' : 'No changes'}
            </span>
          </div>

          {detectedChanges.length > 0 ? (
            <div className="approval-events">
              {detectedChanges.map((change, index) => (
                <div key={change.id || `${change.type}-${change.path}-${index}`} className="approval-event">
                  <div className="approval-event-main">
                    <strong>{change.type?.replace(/_/g, ' ')}</strong>
                    <span>{change.path || 'profile'}</span>
                  </div>
                  <small>{change.approval_required ? 'Approval required' : 'Auto-publish allowed'}</small>
                </div>
              ))}
            </div>
          ) : (
            <div className="agentic-empty">No changes detected.</div>
          )}
        </div>
      )}

      <div className="agentic-approval-section">
        <div className="agentic-monitoring-head">
          <div>
            <div className="agentic-card-label">Pending approvals</div>
            <strong>{approvals.length}</strong>
          </div>
        </div>

        {approvals.length === 0 ? (
          <div className="agentic-empty">No pending approvals for this profile.</div>
        ) : (
          <div className="approval-list">
            {approvals.map(approval => (
              <ApprovalCard
                key={approval.id}
                approval={approval}
                onApprove={handleApprove}
                onReject={handleReject}
                busyId={approvalBusyId}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
