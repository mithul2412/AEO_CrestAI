export default function WanderingEyes({
  className = '',
  eyeScale = 1,
  gapScale = 1,
  pupilScale = 1,
  blinkScale = 1,
  travelScale = 1,
  title = 'Loading',
}) {
  const style = {
    '--eye-scale': eyeScale,
    '--gap-scale': gapScale,
    '--pupil-scale': pupilScale,
    '--blink-scale': blinkScale,
    '--travel-scale': travelScale,
  }

  return (
    <span className={`wandering-eyes ${className}`.trim()} style={style} role="img" aria-label={title}>
      <span className="wandering-eye wandering-eye-left">
        <span className="wandering-pupil" />
      </span>
      <span className="wandering-eye wandering-eye-right">
        <span className="wandering-pupil" />
      </span>
    </span>
  )
}
