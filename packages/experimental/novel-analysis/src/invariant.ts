/** Package-owned invariant companion for Novel analysis. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-analysis'
export const name = 'novel-analysis-invariant'
export const inject = ['invariants']
// No runtime invariant: the repository owns durable validation and the service owns worker output decoding.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
