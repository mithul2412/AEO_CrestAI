export default function InfinityLoop({ className = '', title = 'Loading' }) {
  return (
    <span className={`infinity-loop ${className}`} role="img" aria-label={title}>
      <span className="infinity-loop-dot infinity-loop-dot--a" />
      <span className="infinity-loop-dot infinity-loop-dot--b" />
      <svg viewBox="0 0 120 54" aria-hidden="true">
        <path
          className="infinity-loop-track"
          d="M34 27c0-14 15-22 28-7l4 4 4-4c13-15 28-7 28 7s-15 22-28 7l-4-4-4 4c-13 15-28 7-28-7Z"
        />
        <path
          className="infinity-loop-path"
          d="M34 27c0-14 15-22 28-7l4 4 4-4c13-15 28-7 28 7s-15 22-28 7l-4-4-4 4c-13 15-28 7-28-7Z"
        />
      </svg>
    </span>
  )
}
