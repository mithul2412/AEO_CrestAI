export default function StatPill({ tone = 'plain', children, dot = true }) {
  return (
    <span className={`pill pill--${tone}${dot ? '' : ' pill--plain'}`}>
      {children}
    </span>
  )
}
