export function truncateMarkdown(markdown, maxTokens = 3000) {
  const wordLimit = Math.floor(maxTokens * 0.75)
  const words = markdown.split(/\s+/)
  if (words.length <= wordLimit) return markdown
  return words.slice(0, wordLimit).join(' ') + '\n\n[Content truncated]'
}
