export default function ParticleLoader({ label = 'Loading...', size = 140 }) {
  return (
    <div className="loader-wrap" style={{ minHeight: size }}>
      <div className="particle-loader-orbit" aria-hidden="true">
        <span className="particle-loader-node particle-loader-node-a" />
        <span className="particle-loader-node particle-loader-node-b" />
        <span className="particle-loader-node particle-loader-node-c" />
      </div>
      <span className="loader-label">{label}</span>
    </div>
  )
}
