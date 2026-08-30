import { fileURLToPath } from "node:url";
import { Service } from "@deepseek-ai/cordis";
//#region lib/types/index.js
/** Runtime contribution owned by the experimental Novel Studio bundle. */
/** Package paths and lifecycle-scoped Preset contribution for Novel Studio. */
var NovelStudioPaths = class extends Service {
	static inject = ["agentPresets", "novelWorkbenchReady"];
	/** Absolute directory containing this package's shipped Agent Presets. */
	presetRoot = fileURLToPath(new URL("../presets", import.meta.url));
	constructor(ctx) {
		super(ctx, "novelStudioPaths");
		ctx.agentPresets.registerRoot({
			id: "@xieshujing/dsh-plugin",
			root: {
				path: this.presetRoot,
				trust: "system"
			}
		});
	}
};
//#endregion
export { NovelStudioPaths, NovelStudioPaths as default };
