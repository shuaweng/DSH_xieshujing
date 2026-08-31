/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-experimental-novel-repository-local`.
 * @module @deepseek-ai/dsh-experimental-novel-repository-local/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-repository-local'

/** Cordis companion plugin name. */
export const name = 'novel-repository-local-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: project discovery is stateless, and `ctx.fs` owns the
 * target containment and read contracts used by each call.
 */
const install: InvariantInstaller = () => {}

/** Register the package invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
