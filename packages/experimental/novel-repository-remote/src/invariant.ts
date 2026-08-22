/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-experimental-novel-repository-remote`.
 * @module @deepseek-ai/dsh-experimental-novel-repository-remote/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-repository-remote'

/** Cordis companion plugin name. */
export const name = 'novel-repository-remote-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the Host adapter retains no mutable state; the Typert
 * registry owns Remote registration and withdrawal.
 */
const install: InvariantInstaller = () => {}

/** Register the package invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
