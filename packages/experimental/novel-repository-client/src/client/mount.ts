/** Source-plane lifecycle for mounting one generated Novel Repository Remote contribution. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

/** Cordis plugin name. */
export const name = 'novel-repository-client'
/** Required service: the typed Client Remote contribution mount. */
export const inject = ['remote']

/**
 * Mount a supplied Novel Repository contribution under the calling fiber.
 * @param ctx - Client Cordis root carrying the Remote mount service.
 * @param contribution - generated contribution selected by the artifact-plane entry.
 * @returns disposer that withdraws the namespace and retained methods.
 */
export async function mountNovelRepositoryRemote(
  ctx: Context,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  return await ctx.remote.$mount(contribution)
}
