/** Package-owned invariant companion for Novel Workbench. */
/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'
const PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-workbench'
export const name = 'novel-workbench-invariant'
export const inject = ['invariants']
// No runtime invariant: client slot and Remote contracts are checked by their owning packages.
const install: InvariantInstaller = () => {}
export const apply = (ctx: Context): Promise<() => void> => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
