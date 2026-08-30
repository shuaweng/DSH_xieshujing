/** Runtime contribution owned by the experimental Novel Studio bundle. */

import { fileURLToPath } from 'node:url'
import { Service, type Context } from '@deepseek-ai/cordis'
// Type-only: resolves the AgentPresets context augmentation used below.
import type {} from '@deepseek-ai/dsh-agent-presets'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelStudioPaths: NovelStudioPaths
  }
}

/** Package paths and lifecycle-scoped Preset contribution for Novel Studio. */
export class NovelStudioPaths extends Service {
  // This service is the Web boot-manifest barrier used by cordis.patch.yml.
  // Do not publish it until the final browser-only Novel row has activated;
  // YAML row order alone does not serialize asynchronous plugin activation.
  static inject = ['agentPresets', 'novelWorkbenchReady']

  /** Absolute directory containing this package's shipped Agent Presets. */
  readonly presetRoot: string = fileURLToPath(new URL('../presets', import.meta.url))

  constructor(ctx: Context) {
    super(ctx, 'novelStudioPaths')
    ctx.agentPresets.registerRoot({
      id: '@xieshujing/dsh-plugin',
      root: { path: this.presetRoot, trust: 'system' },
    })
  }
}

export default NovelStudioPaths
