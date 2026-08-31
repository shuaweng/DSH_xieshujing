/** Browser plugin mounting the generated Novel Repository Remote contribution. */

import type { Context } from '@deepseek-ai/cordis'
import novelRepositoryRemote from '@deepseek-ai/dsh-experimental-novel-repository-remote/remote'
export type {} from '@deepseek-ai/dsh-experimental-novel-repository-remote/remote'
import { mountNovelRepositoryRemote } from './mount.ts'

export { inject, name } from './mount.ts'

/**
 * Mount the generated `novelRepository` browser namespace.
 * @param ctx - Client Cordis root carrying the Remote mount service.
 * @returns disposer that withdraws the namespace and retained methods.
 */
export async function apply(ctx: Context): Promise<() => Promise<void>> {
  return await mountNovelRepositoryRemote(ctx, novelRepositoryRemote)
}
