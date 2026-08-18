import { truncateMarkdown } from '../utils/truncate.js'

/* ── Basic behavior ───────────────────────── */

test('no truncation when under limit', () => {
  const short = 'hello world this is short content'
  expect(truncateMarkdown(short, 3000)).toBe(short)
})

test('truncates at word boundary', () => {
  const words = Array.from({ length: 5000 }, (_, i) => `word${i}`)
  const md = words.join(' ')
  const result = truncateMarkdown(md, 100)
  const resultWords = result.replace('\n\n[Content truncated]', '').split(' ')
  resultWords.forEach(w => expect(w).not.toMatch(/word\d+word\d+/))
})

test('appends [Content truncated] when truncated', () => {
  const words = Array.from({ length: 5000 }, (_, i) => `word${i}`)
  const md = words.join(' ')
  const result = truncateMarkdown(md, 100)
  expect(result).toMatch(/\[Content truncated\]$/)
})

test('does not append truncation notice when not truncated', () => {
  const short = 'short content here'
  const result = truncateMarkdown(short, 3000)
  expect(result).not.toContain('[Content truncated]')
})

/* ── Edge cases ───────────────────────────── */

test('empty string returns empty string', () => {
  expect(truncateMarkdown('', 100)).toBe('')
})

test('single word under limit stays unchanged', () => {
  expect(truncateMarkdown('hello', 100)).toBe('hello')
})

test('exactly at word limit stays unchanged', () => {
  const words = Array.from({ length: 75 }, (_, i) => `w${i}`)
  const md = words.join(' ')
  // 100 tokens * 0.75 = 75 words — exactly at limit
  const result = truncateMarkdown(md, 100)
  expect(result).toBe(md)
})

test('one word over limit triggers truncation', () => {
  const words = Array.from({ length: 76 }, (_, i) => `w${i}`)
  const md = words.join(' ')
  // 100 tokens * 0.75 = 75 words — 76 is over
  const result = truncateMarkdown(md, 100)
  expect(result).toContain('[Content truncated]')
  const resultWords = result.replace('\n\n[Content truncated]', '').split(' ')
  expect(resultWords).toHaveLength(75)
})

test('default maxTokens is 3000', () => {
  // 3000 * 0.75 = 2250 words
  const words = Array.from({ length: 2200 }, (_, i) => `w${i}`)
  const md = words.join(' ')
  const result = truncateMarkdown(md) // no maxTokens arg
  expect(result).toBe(md) // under 2250
})

test('Groq context tokens: 1600 -> 1200 word limit', () => {
  const words = Array.from({ length: 1201 }, (_, i) => `w${i}`)
  const md = words.join(' ')
  const result = truncateMarkdown(md, 1600)
  expect(result).toContain('[Content truncated]')
  const resultWords = result.replace('\n\n[Content truncated]', '').split(' ')
  expect(resultWords).toHaveLength(1200)
})

test('OpenRouter context tokens: 3000 -> 2250 word limit', () => {
  const words = Array.from({ length: 2251 }, (_, i) => `w${i}`)
  const md = words.join(' ')
  const result = truncateMarkdown(md, 3000)
  expect(result).toContain('[Content truncated]')
  const resultWords = result.replace('\n\n[Content truncated]', '').split(' ')
  expect(resultWords).toHaveLength(2250)
})

test('preserves markdown formatting in truncated output', () => {
  const md = '# Heading\n\n' + Array.from({ length: 5000 }, (_, i) => `word${i}`).join(' ')
  const result = truncateMarkdown(md, 100)
  expect(result).toMatch(/^# Heading/)
})

test('handles whitespace-heavy content', () => {
  const md = 'word1   word2   word3'
  // split by /\s+/ gives ['word1', 'word2', 'word3'] = 3 words
  const result = truncateMarkdown(md, 100)
  expect(result).toBe(md)
})
