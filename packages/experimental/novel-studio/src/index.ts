/** Runtime paths owned by the experimental Novel Studio Profile bundle. */

import { fileURLToPath } from 'node:url'
import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelStudioPaths: NovelStudioPaths
  }
}

/** Absolute package-owned roots consumed by later Profile rows. */
export class NovelStudioPaths extends Service {
  // This service is the Web boot-manifest barrier used by cordis.patch.yml.
  // Do not publish it until the final browser-only Novel row has activated;
  // YAML row order alone does not serialize asynchronous plugin activation.
  static inject = ['novelWorkbenchReady']

  /** Absolute directory containing this package's shipped Agent Presets. */
  readonly presetRoot: string = fileURLToPath(new URL('../presets', import.meta.url))

  constructor(ctx: Context) {
    super(ctx, 'novelStudioPaths')
  }
}

export default NovelStudioPaths
