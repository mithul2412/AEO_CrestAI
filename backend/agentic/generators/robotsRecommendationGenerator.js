export function generateRobotsRecommendations() {
  return [
    {
      engine: 'ChatGPT',
      userAgents: ['OAI-SearchBot'],
      optionalUserAgents: ['GPTBot', 'ChatGPT-User'],
      recommendation: 'Allow OAI-SearchBot to support AI search crawling when business policy permits.',
      category: 'ai_search_visibility',
    },
    {
      engine: 'Perplexity',
      userAgents: ['PerplexityBot'],
      optionalUserAgents: [],
      recommendation: 'Allow PerplexityBot to support citation and answer retrieval when business policy permits.',
      category: 'ai_search_visibility',
    },
    {
      engine: 'Google',
      userAgents: ['Googlebot'],
      optionalUserAgents: ['Google-Extended'],
      recommendation: 'Allow Googlebot for normal indexing. Treat Google-Extended as a separate training preference.',
      category: 'search_indexing',
    },
    {
      engine: 'Claude',
      userAgents: ['ClaudeBot', 'Claude-SearchBot', 'Claude-User'],
      optionalUserAgents: [],
      recommendation: 'Allow Claude search and user-triggered agents when business policy permits AI retrieval.',
      category: 'ai_search_visibility',
    },
  ]
}
