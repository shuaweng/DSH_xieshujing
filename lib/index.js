import { fileURLToPath } from "node:url";
import { Service } from "@deepseek-ai/cordis";
import { NovelRepositoryError } from "@deepseek-ai/dsh-experimental-novel-repository";
//#region lib/types/index.js
/** Runtime contribution owned by the experimental Novel Studio bundle. */
const NOVEL_SKILL_POLICY_PROVIDER = "novel-project-skill-policy";
const NOVEL_SKILL_POLICY_RANK = 50;
/** Package paths and Web boot readiness marker for Novel Studio. */
var NovelStudioPaths = class extends Service {
	static inject = ["novelWorkbenchReady"];
	/** Absolute directory containing this package's shipped Agent Presets. */
	presetRoot = fileURLToPath(new URL("../presets", import.meta.url));
	constructor(ctx) {
		super(ctx, "novelStudioPaths");
	}
};
/**
* Register the Novel Project Skill policy inside the active Preset scope.
* The standard Skill Registry remains the only catalog and loader: disabled
* names are shadowed by a higher-priority candidate whose official invocation
* policy denies both model and user surfaces.
* @param ctx - Preset-scoped Cordis context.
* @param allowedNames - exact Novel Preset Skill names this policy may shadow.
*/
function applyNovelProjectSkillPolicy(ctx, allowedNames) {
	const allowed = new Set(allowedNames);
	let invalidate = () => {};
	ctx.skills.registerProvider((control) => {
		invalidate = control.invalidate;
		return {
			name: NOVEL_SKILL_POLICY_PROVIDER,
			list: async (options) => {
				if (options.cwd === void 0) return [];
				try {
					const root = await ctx.fs.resolve(options.cwd, {
						cwd: options.cwd,
						...options.signal === void 0 ? {} : { signal: options.signal }
					});
					const project = await ctx.novelRepository.discoverProject(root, options.signal);
					if (project === void 0) return [];
					return (await ctx.novelRepository.readSkillSettings(project, options.signal)).disabled.filter((name) => allowed.has(name)).map((name) => disabledSkillCandidate(name));
				} catch (error) {
					if (error instanceof NovelRepositoryError) return [];
					throw error;
				}
			},
			get: async (candidate) => {
				if (!allowed.has(candidate.name)) return void 0;
				return {
					name: candidate.name,
					description: candidate.description,
					invocation: candidate.invocation,
					source: candidate.source,
					provider: candidate.provider,
					content: ""
				};
			}
		};
	});
	ctx.on("novel/skill-settings-changed", () => {
		invalidate();
	});
}
function disabledSkillCandidate(name) {
	return {
		name,
		description: "Disabled by the current Novel Project Skill policy.",
		invocation: {
			modelInvocable: false,
			userInvocable: false
		},
		source: "custom",
		provider: NOVEL_SKILL_POLICY_PROVIDER,
		rank: NOVEL_SKILL_POLICY_RANK,
		locator: name
	};
}
//#endregion
export { NovelStudioPaths, NovelStudioPaths as default, applyNovelProjectSkillPolicy };
