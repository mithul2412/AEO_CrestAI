export default function SectionKicker({ children, as: Tag = 'div' }) {
  return <Tag className="kicker">{children}</Tag>
}
