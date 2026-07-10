import { MODELS, isModelId } from './models'
import type { Usage } from './anthropic/types'

export interface CostSummary {
  dollars: number
  inputTokens: number
  outputTokens: number
}

export function summarizeCost(items: { model: string | null; usage: Usage | null }[]): CostSummary {
  let dollars = 0
  let inputTokens = 0
  let outputTokens = 0
  for (const item of items) {
    if (!item.usage || !item.model || !isModelId(item.model)) continue
    const info = MODELS[item.model]
    const input = item.usage.input_tokens ?? 0
    const cacheRead = item.usage.cache_read_input_tokens ?? 0
    const cacheWrite = item.usage.cache_creation_input_tokens ?? 0
    const output = item.usage.output_tokens ?? 0
    inputTokens += input + cacheRead + cacheWrite
    outputTokens += output
    dollars +=
      ((input + cacheWrite * 1.25 + cacheRead * 0.1) / 1_000_000) * info.pricePerMTokIn +
      (output / 1_000_000) * info.pricePerMTokOut
  }
  return { dollars, inputTokens, outputTokens }
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function formatDollars(d: number): string {
  if (d === 0) return '$0.00'
  if (d < 0.01) return '< $0.01'
  return `$${d.toFixed(2)}`
}
