/** Shared browser state for explorer, typed editors, reader presentation, and proposal cards. */

import { defineStore, type EngineStoreHandle, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
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
  /** Session whose project/document projection currently owns this shared root store. */
  sessionId?: SessionId
  projectStatus: 'loading' | 'uninitialized' | 'ready' | 'error'
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
  bindSession: (draft: NovelWorkbenchState, sessionId?: SessionId) => void
  reset: (draft: NovelWorkbenchState) => void
  loaded: (draft: NovelWorkbenchState, project: NovelProjectDescriptor, assets: readonly NovelAssetDescriptor[]) => void
  uninitialized: (draft: NovelWorkbenchState) => void
  assetCreated: (draft: NovelWorkbenchState, document: NovelAssetDocument) => void
  assetsDeleted: (draft: NovelWorkbenchState, assets: readonly NovelAssetDescriptor[], deletedAssetIds: readonly string[]) => void
  assetsReordered: (draft: NovelWorkbenchState, assets: readonly NovelAssetDescriptor[]) => void
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

/**
 * Create the one apply-lifetime store shared by all Novel registrations.
 * @returns the isolated Novel workbench store handle.
 */
export function createNovelWorkbenchStore(): EngineStoreHandle<NovelWorkbenchState, Actions> {
  return defineStore({
    init: (): NovelWorkbenchState => ({
      projectStatus: 'loading',
      assets: [],
      dirty: false,
      readerSkin: 'paper',
      readerFont: 'song',
      readerFontSize: 18,
      loading: true,
      reload: 0,
    }),
    actions: {
      bindSession: (draft, sessionId) => {
        if (draft.sessionId === sessionId) return
        if (sessionId === undefined) delete draft.sessionId
        else draft.sessionId = sessionId
        resetProjectProjection(draft)
      },
      reset: (draft) => {
        resetProjectProjection(draft)
      },
      loaded: (draft, project, assets) => {
        draft.projectStatus = 'ready'
        draft.project = project
        draft.assets = [...assets]
        draft.loading = false
        delete draft.error
      },
      uninitialized: (draft) => {
        draft.projectStatus = 'uninitialized'
        draft.loading = false
        delete draft.project
        delete draft.document
        delete draft.titleDraft
        delete draft.draft
        delete draft.selection
        delete draft.error
        draft.assets = []
        draft.dirty = false
      },
      assetCreated: (draft, document) => {
        const descriptor = descriptorOf(document)
        draft.assets = [...draft.assets.filter(asset => asset.id !== descriptor.id), descriptor]
      },
      assetsDeleted: (draft, assets, deletedAssetIds) => {
        draft.assets = [...assets]
        if (draft.document !== undefined && deletedAssetIds.includes(draft.document.id)) {
          delete draft.document
          delete draft.titleDraft
          delete draft.draft
          delete draft.selection
          draft.dirty = false
        }
        delete draft.error
      },
      assetsReordered: (draft, assets) => {
        draft.assets = [...assets]
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
      fail: (draft, message) => { draft.projectStatus = 'error'; draft.loading = false; draft.error = message },
      refresh: (draft) => { draft.reload += 1 },
    },
  })
}

function resetProjectProjection(draft: NovelWorkbenchState): void {
  draft.projectStatus = 'loading'
  delete draft.project
  delete draft.document
  delete draft.titleDraft
  delete draft.error
  draft.assets = []
  delete draft.draft
  delete draft.selection
  draft.dirty = false
  draft.loading = true
}

function isDirty(state: NovelWorkbenchState): boolean {
  return state.titleDraft !== state.document?.title
    || JSON.stringify(state.document?.content) !== JSON.stringify(state.draft)
}

function descriptorOf(document: NovelAssetDocument): NovelAssetDescriptor {
  const { content: _content, ...descriptor } = document
  return descriptor
}
