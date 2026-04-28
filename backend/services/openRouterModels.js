import fetch from 'node-fetch'
import { truncateMarkdown } from '../utils/truncate.js'

export const OPENROUTER_MODELS = [
  {
    id: 'qwen',
    label: 'Qwen 3.6 Plus',
    model: 'qwen/qwen3.6-plus',
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
    { label: 'uw-mail', apiKey: env.OPENROUTER_API_KEY_UW_MAIL },
    { label: 'personal', apiKey: env.OPENROUTER_API_KEY_PERSONAL },
  ].filter(credential => credential.apiKey)
}

function buildProviderError(model, status, rawText = '') {
  const compact = rawText ? rawText.replace(/\s+/g, ' ').trim() : ''
  if (status === 413) {
    return `${model.label} error 413: request too large (content exceeds provider limit).`
  }
  return compact
    ? `${model.label} error ${status}: ${compact}`
    : `${model.label} error ${status}`
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
    throw new Error('Missing OPENROUTER_API_KEY')
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
      errors.push(buildProviderError({ ...model, label: `${model.label} (${modelId}, ${credential.label})` }, res.status, errorText))

      if (![402, 429, 503].includes(res.status)) {
        break
      }
    }
  }

  throw new Error(errors.join(' | '))
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
