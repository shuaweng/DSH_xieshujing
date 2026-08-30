//#region lib/types/invariant.js
/**
* Package-owned invariant companion for `@deepseek-ai/dsh-experimental-novel-studio`.
* @module @deepseek-ai/dsh-experimental-novel-studio/invariant
*/
const PACKAGE_NAME = "@deepseek-ai/dsh-experimental-novel-studio";
/** Cordis companion plugin name. */
const name = "novel-studio-bundle-invariant";
/** Service required before the companion can register. */
const inject = ["invariants"];
/**
* No runtime invariant: the package is a static patch-list carrier, and each
* inserted plugin owns its runtime relations.
*/
const install = () => {};
/** Register the package invariant companion. */
const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//#endregion
export { apply, inject, name };
