import { useId, useState } from 'react'

export default function InfoTip({ label, children, align = 'center' }) {
  const [open, setOpen] = useState(false)
  const tooltipId = useId()

  return (
    <span
      className="info-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={`What does ${label} mean?`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        ?
      </button>
      {open && (
        <span id={tooltipId} role="tooltip" className={`info-tip-popup info-tip-popup--${align}`}>
          {children}
        </span>
      )}
    </span>
  )
}
