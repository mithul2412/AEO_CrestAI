import InfinityLoop from './InfinityLoop.jsx'

export default function ParticleLoader({ label = 'Loading...', size = 140 }) {
  return (
    <div className="loader-wrap" style={{ minHeight: size }}>
      <InfinityLoop className="infinity-loop-lg" title={label} />
      <span className="loader-label">{label}</span>
    </div>
  )
}
