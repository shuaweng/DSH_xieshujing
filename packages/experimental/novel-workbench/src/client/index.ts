/** Browser assembly for the isolated Novel Studio Profile. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-experimental-novel-repository-client/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { AssetId, ChangeSetId } from '@deepseek-ai/dsh-experimental-novel-repository/types'
import type { ILayout } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { NovelFrame } from './NovelFrame.tsx'
import { Explorer, type ExplorerInjected } from './Explorer.tsx'
import { Canvas, type CanvasInjected } from './Canvas.tsx'
import { ChangeSetCard, type ChangeSetInjected, type NovelChangeReview } from './ChangeSetCard.tsx'
import {
  createNovelFrameStore, createNovelWorkbenchStore, type NovelFramePanelActions,
} from './store.ts'
import { en, NS, zh, type NovelWorkbenchKey } from './locales.ts'

export const inject = [
  'slots', 'sessions', 'remote', 'remote.novelRepository', 'theme', 'locale',
]

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /**
     * Single root-scoped seat for the Novel chapter explorer. Registering replaces
     * the shipped explorer and receives only standard root props; the seat exists
     * while the Novel root occupant is mounted.
     */
    'novel.explorer': { kind: 'single'; scope: 'root'; owner: Record<never, never> }
    /**
     * Single root-scoped seat for the active Novel Asset canvas. Registering replaces
     * the shipped chapter editor and receives only standard root props; the seat exists
     * while the Novel root occupant is mounted.
     */
    'novel.canvas': { kind: 'single'; scope: 'root'; owner: Record<never, never> }
  }
  interface LocaleNamespaceMap {
    'novel-workbench': NovelWorkbenchKey
  }
}

class NovelLayout implements ILayout {
  private panels?: NovelFramePanelActions

  attach(panels: NovelFramePanelActions): void { this.panels = panels }
  toggleSidebar(): void { this.panels?.toggleSidebar() }
  openDetails(): void { this.panels?.openDetails() }
  closeDetails(): void { this.panels?.closeDetails() }
}

/** Mount one root workbench while retaining the shipped conversation surface. */
export function apply(ctx: Context): void {
  const remote = ctx.remote.novelRepository
  const store = createNovelWorkbenchStore()
  const frameStore = createNovelFrameStore()
  const refreshListeners = new Set<() => void>()
  const refreshWorkbench = (): void => { for (const listener of refreshListeners) listener() }
  const layout = new NovelLayout()
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'novel-workbench: dictionaries')
  ctx.effect(() => ctx.reflect.provide('layout', layout), 'novel-workbench: layout service')

  ctx.slots.register({
    name: 'root',
    locale: NS,
    store: frameStore,
    inject: (actions: NovelFramePanelActions) => {
      layout.attach(actions)
      return {}
    },
    children: {
      'sidebar': { kind: 'single', scope: 'root' },
      'novel.explorer': { kind: 'single', scope: 'root' },
      'novel.canvas': { kind: 'single', scope: 'root' },
      'conversation': { kind: 'single', scope: 'session-maybe' },
      'details': { kind: 'single', scope: 'session' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  }, NovelFrame)

  ctx.slots.register({
    name: 'novel.explorer',
    locale: NS,
    store,
    inject: (): ExplorerInjected => ({
      load: async (sessionId) => {
        const project = await unwrapRemote(remote.discover(sessionId), 'discover Novel Project')
        return {
          ...(project === undefined ? {} : { project }),
          assets: await unwrapRemote(remote.assets(sessionId), 'list Novel Assets'),
        }
      },
      open: async (sessionId, assetId) => await unwrapRemote(
        remote.asset(sessionId, assetId as AssetId, null),
        'open Novel Asset',
      ),
      onRefresh: (listener) => {
        refreshListeners.add(listener)
        return () => { refreshListeners.delete(listener) }
      },
    }),
  }, Explorer)

  ctx.slots.register({
    name: 'novel.canvas',
    locale: NS,
    store,
    inject: (): CanvasInjected => ({
      save: async (sessionId, request) => await unwrapRemote(remote.saveChapter(sessionId, request), 'save chapter'),
      capture: async (sessionId, request) => await unwrapRemote(
        remote.captureSelection(sessionId, request),
        'capture chapter selection',
      ),
      appendMention: (sessionId, mention) => {
        const scoped = ctx.sessions.scope(sessionId)
        if (scoped === undefined) throw new Error(`novel workbench: Session ${JSON.stringify(sessionId)} has no browser scope`)
        const conversation = ctx.get('conversation')
        if (conversation === undefined) throw new Error('novel workbench: conversation service is unavailable')
        const input = conversation.input.for(scoped)
        const draft = input.state.getSnapshot().draft
        input.setDraft(`${draft}${draft === '' || /\s$/u.test(draft) ? '' : ' '}${mention} `)
      },
    }),
  }, Canvas)

  const reviewActions = (): ChangeSetInjected => ({
    read: async (sessionId, changeSetId): Promise<NovelChangeReview> => {
      const changeSet = await unwrapRemote(
        remote.changeSet(sessionId as SessionId, changeSetId as ChangeSetId),
        'read ChangeSet',
      )
      const base = await unwrapRemote(
        remote.asset(
          sessionId as SessionId,
          changeSet.assetId,
          changeSet.baseRevisionId,
        ),
        'read ChangeSet base Revision',
      )
      return { changeSet, before: base.body }
    },
    applyChange: async (sessionId, changeSetId) => await unwrapRemote(
      remote.applyChangeSet(sessionId as SessionId, changeSetId as ChangeSetId),
      'apply ChangeSet',
    ),
    rejectChange: async (sessionId, changeSetId) => await unwrapRemote(
      remote.rejectChangeSet(sessionId as SessionId, changeSetId as ChangeSetId),
      'reject ChangeSet',
    ),
    refreshWorkbench,
  })
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'novel_propose_changes',
    locale: NS,
    inject: (_sessionId: SessionId): ChangeSetInjected => reviewActions(),
  }, ChangeSetCard))

  ctx.effect(() => {
    const appliedTokens = new Set<string>()
    const applyTheme = (snapshot: ThemeSnapshot): void => {
      const scheme = snapshot.active.colorScheme
      document.documentElement.style.colorScheme = scheme
      document.body.toggleAttribute('data-ds-dark-theme', scheme === 'dark')
      const nextTokens = new Set(Object.keys(snapshot.active.tokens))
      for (const name of appliedTokens) {
        if (!nextTokens.has(name)) document.body.style.removeProperty(name)
      }
      for (const [name, value] of Object.entries(snapshot.active.tokens)) document.body.style.setProperty(name, value)
      appliedTokens.clear()
      for (const name of nextTokens) appliedTokens.add(name)
    }
    applyTheme(ctx.theme.getTheme())
    const off = ctx.on('theme/change', applyTheme)
    return () => {
      off()
      document.documentElement.style.removeProperty('color-scheme')
      document.body.removeAttribute('data-ds-dark-theme')
      for (const name of appliedTokens) document.body.style.removeProperty(name)
    }
  }, 'novel-workbench: theme presentation')
}

async function unwrapRemote<T>(pending: Promise<RemoteResult<T>>, operation: string): Promise<T> {
  const result = await pending
  if (!result.ok) throw new Error(`${operation} failed: ${result.error.code}: ${result.error.message}`)
  return result.value
}
