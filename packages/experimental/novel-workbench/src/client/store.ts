/** Shared browser state for explorer, typed editors, reader presentation, and proposal cards. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelProjectDescriptor,
  NovelWireValue,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'

/** Coordinated workspace, paper, and text palettes shipped for manuscript Assets. */
export type NovelReaderSkin = 'paper' | 'warm' | 'green' | 'rose' | 'blue' | 'night'
/** Human-readable type families shipped for manuscript Assets. */
export type NovelReaderFont = 'song' | 'kai' | 'sans'

/** Shared chapter, draft, selection, and loading state for Novel workbench surfaces. */
export interface NovelWorkbenchState {
  project?: NovelProjectDescriptor
  assets: readonly NovelAssetDescriptor[]
  document?: NovelAssetDocument
  /** Editable authored title kept beside typed content until one guarded save commits both. */
  titleDraft?: string
  draft?: NovelWireValue
  dirty: boolean
  selection?: NovelWireValue
  readerSkin: NovelReaderSkin
  readerFont: NovelReaderFont
  readerFontSize: number
  loading: boolean
  error?: string
  reload: number
}

type Actions = {
  reset: (draft: NovelWorkbenchState) => void
  loaded: (draft: NovelWorkbenchState, project: NovelProjectDescriptor, assets: readonly NovelAssetDescriptor[]) => void
  open: (draft: NovelWorkbenchState, document: NovelAssetDocument) => void
  saved: (draft: NovelWorkbenchState, document: NovelAssetDocument) => void
  edit: (draft: NovelWorkbenchState, content: NovelWireValue) => void
  editTitle: (draft: NovelWorkbenchState, title: string) => void
  select: (draft: NovelWorkbenchState, selection?: NovelWireValue) => void
  setReaderSkin: (draft: NovelWorkbenchState, skin: NovelReaderSkin) => void
  setReaderFont: (draft: NovelWorkbenchState, font: NovelReaderFont) => void
  setReaderFontSize: (draft: NovelWorkbenchState, size: number) => void
  fail: (draft: NovelWorkbenchState, message: string) => void
  refresh: (draft: NovelWorkbenchState) => void
}

/** Transient root panel visibility controlled through the ordinary layout service. */
export interface NovelFrameState {
  sidebarCollapsed: boolean
  explorerCollapsed: boolean
  detailsOpen: boolean
  agentWidth: number
}

type NovelFrameActions = {
  toggleSidebar: (draft: NovelFrameState) => void
  toggleExplorer: (draft: NovelFrameState) => void
  openDetails: (draft: NovelFrameState) => void
  closeDetails: (draft: NovelFrameState) => void
  setAgentWidth: (draft: NovelFrameState, width: number) => void
}

/** Browser-bound panel actions exposed through the ordinary DSH layout service. */
export interface NovelFramePanelActions {
  toggleSidebar: () => void
  toggleExplorer: () => void
  openDetails: () => void
  closeDetails: () => void
  setAgentWidth: (width: number) => void
}

/**
 * Create the one apply-lifetime store shared by all Novel registrations.
 * @returns the isolated Novel workbench store handle.
 */
export function createNovelWorkbenchStore(): EngineStoreHandle<NovelWorkbenchState, Actions> {
  return defineStore({
    init: (): NovelWorkbenchState => ({
      assets: [],
      dirty: false,
      readerSkin: 'paper',
      readerFont: 'song',
      readerFontSize: 18,
      loading: true,
      reload: 0,
    }),
    actions: {
      reset: (draft) => {
        delete draft.project
        delete draft.document
        delete draft.titleDraft
        delete draft.error
        draft.assets = []
        delete draft.draft
        delete draft.selection
        draft.dirty = false
        draft.loading = true
      },
      loaded: (draft, project, assets) => {
        draft.project = project
        draft.assets = [...assets]
        draft.loading = false
        delete draft.error
      },
      open: (draft, document) => {
        draft.document = document
        draft.titleDraft = document.title
        draft.draft = structuredClone(document.content)
        draft.dirty = false
        delete draft.selection
        delete draft.error
      },
      saved: (draft, document) => {
        draft.document = document
        draft.titleDraft = document.title
        draft.draft = structuredClone(document.content)
        draft.assets = draft.assets.map(asset => asset.id === document.id ? descriptorOf(document) : asset)
        draft.dirty = false
        delete draft.error
      },
      edit: (draft, content) => {
        draft.draft = structuredClone(content)
        draft.dirty = isDirty(draft)
        delete draft.error
      },
      editTitle: (draft, title) => {
        draft.titleDraft = title
        draft.dirty = isDirty(draft)
        delete draft.error
      },
      select: (draft, selection) => {
        if (selection === undefined) delete draft.selection
        else draft.selection = structuredClone(selection)
      },
      setReaderSkin: (draft, skin) => { draft.readerSkin = skin },
      setReaderFont: (draft, font) => { draft.readerFont = font },
      setReaderFontSize: (draft, size) => { draft.readerFontSize = Math.min(28, Math.max(14, Math.round(size))) },
      fail: (draft, message) => { draft.loading = false; draft.error = message },
      refresh: (draft) => { draft.reload += 1 },
    },
  })
}

/**
 * Create transient panel state for the Novel root occupant.
 * @returns the isolated root-panel store handle.
 */
export function createNovelFrameStore(): EngineStoreHandle<NovelFrameState, NovelFrameActions> {
  return defineStore({
    init: (): NovelFrameState => ({ sidebarCollapsed: true, explorerCollapsed: false, detailsOpen: false, agentWidth: 410 }),
    actions: {
      toggleSidebar: (draft) => { draft.sidebarCollapsed = !draft.sidebarCollapsed },
      toggleExplorer: (draft) => { draft.explorerCollapsed = !draft.explorerCollapsed },
      openDetails: (draft) => { draft.detailsOpen = true },
      closeDetails: (draft) => { draft.detailsOpen = false },
      setAgentWidth: (draft, width) => { draft.agentWidth = Math.min(640, Math.max(300, Math.round(width))) },
    },
  })
}

function isDirty(state: NovelWorkbenchState): boolean {
  return state.titleDraft !== state.document?.title
    || JSON.stringify(state.document?.content) !== JSON.stringify(state.draft)
}

function descriptorOf(document: NovelAssetDocument): NovelAssetDescriptor {
  const { content: _content, ...descriptor } = document
  return descriptor
}
