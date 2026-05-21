import { useEffect } from 'react'

export default function DrillDrawer({ open, onClose, title, kicker, caption, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="drawer__head">
          <div className="drawer__head-titles">
            {kicker && <span className="kicker">{kicker}</span>}
            <h2 className="drawer__title">{title}</h2>
            {caption && <span className="drawer__caption">{caption}</span>}
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>Close</button>
        </header>
        <div className="drawer__body">{children}</div>
      </aside>
    </>
  )
}
