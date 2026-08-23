/** Manuscript editor, Context Commit Barrier, and visible context tray. */

import { useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CaptureNovelSelectionRequest,
  NovelChapterDocument,
  NovelSelectionDescriptor,
  SaveNovelChapterRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { createNovelWorkbenchStore } from './store.ts'
import css from './workbench.module.css'

export interface CanvasInjected {
  save: (sessionId: SessionId, request: SaveNovelChapterRequest) => Promise<NovelChapterDocument>
  capture: (sessionId: SessionId, request: CaptureNovelSelectionRequest) => Promise<NovelSelectionDescriptor>
  appendMention: (sessionId: SessionId, mention: string) => void
}

type CanvasProps = PropsRuntime<'novel.canvas'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<CanvasInjected>

/** One exact-revision chapter editor with a visible Agent context handoff. */
export function Canvas({ useSessions, useStore, actions, save, capture, appendMention, t }: CanvasProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const state = useStore(value => value)
  const [busy, setBusy] = useState(false)

  const persist = async (): Promise<NovelChapterDocument | undefined> => {
    if (sessionId === undefined || state.document === undefined) return undefined
    if (!state.dirty) return state.document
    setBusy(true)
    try {
      const saved = await save(sessionId, {
        assetId: state.document.id,
        baseRevisionId: state.document.revisionId,
        body: state.draft,
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
    if (sessionId === undefined || state.document === undefined || state.selection.end <= state.selection.start) return
    setBusy(true)
    try {
      /* v8 ignore next -- the guard above guarantees persist returns the current or newly saved document. */
      const document = await persist()
      if (document === undefined) return
      const reference = await capture(sessionId, {
        assetId: document.id,
        revisionId: document.revisionId,
        startUtf16: state.selection.start,
        endUtf16: state.selection.end,
      })
      appendMention(sessionId, reference.mention)
      actions.referenced(reference)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  if (state.document === undefined) return <div className={css.empty}>{state.error ?? t('noChapter')}</div>
  return (
    <div className={css.editorShell}>
      <header className={css.editorHeader}>
        <div><small>{state.document.projectRelativePath}</small><h1>{state.document.title}</h1></div>
        <div className={css.editorActions}>
          {state.error === undefined
            ? <span>{busy ? t('saving') : state.dirty ? '' : t('saved')}</span>
            : <span className={css.error} role="alert">{state.error}</span>}
          <button type="button" disabled={!state.dirty || busy} onClick={() => { void persist() }}>{t('save')}</button>
          <button type="button" disabled={state.selection.end <= state.selection.start || busy} onClick={() => { void referenceSelection() }}>
            {t('reference')}
          </button>
        </div>
      </header>
      <textarea
        className={css.editor}
        aria-label={`${state.document.title} · ${t('editor')}`}
        value={state.draft}
        spellCheck
        onChange={(event) => { actions.edit(event.target.value) }}
        onSelect={(event) => { actions.select(event.currentTarget.selectionStart, event.currentTarget.selectionEnd) }}
      />
      <section className={css.contextTray} aria-label={t('context')}>
        <strong>{t('context')}</strong>
        {state.reference === undefined
          ? <span>{t('contextEmpty')}</span>
          : (
            <span className={css.contextChip}>
              {state.document.title} · {state.reference.selector.startUtf16}–{state.reference.selector.endUtf16}
              {state.reference.preview === undefined ? '' : ` · ${state.reference.preview}`}
            </span>
          )}
        <small>{t('contextDurable')}</small>
      </section>
    </div>
  )
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
