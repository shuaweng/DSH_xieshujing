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
  /** Absolute directory containing this package's shipped Agent Presets. */
  readonly presetRoot: string = fileURLToPath(new URL('../presets', import.meta.url))

  constructor(ctx: Context) {
    super(ctx, 'novelStudioPaths')
  }
}

export default NovelStudioPaths
