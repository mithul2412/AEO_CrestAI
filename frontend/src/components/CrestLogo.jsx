export default function CrestLogo({ size = 'regular', showWordmark = true }) {
  return (
    <div className={`crest-logo crest-logo--${size}`}>
      <span className="crest-wordmark" aria-label="Crest.ai">
        <span className="crest-wordmark-human">Crest</span>
        <span className="crest-wordmark-dot">.</span>
        <span className="crest-wordmark-machine">ai</span>
      </span>
      {showWordmark && (
        <span className="crest-logo-subtitle">
          AI Visibility Lab
        </span>
      )}
    </div>
  )
}
