/** Runtime contribution owned by the experimental Novel Studio bundle. */
import { Service, type Context } from '@deepseek-ai/cordis';
declare module '@deepseek-ai/cordis' {
    interface Context {
        novelStudioPaths: NovelStudioPaths;
    }
}
/** Package paths and lifecycle-scoped Preset contribution for Novel Studio. */
export declare class NovelStudioPaths extends Service {
    static inject: string[];
    /** Absolute directory containing this package's shipped Agent Presets. */
    readonly presetRoot: string;
    constructor(ctx: Context);
}
export default NovelStudioPaths;
//# sourceMappingURL=index.d.ts.map