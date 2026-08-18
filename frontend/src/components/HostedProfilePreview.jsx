export default function HostedProfilePreview({ hostedProfile }) {
  if (!hostedProfile) {
    return <div className="agentic-empty">Hosted profile links are not available yet.</div>
  }

  const links = [
    ['HTML preview', hostedProfile.htmlUrl],
    ['JSON profile', hostedProfile.jsonUrl],
    ['Markdown profile', hostedProfile.markdownUrl],
  ].filter(([, href]) => href)

  return (
    <div className="hosted-profile-links">
      {links.map(([label, href]) => (
        <a key={label} href={href} target="_blank" rel="noreferrer" className="hosted-profile-link">
          <span>{label}</span>
          <strong>{href}</strong>
        </a>
      ))}
    </div>
  )
}
