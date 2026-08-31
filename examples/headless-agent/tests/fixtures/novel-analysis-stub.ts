import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-experimental-novel-analysis'

export const name = 'novel-analysis-stub'

/** Provide the read-only candidate-warning facet needed by the real Novel tool package. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.provide('novelAnalysis', {
    candidateWarning: () => undefined,
  } as never), 'novel-analysis-stub.provider')
}
