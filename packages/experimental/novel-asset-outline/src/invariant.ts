/** Package-owned invariant companion for the structured outline Asset contribution. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-asset-outline'
export const name = 'novel-asset-outline-invariant'
export const inject = ['invariants']
// Runtime registration and schema behavior are exercised by the package and composition tests.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
