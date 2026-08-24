/** Typed Asset canvas, Context Commit Barrier, reader presentation, and chapter-plan drawer. */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CaptureNovelSelectionRequest,
  CreateNovelAssetRequest,
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelSelectionDescriptor,
  SaveNovelAssetRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelAssetRendererRegistry } from './renderers.tsx'
import type { NovelReaderFont, NovelReaderSkin, createNovelWorkbenchStore } from './store.ts'
import css from './workbench.module.css'

export interface CanvasInjected {
  renderers: NovelAssetRendererRegistry
  open: (sessionId: SessionId, assetId: string) => Promise<NovelAssetDocument>
  create: (sessionId: SessionId, request: CreateNovelAssetRequest) => Promise<NovelAssetDocument>
  save: (sessionId: SessionId, request: SaveNovelAssetRequest) => Promise<NovelAssetDocument>
  capture: (sessionId: SessionId, request: CaptureNovelSelectionRequest) => Promise<NovelSelectionDescriptor>
  appendReference: (sessionId: SessionId, reference: NovelSelectionDescriptor, label: string) => void
}

type CanvasProps = PropsRuntime<'novel.canvas'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<CanvasInjected>

const SKINS: readonly NovelReaderSkin[] = ['paper', 'warm', 'green', 'rose', 'blue', 'night']
const CHAPTER_OUTLINE_TEMPLATE = `# 本章核心事件

只写清楚本章要推进的一件核心事件。

## 情绪目标

例如：爽感、危机感、悬念感。

## 场面钥匙

记录最核心的镜头或关键对话。

## 钩子分布

- 章首信息钩子：
- 章中情绪钩子：
- 章末行动钩子：
- 章末信息钩子：

## 节奏

可参考 15% 铺垫 → 35% 上升 → 35% 峰值 → 15% 回落与钩子。

## 起承转合

- 起：
- 承：
- 转：
- 合：

## 前后呼应与连续性

记录承接上一章、影响下一章以及不能遗忘的设定。`

