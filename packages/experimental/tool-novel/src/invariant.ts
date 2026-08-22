/** Package-owned invariant companion for Novel tools. */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-tool-novel'
export const name = 'tool-novel-invariant'
export const inject = ['invariants']
// No runtime invariant: tool registration and repository authority are checked by their owners.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
