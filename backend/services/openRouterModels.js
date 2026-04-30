import fetch from 'node-fetch'
import { truncateMarkdown } from '../utils/truncate.js'

export const LLAMA_3_3_70B_FREE_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'

export const OPENROUTER_MODELS = [
  {
    id: 'qwen',
    label: 'Qwen 3.6 Plus',
    model: 'qwen/qwen3.6-plus',
    fallbackModels: [LLAMA_3_3_70B_FREE_MODEL],
    contextTokens: 3000,
  },
  {
    id: 'nemotron',
    label: 'Nemotron 120B',
    model: 'nvidia/nemotron-3-super-120b-a12b:free',
    contextTokens: 3000,
  },
  {
    id: 'gpt-oss',
    label: 'GPT OSS 120B',
    model: 'openai/gpt-oss-120b',
    fallbackModels: ['openai/gpt-oss-120b:free'],
    contextTokens: 3000,
  },
]

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
const DEFAULT_TIMEOUT_MS = 45_000

export function getOpenRouterCredentials(env = process.env) {
  return [
    { label: 'primary', apiKey: env.OPENROUTER_API_KEY },
    { label: '24', apiKey: env.OPENROUTER_API_KEY_24 },
    { label: 'uw-mail', apiKey: env.OPENROUTER_API_KEY_UW_MAIL },
    { label: 'personal', apiKey: env.OPENROUTER_API_KEY_PERSONAL },
  ].filter(credential => credential.apiKey)
}

function openRouterCredentialEnvList() {
  return 'OPENROUTER_API_KEY, OPENROUTER_API_KEY_24, OPENROUTER_API_KEY_UW_MAIL, or OPENROUTER_API_KEY_PERSONAL'
}

function parseProviderMessage(rawText = '') {
  const compact = rawText ? rawText.replace(/\s+/g, ' ').trim() : ''
  if (!compact) return ''
  try {
    const parsed = JSON.parse(rawText)
    return parsed?.error?.message || parsed?.message || compact
  } catch {
    return compact
  }
}

function isRetryableProviderStatus(status) {
  return [401, 402, 408, 409, 429, 500, 502, 503, 504].includes(status)
}

export function buildProviderError(model, status, rawText = '') {
  const providerMessage = parseProviderMessage(rawText)
  if (status === 413) {
    return `${model.label} error 413: request too large (content exceeds provider limit).`
  }
  if (status === 401) {
    return `${model.label}: API key was rejected. Trying the next configured key if available.`
  }
  if (status === 402) {
    return `${model.label}: API key exhausted or insufficient credits${providerMessage ? ` (${providerMessage})` : ''}.`
  }
  if (status === 429) {
    return `${model.label}: rate limited. Trying the next configured key if available.`
  }
  return providerMessage
    ? `${model.label} error ${status}: ${providerMessage}`
    : `${model.label} error ${status}`
}

function summarizeProviderErrors(model, errors) {
  if (errors.length === 0) return `Unknown ${model.label} error`
  const exhausted = errors.filter(error => error.status === 402)
  const rejected = errors.filter(error => error.status === 401)
  const rateLimited = errors.filter(error => error.status === 429)

  if (exhausted.length === errors.length) {
    return `All configured OpenRouter API keys are exhausted or lack credits for ${model.label}. Update ${openRouterCredentialEnvList()} in backend/.env. Details: ${errors.map(error => error.message).join(' | ')}`
  }
  if (rejected.length === errors.length) {
    return `All configured OpenRouter API keys were rejected for ${model.label}. Check the OpenRouter keys in backend/.env. Details: ${errors.map(error => error.message).join(' | ')}`
  }
  if (rateLimited.length === errors.length) {
    return `All configured OpenRouter API keys are rate limited for ${model.label}. Wait or update ${openRouterCredentialEnvList()} in backend/.env. Details: ${errors.map(error => error.message).join(' | ')}`
  }

  return errors.map(error => error.message).join(' | ')
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text)
  } catch {
    const source = String(text || '')
    const start = source.indexOf('{')
    const end = source.lastIndexOf('}')
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('Model did not return valid JSON')
    }
    return JSON.parse(source.slice(start, end + 1))
  }
}

export function mapModelStatus(settledResult, model) {
  if (settledResult.status === 'fulfilled') {
    return {
      model: model.label,
      status: 'ok',
      modelId: settledResult.value?.modelId || model.model,
      credentialLabel: settledResult.value?.credentialLabel || null,
    }
  }
  return {
    model: model.label,
    modelId: model.model,
    status: 'error',
    error: settledResult.reason?.message || `Unknown ${model.label} error`,
  }
}

export function averageScores(scores) {
  const numericScores = scores.filter(score => typeof score === 'number')
  if (numericScores.length === 0) return null
  return Math.round(numericScores.reduce((sum, value) => sum + value, 0) / numericScores.length)
}

export function truncateForModel(markdown, model) {
  return truncateMarkdown(markdown, model.contextTokens)
}

export function getQwenModel() {
  return OPENROUTER_MODELS.find(model => model.id === 'qwen') || OPENROUTER_MODELS[0]
}

export function getLlamaQueryModel() {
  return {
    id: 'llama-3.3-70b',
    label: 'Llama 3.3 70B Instruct',
    model: LLAMA_3_3_70B_FREE_MODEL,
    contextTokens: 3000,
  }
}