/** One exact-revision typed Asset editor with an optional chapter-local planning surface. */
export function Canvas({ useSessions, useStore, actions, renderers, open, create, save, capture, appendReference, t }: CanvasProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const state = useStore(value => value)
  const [busy, setBusy] = useState(false)
  const [chapterOutlineOpen, setChapterOutlineOpen] = useState(false)

  useEffect(() => {
    if (state.document?.type !== 'manuscript.chapter') setChapterOutlineOpen(false)
  }, [state.document?.id, state.document?.type])

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
    } finally { setBusy(false) }
  }

  const referenceSelection = async () => {
    if (sessionId === undefined || state.document === undefined || state.selection === undefined) return
    setBusy(true)
    try {
      const document = await persist()
      if (document === undefined) return
      const reference = await capture(sessionId, {
        assetId: document.id, revisionId: document.revisionId, selector: state.selection,
      })
      appendReference(sessionId, reference, shortReferenceLabel(reference.preview ?? document.title))
    } catch (error: unknown) { actions.fail(errorMessage(error)) }
    finally { setBusy(false) }
  }

  if (state.document === undefined || state.draft === undefined) {
    return <div className={css.empty}>{state.error ?? t('noChapter')}</div>
  }
  let renderer
  try { renderer = renderers.get(state.document.type) }
  catch (error: unknown) { return <div className={css.empty}>{errorMessage(error)}</div> }
  const reader = renderer.reader
  const title = state.titleDraft ?? state.document.title
  const editorLabel = renderer.editorLabel?.() ?? t('editor')
  const characterCount = reader?.countCharacters(state.draft)
  return <div className={css.editorShell} data-reader-shell={reader === undefined ? undefined : ''}>
    <header className={css.editorHeader} data-novel-chrome="header">
      <nav className={css.breadcrumb} aria-label={t('location')}>
        <strong>{state.project?.title ?? t('studio')}</strong><span aria-hidden="true">/</span><span>{title}</span>
      </nav>
      <div className={css.editorActions}>
        {state.error === undefined ? <span>{busy ? t('saving') : state.dirty ? '' : t('saved')}</span>
          : <span className={css.error} role="alert">{state.error}</span>}
        <button type="button" disabled={!state.dirty || busy} onClick={() => { void persist() }}>{t('save')}</button>
        <button type="button" disabled={state.selection === undefined || busy} onClick={() => { void referenceSelection() }}>{t('reference')}</button>
      </div>
    </header>
    <div
      className={css.editorStage}
      data-reader={reader === undefined ? undefined : ''}
      data-reader-skin={reader === undefined ? undefined : state.readerSkin}
      data-reader-font={reader === undefined ? undefined : state.readerFont}
      style={reader === undefined ? undefined : { '--novel-reader-size': `${state.readerFontSize}px` } as CSSProperties}
    >
      {reader === undefined ? renderer.renderEditor({
        document: state.document, content: state.draft, title, ariaLabel: `${title} · ${editorLabel}`,
        onContentChange: actions.edit, onTitleChange: actions.editTitle, onSelectionChange: actions.select,
      }) : <div className={css.editorScroll}>
        <article className={css.editorPaper}>
          <header className={css.documentTitle}><input className={css.documentTitleInput} aria-label={t('chapterTitle')}
            value={title} onChange={(event) => { actions.editTitle(event.target.value) }} /></header>
          {renderer.renderEditor({
            document: state.document, content: state.draft, title, ariaLabel: `${title} · ${editorLabel}`,
            onContentChange: actions.edit, onTitleChange: actions.editTitle, onSelectionChange: actions.select,
          })}
        </article>
      </div>}
    </div>
    {reader !== undefined && <ReaderControls
      activeSkin={state.readerSkin} activeFont={state.readerFont} fontSize={state.readerFontSize}
      characterCount={characterCount ?? 0} chapterOutlineOpen={chapterOutlineOpen}
      openChapterOutline={() => { setChapterOutlineOpen(true) }}
      setSkin={actions.setReaderSkin} setFont={actions.setReaderFont} setFontSize={actions.setReaderFontSize} t={t}
    />}
    {reader !== undefined && chapterOutlineOpen && sessionId !== undefined && <ChapterOutlineDrawer
      key={state.document.id}
      sessionId={sessionId}
      chapter={state.document}
      chapterTitle={title}
      assets={state.assets}
      open={open}
      create={create}
      save={save}
      capture={capture}
      appendReference={appendReference}
      onCreated={actions.assetCreated}
      close={() => { setChapterOutlineOpen(false) }}
      t={t}
    />}
  </div>
}

