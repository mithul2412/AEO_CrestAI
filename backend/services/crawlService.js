import fetch from 'node-fetch'
import robotsParser from 'robots-parser'

const ACCESS_TIMEOUT_MS = 12_000
const ROBOTS_TIMEOUT_MS = 8_000

const CRAWLERS = {
  googlebot: 'Googlebot',
  oaiSearchBot: 'OAI-SearchBot',
  gptBot: 'GPTBot',
  perplexityBot: 'PerplexityBot',
}

function emptyRobots(origin) {
  return robotsParser(new URL('/robots.txt', origin).toString(), '')
}

function statusForAllowed(value) {
  if (value === true) return 'allowed'
  if (value === false) return 'blocked'
  return 'unknown'
}

export function evaluateRobots({ robotsText = '', robotsUrl, targetUrl }) {
  const parser = robotsParser(robotsUrl, robotsText)
  return Object.fromEntries(
    Object.entries(CRAWLERS).map(([key, agent]) => [
      key,
      statusForAllowed(parser.isAllowed(targetUrl, agent)),
    ])
  )
}

async function fetchRobots(origin, targetUrl, warnings) {
  const robotsUrl = new URL('/robots.txt', origin).toString()

  try {
    const res = await fetch(robotsUrl, {
      headers: { Accept: 'text/plain,*/*;q=0.8' },
      signal: AbortSignal.timeout(ROBOTS_TIMEOUT_MS),
    })

    if (res.status === 404) {
      warnings.push('robots.txt was not found; crawler access is assumed open.')
      return evaluateRobots({ robotsText: '', robotsUrl, targetUrl })
    }

    if (!res.ok) {
      warnings.push(`robots.txt returned ${res.status}; crawler access could not be fully verified.`)
      return Object.fromEntries(Object.keys(CRAWLERS).map(key => [key, 'unknown']))
    }

    const robotsText = await res.text()
    return evaluateRobots({ robotsText, robotsUrl, targetUrl })
  } catch (err) {
    warnings.push(`robots.txt could not be checked: ${err.message || 'request failed'}.`)
    return Object.fromEntries(Object.keys(CRAWLERS).map(key => [key, 'unknown']))
  }
}

export async function crawlPage(url) {
  const warnings = []
  const parsed = new URL(url)
  const origin = parsed.origin
  let html = ''
  let statusCode = null
  let finalUrl = url
  let contentType = ''

  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': 'Crest.ai Intelligence Layer (+https://crest.ai)',
      },
      signal: AbortSignal.timeout(ACCESS_TIMEOUT_MS),
    })

    statusCode = res.status
    finalUrl = res.url || url
    contentType = res.headers.get('content-type') || ''

    if (res.status >= 300 && res.status < 400) {
      warnings.push(`The page returned redirect status ${res.status}.`)
    } else if (res.status === 401 || res.status === 403) {
      warnings.push('The page may be protected by login, WAF, or access controls.')
    } else if (res.status >= 400) {
      warnings.push(`The page returned HTTP ${res.status}.`)
    }

    html = await res.text()

    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      warnings.push('The direct fetch did not identify the page as HTML.')
    }
  } catch (err) {
    warnings.push(`The page HTML could not be fetched directly: ${err.message || 'request failed'}.`)
  }

  const robots = await fetchRobots(origin, finalUrl, warnings)
  const blockedCrawlers = Object.entries(robots)
    .filter(([, status]) => status === 'blocked')
    .map(([crawler]) => crawler)

  if (blockedCrawlers.length > 0) {
    warnings.push(`robots.txt blocks ${blockedCrawlers.join(', ')}.`)
  }

  return {
    html,
    access: {
      statusCode,
      finalUrl,
      canonical: finalUrl,
      indexable: statusCode == null ? null : statusCode >= 200 && statusCode < 400,
      robots,
      warnings,
    },
  }
}

export function buildAccessFallback(url, message = 'Access intelligence unavailable.') {
  const parser = emptyRobots(new URL(url).origin)
  return {
    statusCode: null,
    finalUrl: url,
    canonical: url,
    indexable: null,
    robots: Object.fromEntries(
      Object.keys(CRAWLERS).map(key => [key, statusForAllowed(parser.isAllowed(url, CRAWLERS[key]))])
    ),
    warnings: [message],
  }
}
