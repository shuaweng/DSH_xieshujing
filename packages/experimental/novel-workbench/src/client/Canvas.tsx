/** Typed Asset canvas, Context Commit Barrier, and optional reader presentation. */

import { useState } from 'react'
import type { CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CaptureNovelSelectionRequest,
  NovelAssetDocument,
  NovelSelectionDescriptor,
  SaveNovelAssetRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelAssetRendererRegistry } from './renderers.tsx'
import type { NovelReaderFont, NovelReaderPaper, createNovelWorkbenchStore } from './store.ts'
import css from './workbench.module.css'

export interface CanvasInjected {
  renderers: NovelAssetRendererRegistry
  save: (sessionId: SessionId, request: SaveNovelAssetRequest) => Promise<NovelAssetDocument>
  capture: (sessionId: SessionId, request: CaptureNovelSelectionRequest) => Promise<NovelSelectionDescriptor>
  appendReference: (sessionId: SessionId, reference: NovelSelectionDescriptor, label: string) => void
}

type CanvasProps = PropsRuntime<'novel.canvas'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<CanvasInjected>

const PAPERS: readonly NovelReaderPaper[] = ['paper', 'warm', 'green', 'night']

/** One exact-revision typed Asset editor with a compact Agent context handoff. */
export function Canvas({ useSessions, useStore, actions, renderers, save, capture, appendReference, t }: CanvasProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const state = useStore(value => value)
  const [busy, setBusy] = useState(false)

  const persist = async (): Promise<NovelAssetDocument | undefined> => {
    if (sessionId === undefined || state.document === undefined || state.draft === undefined) return undefined
    if (!state.dirty) return state.document
    setBusy(true)
    try {
      const saved = await save(sessionId, {
        assetId: state.document.id,
        baseRevisionId: state.document.revisionId,
        content: state.draft,
      })
      actions.saved(saved)
      return saved
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
      return undefined
    } finally {
      setBusy(false)
    }
  }

  const referenceSelection = async () => {
    if (sessionId === undefined || state.document === undefined || state.selection === undefined) return
    setBusy(true)
    try {
      const document = await persist()
      if (document === undefined) return
      const reference = await capture(sessionId, {
        assetId: document.id,
        revisionId: document.revisionId,
        selector: state.selection,
      })
      appendReference(sessionId, reference, shortReferenceLabel(reference.preview ?? document.title))
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (state.document === undefined || state.draft === undefined) {
    return <div className={css.empty}>{state.error ?? t('noChapter')}</div>
  }
  let renderer
  try {
    renderer = renderers.get(state.document.type)
  } catch (error: unknown) {
    return <div className={css.empty}>{errorMessage(error)}</div>
  }
  const reader = renderer.reader
  const characterCount = reader?.countCharacters(state.draft)
  return (
    <div className={css.editorShell}>
      <header className={css.editorHeader}>
        <div><small>{state.document.type} · {state.document.projectRelativePath}</small><h1>{state.document.title}</h1></div>
        <div className={css.editorActions}>
          {state.error === undefined
            ? <span>{busy ? t('saving') : state.dirty ? '' : t('saved')}</span>
            : <span className={css.error} role="alert">{state.error}</span>}
          <button type="button" disabled={!state.dirty || busy} onClick={() => { void persist() }}>{t('save')}</button>
          <button type="button" disabled={state.selection === undefined || busy} onClick={() => { void referenceSelection() }}>
            {t('reference')}
          </button>
        </div>
      </header>
      {reader === undefined ? null : (
        <div className={css.readerToolbar} aria-label={t('readerSettings')}>
          <span className={css.characterCount}><strong>{characterCount?.toLocaleString()}</strong> {t('characters')}</span>
          <label className={css.fontControl}>
            <span>{t('font')}</span>
            <select
              aria-label={t('font')}
              value={state.readerFont}
              onChange={(event) => { actions.setReaderFont(event.target.value as NovelReaderFont) }}
            >
              <option value="song">{t('fontSong')}</option>
              <option value="kai">{t('fontKai')}</option>
              <option value="sans">{t('fontSans')}</option>
            </select>
          </label>
          <div className={css.fontSizeControl} aria-label={t('fontSize')}>
            <button type="button" aria-label={t('decreaseFont')} onClick={() => { actions.setReaderFontSize(state.readerFontSize - 1) }}>−</button>
            <output>{state.readerFontSize}px</output>
            <button type="button" aria-label={t('increaseFont')} onClick={() => { actions.setReaderFontSize(state.readerFontSize + 1) }}>＋</button>
          </div>
          <div className={css.paperControl} role="group" aria-label={t('paperColor')}>
            {PAPERS.map(paper => (
              <button
                key={paper}
                type="button"
                className={css.paperSwatch}
                data-paper={paper}
                aria-label={t(paper)}
                aria-pressed={state.readerPaper === paper}
                onClick={() => { actions.setReaderPaper(paper) }}
              />
            ))}
          </div>
        </div>
      )}
      <div
        className={css.editorStage}
        data-reader={reader === undefined ? undefined : ''}
        data-reader-paper={reader === undefined ? undefined : state.readerPaper}
        data-reader-font={reader === undefined ? undefined : state.readerFont}
        style={reader === undefined ? undefined : { '--novel-reader-size': `${state.readerFontSize}px` } as CSSProperties}
      >
        {renderer.renderEditor({
          document: state.document,
          content: state.draft,
          ariaLabel: `${state.document.title} · ${t('editor')}`,
          onContentChange: actions.edit,
          onSelectionChange: actions.select,
        })}
      </div>
    </div>
  )
}

/** Human-facing reference label; the Composer occurrence retains the full model reference separately. */
export function shortReferenceLabel(preview: string): string {
  const characters = Array.from(preview.replace(/\s+/gu, ' ').trim())
  const visible = characters.slice(0, 10).join('')
  return `[${visible}${characters.length > 10 ? '…' : ''}]`
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