function buildJsonRetryPrompt(prompt) {
  return `${prompt}

Return exactly one valid minified JSON object. Do not include markdown, commentary, code fences, or incomplete strings.`
}

async function callOpenRouter(model, {
  messages,
  maxTokens = 600,
  temperature = 0.2,
  responseFormat = null,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const credentials = getOpenRouterCredentials()
  if (credentials.length === 0) {
    throw new Error(`Missing ${openRouterCredentialEnvList()}`)
  }

  const modelIds = [model.model, ...(model.fallbackModels || [])]
  const errors = []

  for (const modelId of modelIds) {
    for (const credential of credentials) {
      const body = {
        model: modelId,
        messages,
        max_tokens: maxTokens,
        temperature,
      }

      if (responseFormat) {
        body.response_format = responseFormat
      }

      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credential.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })

      if (res.ok) {
        const data = await res.json()
        return { data, modelId, credentialLabel: credential.label }
      }

      const errorText = await res.text()
      errors.push({
        status: res.status,
        message: buildProviderError({ ...model, label: `${model.label} (${modelId}, ${credential.label})` }, res.status, errorText),
      })

      if (!isRetryableProviderStatus(res.status)) {
        break
      }
    }
  }

  throw new Error(summarizeProviderErrors(model, errors))
}

export async function runJsonModelPanel({
  prompt,
  buildContent,
  normalize,
  maxTokens = 600,
  temperature = 0.2,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const settled = await Promise.allSettled(
    OPENROUTER_MODELS.map(async model => {
      const messages = [
        { role: 'system', content: prompt },
        { role: 'user', content: buildContent(model) },
      ]
      let { data, modelId, credentialLabel } = await callOpenRouter(model, {
        messages,
        maxTokens,
        temperature,
        responseFormat: { type: 'json_object' },
        timeoutMs,
      })
      let parsed
      try {
        parsed = safeJsonParse(data.choices?.[0]?.message?.content || '')
      } catch (err) {
        const retry = await callOpenRouter(model, {
          messages: [
            { role: 'system', content: buildJsonRetryPrompt(prompt) },
            { role: 'user', content: buildContent(model) },
          ],
          maxTokens: Math.max(maxTokens + 300, 900),
          temperature: 0,
          responseFormat: { type: 'json_object' },
          timeoutMs,
        })
        data = retry.data
        modelId = retry.modelId
        credentialLabel = retry.credentialLabel
        try {
          parsed = safeJsonParse(data.choices?.[0]?.message?.content || '')
        } catch (retryErr) {
          const plainRetry = await callOpenRouter(model, {
            messages: [
              { role: 'system', content: buildJsonRetryPrompt(prompt) },
              { role: 'user', content: buildContent(model) },
            ],
            maxTokens: Math.max(maxTokens + 500, 1100),
            temperature: 0,
            timeoutMs,
          })
          data = plainRetry.data
          modelId = plainRetry.modelId
          credentialLabel = plainRetry.credentialLabel
          try {
            parsed = safeJsonParse(data.choices?.[0]?.message?.content || '')
          } catch (plainRetryErr) {
            throw new Error(`${err.message}; JSON retry failed: ${retryErr.message}; plain retry failed: ${plainRetryErr.message}`)
          }
        }
      }
      return {
        ...normalize(model.label, parsed),
        modelId,
        credentialLabel,
      }
    })
  )

  return {
    settled,
    values: settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value),
    status: settled.map((result, index) => mapModelStatus(result, OPENROUTER_MODELS[index])),
  }
}

export async function runSingleJsonModel({
  model = getQwenModel(),
  prompt,
  content,
  normalize,
  maxTokens = 500,
  temperature = 0.3,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content },
  ]
  let { data, modelId, credentialLabel } = await callOpenRouter(model, {
    messages,
    maxTokens,
    temperature,
    responseFormat: { type: 'json_object' },
    timeoutMs,
  })

  let parsed
  try {
    parsed = safeJsonParse(data.choices?.[0]?.message?.content || '')
  } catch (err) {
    const retry = await callOpenRouter(model, {
      messages: [
        { role: 'system', content: buildJsonRetryPrompt(prompt) },
        { role: 'user', content },
      ],
      maxTokens: Math.max(maxTokens + 300, 800),
      temperature: 0,
      responseFormat: { type: 'json_object' },
      timeoutMs,
    })
    data = retry.data
    modelId = retry.modelId
    credentialLabel = retry.credentialLabel
    parsed = safeJsonParse(data.choices?.[0]?.message?.content || '')
  }

  return {
    ...normalize(model.label, parsed),
    model: model.label,
    modelId,
    credentialLabel,
  }
}

export async function runChatModelPanel({
  messages,
  systemContent = '',
  maxTokens = 1200,
  temperature = 0.5,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const allMessages = systemContent
    ? [{ role: 'system', content: systemContent }, ...messages]
    : messages

  const settled = await Promise.allSettled(
    OPENROUTER_MODELS.map(async model => {
      const { data, modelId, credentialLabel } = await callOpenRouter(model, {
        messages: allMessages,
        maxTokens,
        temperature,
        timeoutMs,
      })
      return {
        model: model.label,
        modelId,
        credentialLabel,
        response: data.choices?.[0]?.message?.content || '',
      }
    })
  )

  return {
    settled,
    responses: settled
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value),
    status: settled.map((result, index) => mapModelStatus(result, OPENROUTER_MODELS[index])),
  }
}
