export default function Wordmark({ size = 'sm' }) {
  const cls = size === 'lg' ? 'wordmark wordmark--lg' : 'wordmark'
  return (
    <span className={cls} aria-label="Crest.ai">
      <span>Crest</span>
      <span className="wordmark__hinge">.</span>
      <span className="wordmark__machine">ai</span>
    </span>
  )
}
