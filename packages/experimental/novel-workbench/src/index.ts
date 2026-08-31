/** Host loader entry for the browser-only Novel Workbench. */

import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Startup barrier proving the browser workbench row has activated. */
    novelWorkbenchReady: NovelWorkbenchReady
  }
}

/**
 * Host-side readiness marker for the browser workbench.
 *
 * Its dependency ensures the repository adapter and all Host Novel services
 * are ready before this final browser row announces the completed roster.
 */
export class NovelWorkbenchReady extends Service {
  static inject = ['novelRepositoryClientReady']

  constructor(ctx: Context) {
    super(ctx, 'novelWorkbenchReady')
  }
}

export default NovelWorkbenchReady
