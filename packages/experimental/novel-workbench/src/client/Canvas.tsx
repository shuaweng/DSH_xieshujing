/** Typed Asset canvas, Context Commit Barrier, and optional reader presentation. */

import { useEffect, useRef, useState } from 'react'
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
import type { NovelReaderFont, NovelReaderSkin, createNovelWorkbenchStore } from './store.ts'
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

const SKINS: readonly NovelReaderSkin[] = ['paper', 'warm', 'green', 'rose', 'blue', 'night']

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
        title: state.titleDraft ?? state.document.title,
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
  const title = state.titleDraft ?? state.document.title
  const characterCount = reader?.countCharacters(state.draft)
  return (
    <div className={css.editorShell} data-reader-shell={reader === undefined ? undefined : ''}>
      <header className={css.editorHeader} data-novel-chrome="header">
        <nav className={css.breadcrumb} aria-label={t('location')}>
          <strong>{state.project?.title ?? t('studio')}</strong>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
        </nav>
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
      <div
        className={css.editorStage}
        data-reader={reader === undefined ? undefined : ''}
        data-reader-skin={reader === undefined ? undefined : state.readerSkin}
        data-reader-font={reader === undefined ? undefined : state.readerFont}
        style={reader === undefined ? undefined : { '--novel-reader-size': `${state.readerFontSize}px` } as CSSProperties}
      >
        {reader === undefined
          ? renderer.renderEditor({
            document: state.document,
            content: state.draft,
            ariaLabel: `${title} · ${t('editor')}`,
            onContentChange: actions.edit,
            onSelectionChange: actions.select,
          })
          : (
            <>
              <div className={css.editorScroll}>
                <article className={css.editorPaper}>
                  <header className={css.documentTitle}>
                    <input
                      className={css.documentTitleInput}
                      aria-label={t('chapterTitle')}
                      value={title}
                      onChange={(event) => { actions.editTitle(event.target.value) }}
                    />
                  </header>
                  {renderer.renderEditor({
                    document: state.document,
                    content: state.draft,
                    ariaLabel: `${title} · ${t('editor')}`,
                    onContentChange: actions.edit,
                    onSelectionChange: actions.select,
                  })}
                </article>
              </div>
            </>
          )}
      </div>
      {reader !== undefined && (
        <ReaderControls
          activeSkin={state.readerSkin}
          activeFont={state.readerFont}
          fontSize={state.readerFontSize}
          characterCount={characterCount ?? 0}
          setSkin={actions.setReaderSkin}
          setFont={actions.setReaderFont}
          setFontSize={actions.setReaderFontSize}
          t={t}
        />
      )}
    </div>
  )
}

interface ReaderControlsProps {
  readonly activeSkin: NovelReaderSkin
  readonly activeFont: NovelReaderFont
  readonly fontSize: number
  readonly characterCount: number
  readonly setSkin: (skin: NovelReaderSkin) => void
  readonly setFont: (font: NovelReaderFont) => void
  readonly setFontSize: (size: number) => void
  readonly t: CanvasProps['t']
}

/** Compact reader dock: human-facing skins and typography stay out of the model contract. */
function ReaderControls({ activeSkin, activeFont, fontSize, characterCount, setSkin, setFont, setFontSize, t }: ReaderControlsProps) {
  const [panel, setPanel] = useState<'skin' | 'font'>()
  const root = useRef<HTMLElement>(null)

  useEffect(() => {
    if (panel === undefined) return undefined
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPanel(undefined)
    }
    const dismissKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(undefined) }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', dismissKey)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', dismissKey)
    }
  }, [panel])

  return (
    <footer
      className={css.readerStatusBar}
      ref={root}
      aria-label={t('readerSettings')}
      data-novel-chrome="status"
    >
      <div className={css.readerStats}>
        <span>{t('chapterCharacters')}：<strong>{characterCount.toLocaleString()}</strong></span>
      </div>
      {panel === 'skin' && (
        <section className={css.readerPopover} role="dialog" aria-label={t('chooseSkin')}>
          <strong>{t('chooseSkin')}</strong>
          <div className={css.skinGrid}>
            {SKINS.map(skin => (
              <button
                key={skin}
                type="button"
                className={css.skinChoice}
                data-skin={skin}
                aria-label={t(skin)}
                aria-pressed={activeSkin === skin}
                onClick={() => { setSkin(skin) }}
              >
                <span className={css.skinPreview} aria-hidden="true" />
                <small>{t(skin)}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {panel === 'font' && (
        <section className={css.readerPopover} role="dialog" aria-label={t('typography')}>
          <strong>{t('typography')}</strong>
          <div className={css.fontChoices} role="group" aria-label={t('font')}>
            {(['song', 'kai', 'sans'] as const).map(font => (
              <button
                key={font}
                type="button"
                data-font={font}
                aria-pressed={activeFont === font}
                onClick={() => { setFont(font) }}
              >{t(font === 'song' ? 'fontSong' : font === 'kai' ? 'fontKai' : 'fontSans')}</button>
            ))}
          </div>
          <div className={css.fontSizeControl} aria-label={t('fontSize')}>
            <button type="button" aria-label={t('decreaseFont')} onClick={() => { setFontSize(fontSize - 1) }}>−</button>
            <output>{fontSize}px</output>
            <button type="button" aria-label={t('increaseFont')} onClick={() => { setFontSize(fontSize + 1) }}>＋</button>
          </div>
        </section>
      )}
      <div className={css.readerDock}>
        <button
          type="button"
          className={css.skinTrigger}
          data-skin={activeSkin}
          aria-label={t('skinSettings')}
          aria-expanded={panel === 'skin'}
          onClick={() => { setPanel(current => current === 'skin' ? undefined : 'skin') }}
        ><span aria-hidden="true" /></button>
        <span className={css.dockDivider} aria-hidden="true" />
        <button
          type="button"
          className={css.fontTrigger}
          aria-label={t('typography')}
          aria-expanded={panel === 'font'}
          onClick={() => { setPanel(current => current === 'font' ? undefined : 'font') }}
        >A</button>
      </div>
    </footer>
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
