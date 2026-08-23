/** Shared browser state for explorer, typed editors, reader presentation, and proposal cards. */

import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelProjectDescriptor,
  NovelWireValue,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'

/** Calm reader surfaces shipped for manuscript Assets. */
export type NovelReaderPaper = 'paper' | 'warm' | 'green' | 'night'
/** Human-readable type families shipped for manuscript Assets. */
export type NovelReaderFont = 'song' | 'kai' | 'sans'

/** Shared chapter, draft, selection, and loading state for Novel workbench surfaces. */
export interface NovelWorkbenchState {
  project?: NovelProjectDescriptor
  assets: readonly NovelAssetDescriptor[]
  document?: NovelAssetDocument
  draft?: NovelWireValue
  dirty: boolean
  selection?: NovelWireValue
  readerPaper: NovelReaderPaper
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
  select: (draft: NovelWorkbenchState, selection?: NovelWireValue) => void
  setReaderPaper: (draft: NovelWorkbenchState, paper: NovelReaderPaper) => void
  setReaderFont: (draft: NovelWorkbenchState, font: NovelReaderFont) => void
  setReaderFontSize: (draft: NovelWorkbenchState, size: number) => void
  fail: (draft: NovelWorkbenchState, message: string) => void
  refresh: (draft: NovelWorkbenchState) => void
}

/** Transient root panel visibility controlled through the ordinary layout service. */
export interface NovelFrameState {
  sidebarCollapsed: boolean
  detailsOpen: boolean
  agentWidth: number
}

type NovelFrameActions = {
  toggleSidebar: (draft: NovelFrameState) => void
  openDetails: (draft: NovelFrameState) => void
  closeDetails: (draft: NovelFrameState) => void
  setAgentWidth: (draft: NovelFrameState, width: number) => void
}

/** Browser-bound panel actions exposed through the ordinary DSH layout service. */
export interface NovelFramePanelActions {
  toggleSidebar: () => void
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
      readerPaper: 'paper',
      readerFont: 'song',
      readerFontSize: 18,
      loading: true,
      reload: 0,
    }),
    actions: {
      reset: (draft) => {
        delete draft.project
        delete draft.document
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
        draft.draft = structuredClone(document.content)
        draft.dirty = false
        delete draft.selection
        delete draft.error
      },
      saved: (draft, document) => {
        draft.document = document
        draft.draft = structuredClone(document.content)
        draft.dirty = false
        delete draft.error
      },
      edit: (draft, content) => {
        draft.draft = structuredClone(content)
        draft.dirty = JSON.stringify(draft.document?.content) !== JSON.stringify(content)
        delete draft.error
      },
      select: (draft, selection) => {
        if (selection === undefined) delete draft.selection
        else draft.selection = structuredClone(selection)
      },
      setReaderPaper: (draft, paper) => { draft.readerPaper = paper },
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
    init: (): NovelFrameState => ({ sidebarCollapsed: true, detailsOpen: false, agentWidth: 410 }),
    actions: {
      toggleSidebar: (draft) => { draft.sidebarCollapsed = !draft.sidebarCollapsed },
      openDetails: (draft) => { draft.detailsOpen = true },
      closeDetails: (draft) => { draft.detailsOpen = false },
      setAgentWidth: (draft, width) => { draft.agentWidth = Math.min(640, Math.max(300, Math.round(width))) },
    },
  })
}
