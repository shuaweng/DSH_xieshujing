/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-experimental-novel-repository`.
 * @module @deepseek-ai/dsh-experimental-novel-repository/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-repository'

/** Cordis companion plugin name. */
export const name = 'novel-repository-invariant'
/** Service required before the companion can register. */
export const inject = ['invariants']

/**
 * No runtime invariant: the package defines an abstract service and immutable
 * values but owns no provider state or event relation.
 */
const install: InvariantInstaller = () => {}

/** Register the package invariant companion. */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
