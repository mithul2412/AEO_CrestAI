function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function WanderingEyes({
  className = '',
  style,
  eyeScale = 0.62,
  gapScale = 0.09,
  pupilScale = 0.32,
  blinkScale = 0.375,
  travelScale = 0.3125,
  ...props
}) {
  const safeEyeScale    = clamp(eyeScale,    0.28, 0.7)
  const safeGapScale    = clamp(gapScale,    0.04, 0.3)
  const safePupilScale  = clamp(pupilScale,  0.12, 0.45)
  const safeBlinkScale  = clamp(blinkScale,  0.15, 1)
  const safeTravelScale = clamp(travelScale, 0.08, 0.5)

  const eyesStyle = {
    ...style,
    '--loading-ui-wandering-eyes-eye':          `${(safeEyeScale    * 100).toFixed(2)}cqmin`,
    '--loading-ui-wandering-eyes-gap':          `${(safeGapScale    * 100).toFixed(2)}cqmin`,
    '--loading-ui-wandering-eyes-pupil-scale':  `${safePupilScale}`,
    '--loading-ui-wandering-eyes-blink':        `${safeBlinkScale}`,
    '--loading-ui-wandering-eyes-travel-scale': `${safeTravelScale}`,
  }

  return (
    <>
      <style>{`
        .wg-root {
          container-type: size;
          position: relative;
          display: inline-flex;
          aspect-ratio: 9 / 4;
          align-items: center;
          justify-content: center;
          vertical-align: middle;
        }
        .wg-inner {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--loading-ui-wandering-eyes-gap);
        }
        .wg-eye {
          display: inline-block;
          border-radius: 9999px;
          width:  var(--loading-ui-wandering-eyes-eye);
          height: var(--loading-ui-wandering-eyes-eye);
          background-repeat: no-repeat;
          background-position: 0 0;
          animation:
            loading-ui-wandering-eyes-move var(--duration, 10s) infinite,
            loading-ui-wandering-eyes-blink var(--duration, 10s) infinite;
        }
        .wg-sr {
          position: absolute;
          width: 1px; height: 1px;
          padding: 0; margin: -1px;
          overflow: hidden;
          clip: rect(0,0,0,0);
          white-space: nowrap;
          border-width: 0;
        }
        @keyframes loading-ui-wandering-eyes-move {
          0%,  10% { background-position: 0 0; }
          13%, 40% { background-position: calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-travel-scale) * -1) 0; }
          43%, 70% { background-position: calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-travel-scale)) 0; }
          73%, 90% { background-position: 0 calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-travel-scale)); }
          93%,100% { background-position: 0 0; }
        }
        @keyframes loading-ui-wandering-eyes-blink {
          0%,10%,12%,20%,22%,40%,42%,60%,62%,70%,72%,90%,92%,98%,100% {
            height: var(--loading-ui-wandering-eyes-eye);
          }
          11%,21%,41%,61%,71%,91%,99% {
            height: calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-blink));
          }
        }
      `}</style>
      <span
        role="status"
        className={`wg-root ${className}`}
        style={eyesStyle}
        {...props}
      >
        <span aria-hidden="true" className="wg-inner">
          {Array.from({ length: 2 }, (_, i) => (
            <span
              key={i}
              className="wg-eye"
              style={{
                backgroundImage: [
                  `radial-gradient(circle calc(var(--loading-ui-wandering-eyes-eye) * var(--loading-ui-wandering-eyes-pupil-scale)), #FFB800 100%, transparent 0)`,
                  `radial-gradient(ellipse 85% 85% at 40% 32%, #FFE234 0%, #FFD000 48%, #FF8C00 100%)`,
                ].join(', '),
              }}
            />
          ))}
        </span>
        <span className="wg-sr">Loading</span>
      </span>
    </>
  )
}
