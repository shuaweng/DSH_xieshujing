/** Runtime contribution owned by the experimental Novel Studio bundle. */
import { Service, type Context } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Context {
        novelStudioPaths: NovelStudioPaths;
    }
}
/** Package paths and Web boot readiness marker for Novel Studio. */
export declare class NovelStudioPaths extends Service {
    static inject: string[];
    /** Absolute directory containing this package's shipped Agent Presets. */
    readonly presetRoot: string;
    constructor(ctx: Context);
}
/**
 * Register the Novel Project Skill policy inside the active Preset scope.
 * The standard Skill Registry remains the only catalog and loader: disabled
 * names are shadowed by a higher-priority candidate whose official invocation
 * policy denies both model and user surfaces.
 * @param ctx - Preset-scoped Cordis context.
 * @param allowedNames - exact Novel Preset Skill names this policy may shadow.
 */
export declare function applyNovelProjectSkillPolicy(ctx: Context, allowedNames: readonly string[]): void;
export default NovelStudioPaths;
//# sourceMappingURL=index.d.ts.map