function ChapterOutlineDrawer({
  sessionId, chapter, chapterTitle, assets, open, create, save, capture, appendReference, onCreated, close, t,
}: {
  readonly sessionId: SessionId
  readonly chapter: NovelAssetDocument
  readonly chapterTitle: string
  readonly assets: readonly NovelAssetDescriptor[]
  readonly open: CanvasInjected['open']
  readonly create: CanvasInjected['create']
  readonly save: CanvasInjected['save']
  readonly capture: CanvasInjected['capture']
  readonly appendReference: CanvasInjected['appendReference']
  readonly onCreated: (document: NovelAssetDocument) => void
  readonly close: () => void
  readonly t: CanvasProps['t']
}) {
  const descriptor = assets.find(asset => asset.type === 'planning.chapter-outline' && asset.parentId === chapter.id)
  const [document, setDocument] = useState<NovelAssetDocument>()
  const [body, setBody] = useState('')
  const [selection, setSelection] = useState<{ kind: 'text-range'; startUtf16: number; endUtf16: number }>()
  const [busy, setBusy] = useState(descriptor !== undefined)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (descriptor === undefined) { setBusy(false); return }
    let live = true
    setBusy(true)
    void open(sessionId, descriptor.id).then((value) => {
      if (!live) return
      const content = chapterOutlineBody(value)
      setDocument(value)
      setBody(content)
      setBusy(false)
    }).catch((cause: unknown) => { if (live) { setError(errorMessage(cause)); setBusy(false) } })
    return () => { live = false }
  }, [descriptor?.id, open, sessionId])

  const persist = async (): Promise<NovelAssetDocument | undefined> => {
    setBusy(true); setError(undefined)
    try {
      const next = document === undefined
        ? await create(sessionId, {
          type: 'planning.chapter-outline',
          title: `${chapterTitle} · ${t('chapterOutline')}`,
          parentId: chapter.id,
          content: { kind: 'chapter-outline', body },
        })
        : await save(sessionId, {
          assetId: document.id,
          baseRevisionId: document.revisionId,
          title: document.title,
          content: { kind: 'chapter-outline', body },
        })
      setDocument(next)
      onCreated(next)
      return next
    } catch (cause: unknown) { setError(errorMessage(cause)); return undefined }
    finally { setBusy(false) }
  }
  const reference = async () => {
    if (selection === undefined) return
    const current = await persist()
    if (current === undefined) return
    try {
      const frozen = await capture(sessionId, { assetId: current.id, revisionId: current.revisionId, selector: selection })
      appendReference(sessionId, frozen, shortReferenceLabel(frozen.preview ?? current.title))
    } catch (cause: unknown) { setError(errorMessage(cause)) }
  }

  return <div className={css.chapterOutlineBackdrop} onMouseDown={close}>
    <aside className={css.chapterOutlineDrawer} role="dialog" aria-modal="true" aria-label={t('chapterOutline')}
      onMouseDown={(event) => { event.stopPropagation() }}>
      <header className={css.chapterOutlineHeader}>
        <strong>{t('chapterOutline')}</strong>
        <div>
          <button type="button" disabled={selection === undefined || busy} onClick={() => { void reference() }}>{t('reference')}</button>
          <button type="button" disabled={busy} onClick={() => { void persist() }}>{busy ? t('saving') : t('save')}</button>
          <button type="button" onClick={close}>{t('collapseChapterOutline')} ›</button>
        </div>
      </header>
      {error !== undefined && <p className={css.chapterOutlineError} role="alert">{error}</p>}
      {body.trim() === '' && <button className={css.chapterOutlineTemplate} type="button"
        onClick={() => { setBody(CHAPTER_OUTLINE_TEMPLATE) }}>＋ {t('insertChapterOutlineTemplate')}</button>}
      <textarea
        className={css.chapterOutlineEditor}
        aria-label={t('chapterOutlineBody')}
        value={body}
        placeholder={t('chapterOutlinePlaceholder')}
        onChange={(event) => { setBody(event.target.value) }}
        onSelect={(event) => {
          const startUtf16 = event.currentTarget.selectionStart
          const endUtf16 = event.currentTarget.selectionEnd
          setSelection(endUtf16 <= startUtf16 ? undefined : { kind: 'text-range', startUtf16, endUtf16 })
        }}
      />
      <footer>
        <span>{Array.from(body.replace(/\s/gu, '')).length.toLocaleString()} {t('characters')}</span>
      </footer>
    </aside>
  </div>
}

