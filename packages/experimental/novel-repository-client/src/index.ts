/** Host loader entry for the browser-only Novel Repository Client adapter. */

import { Service, type Context } from '@deepseek-ai/cordis'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Startup barrier proving the browser adapter row has activated. */
    novelRepositoryClientReady: NovelRepositoryClientReady
  }
}

/**
 * Host-side readiness marker for the browser adapter.
 *
 * Client entries are added to the frozen Web boot manifest only after their
 * Host loader row activates. Waiting on the Remote provider here turns that
 * registration into a deterministic link in the Novel Studio startup chain.
 */
export class NovelRepositoryClientReady extends Service {
  static inject = ['novelRepositoryRemote']

  constructor(ctx: Context) {
    super(ctx, 'novelRepositoryClientReady')
  }
}

export default NovelRepositoryClientReady
