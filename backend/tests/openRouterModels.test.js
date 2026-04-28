import { OPENROUTER_MODELS, getOpenRouterCredentials, mapModelStatus, safeJsonParse } from '../services/openRouterModels.js'

test('OpenRouter registry uses Qwen, Nemotron, and GPT OSS', () => {
  expect(OPENROUTER_MODELS.map(model => model.model)).toEqual([
    'qwen/qwen3.6-plus',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'openai/gpt-oss-120b',
  ])
})

test('model status preserves display label and provider model id', () => {
  const status = mapModelStatus({ status: 'fulfilled' }, OPENROUTER_MODELS[0])
  expect(status).toEqual({
    model: 'Qwen 3.6 Plus',
    modelId: 'qwen/qwen3.6-plus',
    credentialLabel: null,
    status: 'ok',
  })
})

test('safeJsonParse extracts a JSON object from wrapped model text', () => {
  expect(safeJsonParse('Here is the JSON:\n{"score":72,"reason":"ok"}')).toEqual({
    score: 72,
    reason: 'ok',
  })
})

test('OpenRouter credential pool keeps labeled fallback keys in order', () => {
  expect(getOpenRouterCredentials({
    OPENROUTER_API_KEY: 'primary-key',
    OPENROUTER_API_KEY_UW_MAIL: 'uw-key',
    OPENROUTER_API_KEY_PERSONAL: 'personal-key',
  })).toEqual([
    { label: 'primary', apiKey: 'primary-key' },
    { label: 'uw-mail', apiKey: 'uw-key' },
    { label: 'personal', apiKey: 'personal-key' },
  ])
})