function ReaderControls({
  activeSkin, activeFont, fontSize, characterCount, chapterOutlineOpen,
  openChapterOutline, setSkin, setFont, setFontSize, t,
}: {
  readonly activeSkin: NovelReaderSkin
  readonly activeFont: NovelReaderFont
  readonly fontSize: number
  readonly characterCount: number
  readonly chapterOutlineOpen: boolean
  readonly openChapterOutline: () => void
  readonly setSkin: (skin: NovelReaderSkin) => void
  readonly setFont: (font: NovelReaderFont) => void
  readonly setFontSize: (size: number) => void
  readonly t: CanvasProps['t']
}) {
  const [panel, setPanel] = useState<'skin' | 'font'>()
  const root = useRef<HTMLElement>(null)
  useEffect(() => {
    if (panel === undefined) return undefined
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setPanel(undefined)
    }
    const dismissKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPanel(undefined) }
    document.addEventListener('pointerdown', dismiss); document.addEventListener('keydown', dismissKey)
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', dismissKey) }
  }, [panel])
  return <footer className={css.readerStatusBar} ref={root} aria-label={t('readerSettings')} data-novel-chrome="status">
    <div className={css.readerStats}><span>{t('chapterCharacters')}：<strong>{characterCount.toLocaleString()}</strong></span></div>
    {panel === 'skin' && <section className={css.readerPopover} role="dialog" aria-label={t('chooseSkin')}>
      <strong>{t('chooseSkin')}</strong><div className={css.skinGrid}>{SKINS.map(skin => <button key={skin} type="button"
        className={css.skinChoice} data-skin={skin} aria-label={t(skin)} aria-pressed={activeSkin === skin}
        onClick={() => { setSkin(skin) }}><span className={css.skinPreview} aria-hidden="true" /><small>{t(skin)}</small></button>)}</div>
    </section>}
    {panel === 'font' && <section className={css.readerPopover} role="dialog" aria-label={t('typography')}>
      <strong>{t('typography')}</strong><div className={css.fontChoices} role="group" aria-label={t('font')}>
        {(['song', 'kai', 'sans'] as const).map(font => <button key={font} type="button" data-font={font}
          aria-pressed={activeFont === font} onClick={() => { setFont(font) }}>{t(font === 'song' ? 'fontSong' : font === 'kai' ? 'fontKai' : 'fontSans')}</button>)}
      </div><div className={css.fontSizeControl} aria-label={t('fontSize')}>
        <button type="button" aria-label={t('decreaseFont')} onClick={() => { setFontSize(fontSize - 1) }}>−</button>
        <output>{fontSize}px</output><button type="button" aria-label={t('increaseFont')} onClick={() => { setFontSize(fontSize + 1) }}>＋</button>
      </div>
    </section>}
    <div className={css.readerDock}>
      <button type="button" className={css.chapterOutlineTrigger} aria-label={t('chapterOutline')}
        aria-expanded={chapterOutlineOpen} onClick={openChapterOutline}><ChapterOutlineIcon /></button>
      <span className={css.dockDivider} aria-hidden="true" />
      <button type="button" className={css.skinTrigger} data-skin={activeSkin} aria-label={t('skinSettings')}
        aria-expanded={panel === 'skin'} onClick={() => { setPanel(current => current === 'skin' ? undefined : 'skin') }}><span aria-hidden="true" /></button>
      <span className={css.dockDivider} aria-hidden="true" />
      <button type="button" className={css.fontTrigger} aria-label={t('typography')} aria-expanded={panel === 'font'}
        onClick={() => { setPanel(current => current === 'font' ? undefined : 'font') }}>A</button>
    </div>
  </footer>
}

function ChapterOutlineIcon() {
  return <svg viewBox="0 0 1024 1024" aria-hidden="true"><path fill="currentColor" d="M550.357333 588.8h-153.6a38.4 38.4 0 1 0 0 76.8h153.6a38.4 38.4 0 1 0 0-76.8z m153.6-384h-45.312A115.2 115.2 0 0 0 550.357333 128h-76.8A115.2 115.2 0 0 0 365.226667 204.8H319.957333a115.2 115.2 0 0 0-115.2 115.2v460.8a115.2 115.2 0 0 0 115.2 115.2h384a115.2 115.2 0 0 0 115.2-115.2V320a115.2 115.2 0 0 0-115.2-115.2z m-268.8 38.4a38.4 38.4 0 0 1 38.4-38.4h76.8a38.4 38.4 0 0 1 38.4 38.4v38.4h-153.6v-38.4z m307.2 537.6a38.4 38.4 0 0 1-38.4 38.4h-384a38.4 38.4 0 0 1-38.4-38.4V320a38.4 38.4 0 0 1 38.4-38.4h38.4v38.4a38.4 38.4 0 0 0 38.4 38.4h230.4a38.4 38.4 0 0 0 38.4-38.4v-38.4h38.4a38.4 38.4 0 0 1 38.4 38.4v460.8z m-115.2-345.6h-230.4a38.4 38.4 0 1 0 0 76.8h230.4a38.4 38.4 0 1 0 0-76.8z" /></svg>
}

function chapterOutlineBody(document: NovelAssetDocument): string {
  const content = document.content
  if (typeof content !== 'object' || content === null || Array.isArray(content)
    || content['kind'] !== 'chapter-outline' || typeof content['body'] !== 'string') {
    throw new Error('novel workbench: chapter-outline document has incompatible content')
  }
  return content['body']
}

/** Human-facing reference label; the Composer occurrence retains the full model reference separately. */
export function shortReferenceLabel(preview: string): string {
  const characters = Array.from(preview.replace(/\s+/gu, ' ').trim())
  const visible = characters.slice(0, 10).join('')
  return `[${visible}${characters.length > 10 ? '…' : ''}]`
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
