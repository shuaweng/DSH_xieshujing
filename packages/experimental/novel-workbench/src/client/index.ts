/** Browser assembly for the isolated Novel Studio Profile. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type {} from '@deepseek-ai/dsh-experimental-novel-repository-client/client'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { AssetId, ChangeSetId, RevisionId } from '@deepseek-ai/dsh-experimental-novel-repository/types'
import type { CreateNovelAssetRequest } from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-agent-preset/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import { Explorer, type ExplorerInjected } from './Explorer.tsx'
import { Canvas, type CanvasInjected } from './Canvas.tsx'
import { ChangeSetCard, type ChangeSetInjected, type NovelChangeReview } from './ChangeSetCard.tsx'
import { CreatedAssetCard, type CreatedAssetInjected } from './CreatedAssetCard.tsx'
import { NovelPresentationCard, type NovelPresentationInjected } from './NovelPresentationCard.tsx'
import { WorkbenchToggle, type WorkbenchToggleInjected } from './WorkbenchToggle.tsx'
import { NovelFrame, type NovelFrameInjected } from './NovelFrame.tsx'
import { ContextTray, type ContextTrayInjected } from './ContextTray.tsx'
import { NovelContextFocusController, NovelProjectStatusController } from './context-controller.ts'
import {
  manuscriptChapterRenderer,
  NovelAssetRendererRegistry,
} from './renderers.tsx'
import { createNovelWorkbenchStore } from './store.ts'
import { NovelWorkbenchViewController } from './view-controller.ts'
import { NOVEL_WORKBENCH_ID, NOVEL_WORKBENCH_PRESET } from './constants.ts'
import { en, NS, zh, type NovelWorkbenchKey } from './locales.ts'

const NOVEL_SELECTION_REFERENCE_SOURCE = 'novel-selection'

interface NovelComposerReference {
  readonly mention: string
  readonly clipboardText: string
}

const novelSelectionReferenceSource: InputTriggerSource = {
  trigger: '@',
  name: NOVEL_SELECTION_REFERENCE_SOURCE,
  showGroupTitle: false,
  candidates: () => Promise.resolve([]),
  onPick: () => undefined,
  codec: {
    clipboardText: ref => decodeComposerReference(ref).clipboardText,
    serialize: (ref, signal) => {
      if (signal.aborted) return Promise.reject(signal.reason instanceof Error ? signal.reason : new Error('Novel reference serialization aborted'))
      return Promise.resolve(decodeComposerReference(ref).mention)
    },
  },
}

export {
  NovelAssetRendererRegistry,
  type NovelAssetEditorProps,
  type NovelAssetRendererDefinition,
} from './renderers.tsx'

export const inject = [
  'slots', 'sessions', 'remote', 'remote.novelRepository', 'theme', 'locale', 'inputTriggers', 'layout',
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

function selectNovelWorkbench({ id }: { id: string }): { id: 'novel' } | null {
  return id === NOVEL_WORKBENCH_ID ? { id: NOVEL_WORKBENCH_ID } : null
}

/** Contribute the preset-scoped Novel surface to the shipped DSH shell. */
export function apply(ctx: Context): void {
  const remote = ctx.remote.novelRepository
  const store = createNovelWorkbenchStore()
  const workbench = new NovelWorkbenchViewController()
  const contextFocus = new NovelContextFocusController()
  const projectStatus = new NovelProjectStatusController()
  const refreshListeners = new Set<() => void>()
  const refreshWorkbench = (): void => { for (const listener of refreshListeners) listener() }
  const renderers = new NovelAssetRendererRegistry(ctx)
  renderers.register(manuscriptChapterRenderer)
  ctx.effect(
    () => ctx.inputTriggers.registerSource(novelSelectionReferenceSource),
    'novel-workbench: exact SelectionRef serializer',
  )
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'novel-workbench: dictionaries')
  ctx.slots.inject('shell.workbench', () => ctx.slots.register({
    name: 'shell.workbench',
    select: selectNovelWorkbench,
    locale: NS,
    inject: (): NovelFrameInjected => ({
      workbench,
      setAgentWidth: (width) => { ctx.layout.setWorkbenchAgentWidth(width) },
    }),
    children: {
      'novel.explorer': { kind: 'single', scope: 'root' },
      'novel.canvas': { kind: 'single', scope: 'root' },
    },
  }, NovelFrame))

  // The staged preset face lives in the conversation/preset child scope, not
  // at the application root. Requiring it in this plugin's top-level inject
  // list leaves the *entire* Novel workbench pending forever: repository UI,
  // context tray, and toggle all disappear without a useful page-level error.
  // Only the one control that reads the staged choice follows that scoped
  // service; the rest of the workbench remains rooted and can activate.
  ctx.inject(['agentPresetSelection'], (scope: Context) => {
    scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left',
      id: 'novel-workbench-toggle',
      order: -20,
      locale: NS,
      inject: (): WorkbenchToggleInjected => ({
        hooks: {
          workbench: scope.layout.workbench,
          agentPresetSelection: scope.agentPresetSelection,
        },
        toggleWorkbench: () => {
          scope.layout.toggleWorkbench(NOVEL_WORKBENCH_ID, NOVEL_WORKBENCH_PRESET)
        },
      }),
    }, WorkbenchToggle))
  })

  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'novel-context',
    order: 5,
    locale: NS,
    inject: (sessionId): ContextTrayInjected => ({
      hooks: { contextFocus, projectStatus },
      search: async request => await unwrapRemote(remote.search(sessionId, request), 'search Novel Assets'),
      replace: async workset => await unwrapRemote(
        remote.replaceContextWorkset(sessionId, workset),
        'update Novel context',
      ),
    }),
  }, ContextTray))

  ctx.slots.register({
    name: 'novel.explorer',
    locale: NS,
    store,
    inject: (): ExplorerInjected => ({
      renderers,
      load: async (sessionId) => {
        const project = await unwrapRemote(remote.discover(sessionId), 'discover Novel Project')
        if (project === undefined) return { assets: [] }
        return {
          project,
          assets: await unwrapRemote(remote.assets(sessionId), 'list Novel Assets'),
        }
      },
      open: async (sessionId, assetId) => await unwrapRemote(
        remote.asset(sessionId, assetId as AssetId, null),
        'open Novel Asset',
      ),
      create: async (sessionId, request: CreateNovelAssetRequest) => await unwrapRemote(
        remote.createAsset(sessionId, request),
        'create Novel Asset',
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
      renderers,
      initialize: async (sessionId, title) => await unwrapRemote(
        remote.initialize(sessionId, { title }),
        'initialize Novel Project',
      ),
      open: async (sessionId, assetId, revisionId) => await unwrapRemote(
        remote.asset(sessionId, assetId as AssetId, revisionId === undefined ? null : revisionId as RevisionId),
        'open Novel Asset',
      ),
      revisions: async (sessionId, assetId) => await unwrapRemote(
        remote.revisions(sessionId, assetId as AssetId),
        'list Novel Asset Revisions',
      ),
      analysisReports: async (sessionId, assetId, revisionId) => await unwrapRemote(
        remote.analysisReports(sessionId, assetId as AssetId, revisionId as RevisionId),
        'list Novel analysis reports',
      ),
      scanNoAi: async (sessionId, assetId, revisionId) => await unwrapRemote(
        remote.scanNoAi(sessionId, assetId as AssetId, revisionId as RevisionId),
        'scan chapter for AI-style patterns',
      ),
      reviewChapter: async (sessionId, assetId, revisionId) => await unwrapRemote(
        remote.reviewChapter(sessionId, assetId as AssetId, revisionId as RevisionId),
        'review chapter',
      ),
      finalizations: async (sessionId, assetId) => await unwrapRemote(
        remote.revisionFinalizations(sessionId, assetId as AssetId),
        'list Revision finalizations',
      ),
      preferenceCandidates: async (sessionId, assetId, revisionId) => await unwrapRemote(
        remote.preferenceCandidates(sessionId, assetId as AssetId, revisionId as RevisionId),
        'list preference candidates',
      ),
      finalizeChapter: async (sessionId, assetId, revisionId) => await unwrapRemote(
        remote.finalizeChapter(sessionId, assetId as AssetId, revisionId as RevisionId),
        'finalize chapter',
      ),
      acceptPreference: async (sessionId, candidateId) => (await unwrapRemote(
        remote.acceptPreference(sessionId, candidateId as import('@deepseek-ai/dsh-experimental-novel-repository').PreferenceCandidateId),
        'accept preference candidate',
      )).candidate,
      rejectPreference: async (sessionId, candidateId) => (await unwrapRemote(
        remote.rejectPreference(sessionId, candidateId as import('@deepseek-ai/dsh-experimental-novel-repository').PreferenceCandidateId),
        'reject preference candidate',
      )).candidate,
      create: async (sessionId, request) => await unwrapRemote(
        remote.createAsset(sessionId, request),
        'create Novel Asset',
      ),
      save: async (sessionId, request) => await unwrapRemote(remote.saveAsset(sessionId, request), 'save Novel Asset'),
      capture: async (sessionId, request) => await unwrapRemote(
        remote.captureSelection(sessionId, request),
        'capture chapter selection',
      ),
      appendReference: (sessionId, reference, label) => {
        const scoped = ctx.sessions.scope(sessionId)
        if (scoped === undefined) throw new Error(`novel workbench: Session ${JSON.stringify(sessionId)} has no browser scope`)
        const conversation = ctx.get('conversation')
        if (conversation === undefined) throw new Error('novel workbench: conversation service is unavailable')
        const input = conversation.input.for(scoped)
        const display = `@${label}`
        const inserted = input.insertReferenceAtSelection({
          source: NOVEL_SELECTION_REFERENCE_SOURCE,
          ref: encodeComposerReference({ mention: reference.mention, clipboardText: display }),
          label,
          clipboardText: display,
        })
        if (!inserted) throw new Error('novel workbench: Composer rejected the SelectionRef insertion')
      },
      reportContextFocus: (value) => { contextFocus.set(value) },
      reportProjectStatus: (value) => { projectStatus.set(value) },
    }),
  }, Canvas)

  const reviewActions = (): ChangeSetInjected => ({
    renderers,
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
      return { changeSet, before: base.content, beforeTitle: base.title }
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
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'novel_create',
    locale: NS,
    inject: (): CreatedAssetInjected => ({ refreshWorkbench }),
  }, CreatedAssetCard))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'novel_initialize_project',
    locale: NS,
    inject: (): CreatedAssetInjected => ({ refreshWorkbench }),
  }, CreatedAssetCard))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'novel_present',
    locale: NS,
    inject: (): NovelPresentationInjected => ({
      present: (intent) => {
        if (intent === 'open-workbench') ctx.layout.openWorkbench(NOVEL_WORKBENCH_ID, NOVEL_WORKBENCH_PRESET)
        else ctx.layout.closeWorkbench()
      },
    }),
  }, NovelPresentationCard))

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

function encodeComposerReference(reference: NovelComposerReference): string {
  return JSON.stringify(reference)
}

function decodeComposerReference(value: string): NovelComposerReference {
  const parsed: unknown = JSON.parse(value)
  if (typeof parsed !== 'object' || parsed === null
    || !('mention' in parsed) || typeof parsed.mention !== 'string'
    || !('clipboardText' in parsed) || typeof parsed.clipboardText !== 'string') {
    throw new Error('novel workbench: malformed Composer SelectionRef')
  }
  return { mention: parsed.mention, clipboardText: parsed.clipboardText }
}
