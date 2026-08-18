import { LLAMA_3_3_70B_FREE_MODEL, OPENROUTER_MODELS, buildProviderError, getLlamaQueryModel, getOpenRouterCredentials, mapModelStatus, safeJsonParse } from '../services/openRouterModels.js'

test('OpenRouter registry uses Qwen, Nemotron, and GPT OSS', () => {
  expect(OPENROUTER_MODELS.map(model => model.model)).toEqual([
    'qwen/qwen3.6-plus',
    'nvidia/nemotron-3-super-120b-a12b:free',
    'openai/gpt-oss-120b',
  ])
  expect(OPENROUTER_MODELS[0].fallbackModels).toContain(LLAMA_3_3_70B_FREE_MODEL)
})

test('Llama 3.3 70B free is the default query suggestion model', () => {
  expect(getLlamaQueryModel()).toMatchObject({
    label: 'Llama 3.3 70B Instruct',
    model: LLAMA_3_3_70B_FREE_MODEL,
  })
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
    OPENROUTER_API_KEY_24: 'twenty-four-key',
    OPENROUTER_API_KEY_UW_MAIL: 'uw-key',
    OPENROUTER_API_KEY_PERSONAL: 'personal-key',
  })).toEqual([
    { label: 'primary', apiKey: 'primary-key' },
    { label: '24', apiKey: 'twenty-four-key' },
    { label: 'uw-mail', apiKey: 'uw-key' },
    { label: 'personal', apiKey: 'personal-key' },
  ])
})

test('provider error explains exhausted OpenRouter API key without leaking secrets', () => {
  const message = buildProviderError(
    { label: 'Qwen 3.6 Plus (qwen/qwen3.6-plus, personal)' },
    402,
    JSON.stringify({ error: { message: 'This request requires more credits' } })
  )

  expect(message).toContain('API key exhausted or insufficient credits')
  expect(message).toContain('This request requires more credits')
  expect(message).not.toContain('Bearer')
})
