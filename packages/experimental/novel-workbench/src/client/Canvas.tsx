/** Typed Asset canvas, Context Commit Barrier, reader presentation, and chapter-plan drawer. */

import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CaptureNovelSelectionRequest,
  CreateNovelAssetRequest,
  NovelAnalysisReportDescriptor,
  NovelPreferenceCandidateDescriptor,
  NovelStoryStateCandidateDescriptor,
  NovelRevisionFinalizationDescriptor,
  FinalizeNovelChapterDescriptor,
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelAssetRevisionDescriptor,
  NovelSelectionDescriptor,
  NovelProjectDescriptor,
  NovelSkillSettingsDescriptor,
  ReplaceNovelSkillSettingsRequest,
  RestoreNovelAssetDescriptor,
  RestoreNovelAssetRequest,
  SaveNovelAssetRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelAssetRendererDefinition, NovelAssetRendererRegistry } from './renderers.tsx'
import type { NovelReaderFont, NovelReaderSkin, createNovelWorkbenchStore } from './store.ts'
import type { NovelContextFocus, NovelProjectStatusFocus } from './context-controller.ts'
import { NovelHome, type NovelHomeInjected } from './Home.tsx'
import { NovelWorkbenchViewController, useNovelWorkbenchView } from './view-controller.ts'
import css from './workbench.module.css'

const fallbackWorkbench = new NovelWorkbenchViewController('book')

export interface CanvasInjected {
  workbench?: NovelWorkbenchViewController
  inspectLibrary?: NovelHomeInjected['inspectLibrary']
  openLibraryBook?: NovelHomeInjected['openBook']
  renderers: NovelAssetRendererRegistry
  initialize: (sessionId: SessionId, title: string) => Promise<NovelProjectDescriptor>
  open: (sessionId: SessionId, assetId: string, revisionId?: string) => Promise<NovelAssetDocument>
  revisions: (sessionId: SessionId, assetId: string) => Promise<readonly NovelAssetRevisionDescriptor[]>
  restore: (sessionId: SessionId, request: RestoreNovelAssetRequest) => Promise<RestoreNovelAssetDescriptor>
  analysisReports: (
    sessionId: SessionId,
    assetId: string,
    revisionId: string,
  ) => Promise<readonly NovelAnalysisReportDescriptor[]>
  scanNoAi: (sessionId: SessionId, assetId: string, revisionId: string) => Promise<NovelAnalysisReportDescriptor>
  reviewChapter: (sessionId: SessionId, assetId: string, revisionId: string) => Promise<NovelAnalysisReportDescriptor>
  skills: (sessionId: SessionId) => Promise<NovelSkillSettingsDescriptor>
  replaceSkillSettings: (
    sessionId: SessionId,
    request: ReplaceNovelSkillSettingsRequest,
  ) => Promise<NovelSkillSettingsDescriptor>
  finalizations: (sessionId: SessionId, assetId: string) => Promise<readonly NovelRevisionFinalizationDescriptor[]>
  preferenceCandidates: (
    sessionId: SessionId, assetId: string, revisionId: string,
  ) => Promise<readonly NovelPreferenceCandidateDescriptor[]>
  storyStateCandidates: (
    sessionId: SessionId, assetId: string, revisionId: string,
  ) => Promise<readonly NovelStoryStateCandidateDescriptor[]>
  finalizeChapter: (sessionId: SessionId, assetId: string, revisionId: string) => Promise<FinalizeNovelChapterDescriptor>
  acceptPreference: (sessionId: SessionId, candidateId: string) => Promise<NovelPreferenceCandidateDescriptor>
  rejectPreference: (sessionId: SessionId, candidateId: string) => Promise<NovelPreferenceCandidateDescriptor>
  acceptStoryState: (sessionId: SessionId, candidateId: string) => Promise<NovelStoryStateCandidateDescriptor>
  rejectStoryState: (sessionId: SessionId, candidateId: string) => Promise<NovelStoryStateCandidateDescriptor>
  create: (sessionId: SessionId, request: CreateNovelAssetRequest) => Promise<NovelAssetDocument>
  save: (sessionId: SessionId, request: SaveNovelAssetRequest) => Promise<NovelAssetDocument>
  capture: (sessionId: SessionId, request: CaptureNovelSelectionRequest) => Promise<NovelSelectionDescriptor>
  appendReference: (sessionId: SessionId, reference: NovelSelectionDescriptor, label: string) => void
  reportContextFocus?: (value?: NovelContextFocus) => void
  reportProjectStatus?: (value?: NovelProjectStatusFocus) => void
}

type CanvasProps = PropsRuntime<'novel.canvas'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<CanvasInjected>

const SKINS: readonly NovelReaderSkin[] = ['paper', 'warm', 'green', 'rose', 'blue', 'night']
const ignoreContextFocus = (): void => {}
const ignoreProjectStatus = (): void => {}
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
export function Canvas({
  useSessions, useWorkspaces, useStore, actions, workbench = fallbackWorkbench,
  inspectLibrary, openLibraryBook,
  renderers, initialize, open, revisions, restore, analysisReports, scanNoAi, reviewChapter,
  finalizations, preferenceCandidates, storyStateCandidates, finalizeChapter, acceptPreference, rejectPreference,
  acceptStoryState, rejectStoryState,
  create, save, capture, appendReference, skills, replaceSkillSettings,
  reportContextFocus = ignoreContextFocus, reportProjectStatus = ignoreProjectStatus, t,
}: CanvasProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const page = useNovelWorkbenchView(workbench, value => value.page)
  const state = useStore(value => value)
  const [busy, setBusy] = useState(false)
  const [chapterOutlineOpen, setChapterOutlineOpen] = useState(false)
  const [revisionItems, setRevisionItems] = useState<readonly NovelAssetRevisionDescriptor[]>([])
  const [analysisMode, setAnalysisMode] = useState<'chapter-review' | 'noai-scan'>()
  const [reports, setReports] = useState<readonly NovelAnalysisReportDescriptor[]>([])
  const [analysisBusy, setAnalysisBusy] = useState(false)
  const [analysisError, setAnalysisError] = useState<string>()
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [skillSettings, setSkillSettings] = useState<NovelSkillSettingsDescriptor>()
  const [skillsBusy, setSkillsBusy] = useState(false)
  const [skillsError, setSkillsError] = useState<string>()
  const [finalizationItems, setFinalizationItems] = useState<readonly NovelRevisionFinalizationDescriptor[]>([])
  const [preferenceCandidate, setPreferenceCandidate] = useState<NovelPreferenceCandidateDescriptor>()
  const [storyCandidate, setStoryCandidate] = useState<NovelStoryStateCandidateDescriptor>()
  const [preferenceOpen, setPreferenceOpen] = useState(false)
  const [preferenceBusy, setPreferenceBusy] = useState(false)
  const [preferenceError, setPreferenceError] = useState<string>()
  const [preferenceNotice, setPreferenceNotice] = useState<string>()
  const [storyNotice, setStoryNotice] = useState<string>()
  const [restorePreview, setRestorePreview] = useState<{
    readonly current: NovelAssetDocument
    readonly historical: NovelAssetDocument
  }>()
  const [restoreNotice, setRestoreNotice] = useState<string>()
  const [statusHost, setStatusHost] = useState<Element | null>(null)
  const analysisEpoch = useRef(0)

  useEffect(() => { setStatusHost(document.querySelector('[data-novel-status-host]')) }, [])

  useEffect(() => {
    reportProjectStatus(sessionId === undefined ? undefined : { sessionId, status: state.projectStatus })
  }, [reportProjectStatus, sessionId, state.projectStatus])
  useEffect(() => () => { reportProjectStatus(undefined) }, [reportProjectStatus])

  useEffect(() => {
    if (sessionId === undefined || state.project === undefined || state.document === undefined) {
      reportContextFocus(undefined)
      return
    }
    reportContextFocus({
      sessionId,
      project: state.project,
      document: state.document,
      dirty: state.dirty,
    })
  }, [reportContextFocus, sessionId, state.dirty, state.document, state.project])
  useEffect(() => () => { reportContextFocus(undefined) }, [reportContextFocus])

  useEffect(() => {
    if (state.document?.type !== 'manuscript.chapter') setChapterOutlineOpen(false)
  }, [state.document?.id, state.document?.type])

  useEffect(() => {
    setPreferenceOpen(false)
    setPreferenceCandidate(undefined)
    setStoryCandidate(undefined)
    setPreferenceError(undefined)
    setPreferenceNotice(undefined)
    setStoryNotice(undefined)
  }, [state.document?.id, state.document?.revisionId])

  useEffect(() => {
    setRestorePreview(undefined)
    setRestoreNotice(undefined)
  }, [state.document?.id])

  useEffect(() => {
    if (!skillsOpen || sessionId === undefined) return
    let live = true
    setSkillsBusy(true)
    setSkillsError(undefined)
    void skills(sessionId).then((value) => {
      if (live) setSkillSettings(value)
    }).catch((cause: unknown) => {
      if (live) setSkillsError(errorMessage(cause))
    }).finally(() => { if (live) setSkillsBusy(false) })
    return () => { live = false }
  }, [sessionId, skills, skillsOpen])

  useEffect(() => {
    if (sessionId === undefined || state.document === undefined) { setRevisionItems([]); return }
    let live = true
    void revisions(sessionId, state.document.id).then((items) => {
      if (live) setRevisionItems(items)
    }).catch((cause: unknown) => { if (live) actions.fail(errorMessage(cause)) })
    return () => { live = false }
  }, [actions, revisions, sessionId, state.document?.id, state.document?.revisionId])

  useEffect(() => {
    if (sessionId === undefined || state.document?.type !== 'manuscript.chapter') {
      setFinalizationItems([]); setPreferenceCandidate(undefined); setStoryCandidate(undefined); return
    }
    let live = true
    void Promise.all([
      finalizations(sessionId, state.document.id),
      preferenceCandidates(sessionId, state.document.id, state.document.revisionId),
      storyStateCandidates(sessionId, state.document.id, state.document.revisionId),
    ]).then(([finalized, candidates, storyCandidates]) => {
      if (!live) return
      setFinalizationItems(finalized)
      setPreferenceCandidate(candidates[0])
      setStoryCandidate(storyCandidates[0])
    }).catch((cause: unknown) => { if (live) setPreferenceError(errorMessage(cause)) })
    return () => { live = false }
  }, [finalizations, preferenceCandidates, storyStateCandidates, sessionId,
    state.document?.id, state.document?.revisionId, state.document?.type])

  useEffect(() => {
    if (analysisMode === undefined || sessionId === undefined || state.document === undefined) return
    const epoch = ++analysisEpoch.current
    let live = true
    void analysisReports(sessionId, state.document.id, state.document.revisionId).then((items) => {
      if (live && analysisEpoch.current === epoch) setReports(items)
    }).catch((cause: unknown) => {
      if (live && analysisEpoch.current === epoch) setAnalysisError(errorMessage(cause))
    })
    return () => { live = false }
  }, [analysisMode, analysisReports, sessionId, state.document?.id, state.document?.revisionId])

  const currentRevisionId = state.assets.find(asset => asset.id === state.document?.id)?.revisionId
  const historical = state.document !== undefined
    && currentRevisionId !== undefined
    && currentRevisionId !== state.document.revisionId

  const persist = async (): Promise<NovelAssetDocument | undefined> => {
    if (sessionId === undefined || state.document === undefined || state.draft === undefined) return undefined
    if (!state.dirty) return state.document
    if (historical) { actions.fail(t('historicalReadOnly')); return undefined }
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

  const openRevision = async (revisionId: string) => {
    if (sessionId === undefined || state.document === undefined || busy) return
    const current = await persist()
    if (current === undefined) return
    setBusy(true)
    try {
      const selected = await open(sessionId, current.id, revisionId === currentRevisionId ? undefined : revisionId)
      actions.open(selected)
      setAnalysisMode(undefined)
      setReports([])
      setAnalysisError(undefined)
    } catch (cause: unknown) { actions.fail(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  const previewRestore = async () => {
    if (sessionId === undefined || state.document === undefined || !historical || busy) return
    setBusy(true)
    try {
      const current = await open(sessionId, state.document.id)
      setRestorePreview({ current, historical: state.document })
    } catch (cause: unknown) { actions.fail(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  const confirmRestore = async () => {
    if (sessionId === undefined || restorePreview === undefined || busy) return
    setBusy(true)
    try {
      const result = await restore(sessionId, {
        assetId: restorePreview.current.id,
        baseRevisionId: restorePreview.current.revisionId,
        sourceRevisionId: restorePreview.historical.revisionId,
      })
      actions.saved(result.document)
      setAnalysisMode(undefined)
      setReports([])
      setAnalysisError(undefined)
      setRestorePreview(undefined)
      const effects = [t('restoreComplete')]
      if (result.conflictedChangeSetCount > 0) {
        effects.push(`${t('restoreConflictedChangeSets')} ${result.conflictedChangeSetCount}`)
      }
      if (result.storyStateReviewRecommended) effects.push(t('restoreStoryStateWarning'))
      setRestoreNotice(effects.join(' · '))
    } catch (cause: unknown) { actions.fail(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  const runAnalysis = async (kind: 'chapter-review' | 'noai-scan') => {
    if (sessionId === undefined || state.document === undefined || state.document.type !== 'manuscript.chapter') return
    setAnalysisMode(kind)
    setAnalysisError(undefined)
    setAnalysisBusy(true)
    try {
      const document = await persist()
      if (document === undefined) return
      const report = kind === 'noai-scan'
        ? await scanNoAi(sessionId, document.id, document.revisionId)
        : await reviewChapter(sessionId, document.id, document.revisionId)
      analysisEpoch.current += 1
      setReports(previous => [...previous.filter(item => item.kind !== kind), report])
    } catch (cause: unknown) { setAnalysisError(errorMessage(cause)) }
    finally { setAnalysisBusy(false) }
  }

  const openChapterReview = () => {
    if (sessionId === undefined || state.document === undefined || state.document.type !== 'manuscript.chapter') return
    setAnalysisMode('chapter-review')
    setAnalysisError(undefined)
  }

  const openSkills = () => {
    setChapterOutlineOpen(false)
    setAnalysisMode(undefined)
    setPreferenceOpen(false)
    setSkillsOpen(true)
  }

  const toggleSkill = async (name: string) => {
    if (sessionId === undefined || skillSettings === undefined || skillsBusy) return
    const target = skillSettings.skills.find(skill => skill.name === name)
    if (target === undefined) return
    const disabled = skillSettings.skills
      .filter(skill => skill.name === name ? skill.enabled : !skill.enabled)
      .map(skill => skill.name)
    setSkillsBusy(true)
    setSkillsError(undefined)
    try {
      setSkillSettings(await replaceSkillSettings(sessionId, { disabled }))
    } catch (cause: unknown) { setSkillsError(errorMessage(cause)) }
    finally { setSkillsBusy(false) }
  }

  const markFinal = async () => {
    if (sessionId === undefined || state.document?.type !== 'manuscript.chapter') return
    setPreferenceBusy(true)
    setPreferenceError(undefined)
    setPreferenceNotice(undefined)
    setStoryNotice(undefined)
    try {
      const document = await persist()
      if (document === undefined) return
      const result = await finalizeChapter(sessionId, document.id, document.revisionId)
      setFinalizationItems(previous => previous.some(item => item.revisionId === result.finalization.revisionId)
        ? previous : [result.finalization, ...previous])
      setPreferenceCandidate(result.candidate)
      setStoryCandidate(result.storyCandidate)
      setPreferenceNotice(result.noCandidateReason === undefined ? undefined : t(
        result.noCandidateReason === 'no-agent-source' ? 'preferenceNoAgentSource'
          : result.noCandidateReason === 'no-author-diff' ? 'preferenceNoAuthorDiff'
            : 'preferenceMissingStyle',
      ))
      setStoryNotice(result.storyCandidateError !== undefined
        ? t('storyStateExtractionFailed')
        : result.noStoryCandidateReason === undefined ? undefined : t('storyStateMissing'))
      setPreferenceOpen(true)
    } catch (cause: unknown) { setPreferenceError(errorMessage(cause)); setPreferenceOpen(true) }
    finally { setPreferenceBusy(false) }
  }

  const decidePreference = async (decision: 'accept' | 'reject') => {
    if (sessionId === undefined || preferenceCandidate === undefined) return
    setPreferenceBusy(true)
    setPreferenceError(undefined)
    try {
      const next = decision === 'accept'
        ? await acceptPreference(sessionId, preferenceCandidate.id)
        : await rejectPreference(sessionId, preferenceCandidate.id)
      setPreferenceCandidate(next)
      if (decision === 'accept') actions.refresh()
    } catch (cause: unknown) { setPreferenceError(errorMessage(cause)) }
    finally { setPreferenceBusy(false) }
  }

  const decideStoryState = async (decision: 'accept' | 'reject') => {
    if (sessionId === undefined || storyCandidate === undefined) return
    setPreferenceBusy(true)
    setPreferenceError(undefined)
    try {
      const next = decision === 'accept'
        ? await acceptStoryState(sessionId, storyCandidate.id)
        : await rejectStoryState(sessionId, storyCandidate.id)
      setStoryCandidate(next)
      if (decision === 'accept') actions.refresh()
    } catch (cause: unknown) { setPreferenceError(errorMessage(cause)) }
    finally { setPreferenceBusy(false) }
  }

  if (state.projectStatus === 'uninitialized') {
    return <ProjectBootstrap
      sessionId={sessionId}
      initialize={initialize}
      onInitialized={(project) => { actions.loaded(project, []); actions.refresh() }}
      fail={actions.fail}
      t={t}
    />
  }
  if (page === 'home' && inspectLibrary !== undefined && openLibraryBook !== undefined) {
    return <NovelHome useSessions={useSessions} useWorkspaces={useWorkspaces}
      inspectLibrary={inspectLibrary} openBook={openLibraryBook} t={t} />
  }
  if (state.document === undefined || state.draft === undefined) {
    return <div className={css.empty}>{state.error ?? t('noChapter')}</div>
  }
  let renderer
  try { renderer = renderers.get(state.document.type) }
  catch (error: unknown) { return <div className={css.empty}>{errorMessage(error)}</div> }
  const reader = renderer.reader
  const title = state.titleDraft ?? state.document.title
  const isFinal = finalizationItems.some(item => item.revisionId === state.document?.revisionId)
  const editorLabel = renderer.editorLabel?.() ?? t('editor')
  const characterCount = reader?.countCharacters(state.draft)
  const controls = <ReaderControls
    activeSkin={state.readerSkin} activeFont={state.readerFont} fontSize={state.readerFontSize}
    characterCount={characterCount} chapterOutlineAvailable={state.document.type === 'manuscript.chapter'}
    chapterOutlineOpen={chapterOutlineOpen}
    analysisMode={analysisMode} analysisBusy={analysisBusy}
    skillsOpen={skillsOpen} skillsBusy={skillsBusy}
    openChapterOutline={() => { setChapterOutlineOpen(true) }}
    runNoAi={() => { void runAnalysis('noai-scan') }}
    runReview={() => { openChapterReview() }}
    openSkills={openSkills}
    setSkin={actions.setReaderSkin} setFont={actions.setReaderFont} setFontSize={actions.setReaderFontSize} t={t}
  />
  return <div className={css.editorShell} data-reader-shell="">
    <header className={css.editorHeader} data-novel-chrome="header">
      <nav className={css.breadcrumb} aria-label={t('location')}>
        <strong>{state.project?.title ?? t('studio')}</strong><span aria-hidden="true">/</span><span>{title}</span>
        {revisionItems.length > 0 && <select className={css.revisionSelect} aria-label={t('revisionHistory')}
          value={state.document.revisionId} disabled={busy}
          onChange={(event) => { void openRevision(event.target.value) }}>
          {revisionItems.map((revision, index) => <option key={revision.id} value={revision.id}>
            {revisionLabel(revision, index === 0, t)}
          </option>)}
        </select>}
        {historical && <span className={css.historicalBadge}>{t('historicalReadOnly')}</span>}
        {isFinal && <span className={css.finalBadge}>{t('finalized')}</span>}
      </nav>
      <div className={css.editorActions}>
        {state.error === undefined ? <span>{busy ? t('saving') : state.dirty ? '' : t('saved')}</span>
          : <span className={css.error} role="alert">{state.error}</span>}
        <button type="button" disabled={!state.dirty || busy || historical} onClick={() => { void persist() }}>{t('save')}</button>
        {historical && <button type="button" className={css.restoreButton} disabled={busy}
          onClick={() => { void previewRestore() }}>{t('restoreRevision')}</button>}
        {state.document.type === 'manuscript.chapter' && <button type="button" disabled={busy || preferenceBusy}
          onClick={() => {
            if (isFinal && (preferenceCandidate !== undefined || storyCandidate !== undefined
              || preferenceNotice !== undefined || storyNotice !== undefined)) setPreferenceOpen(true)
            else void markFinal()
          }}>
          {isFinal ? t('viewFinalPreference') : t('markFinal')}
        </button>}
        <button type="button" disabled={state.selection === undefined || busy} onClick={() => { void referenceSelection() }}>{t('reference')}</button>
      </div>
    </header>
    <div
      className={css.editorStage}
      data-reader={reader === undefined ? undefined : ''}
      data-reader-skin={state.readerSkin}
      data-reader-font={state.readerFont}
      style={{ '--novel-reader-size': `${state.readerFontSize}px` } as CSSProperties}
    >
      {reader === undefined ? renderer.renderEditor({
        document: state.document, content: state.draft, title, ariaLabel: `${title} · ${editorLabel}`,
        readOnly: historical,
        onContentChange: actions.edit, onTitleChange: actions.editTitle, onSelectionChange: actions.select,
      }) : <div className={css.editorScroll}>
        <article className={css.editorPaper}>
          <header className={css.documentTitle}><input className={css.documentTitleInput} aria-label={t('chapterTitle')}
            value={title} readOnly={historical} onChange={(event) => { actions.editTitle(event.target.value) }} /></header>
          {renderer.renderEditor({
            document: state.document, content: state.draft, title, ariaLabel: `${title} · ${editorLabel}`,
            readOnly: historical,
            onContentChange: actions.edit, onTitleChange: actions.editTitle, onSelectionChange: actions.select,
          })}
        </article>
      </div>}
    </div>
    {statusHost === null ? controls : createPortal(controls, statusHost)}
    {restoreNotice !== undefined && <aside className={css.restoreNotice} role="status">
      <span>{restoreNotice}</span><button type="button" aria-label={t('dismiss')} onClick={() => { setRestoreNotice(undefined) }}>×</button>
    </aside>}
    {restorePreview !== undefined && <RestoreRevisionDialog
      current={restorePreview.current}
      historical={restorePreview.historical}
      renderer={renderer}
      busy={busy}
      cancel={() => { setRestorePreview(undefined) }}
      confirm={() => { void confirmRestore() }}
      t={t}
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
    {analysisMode !== undefined && state.document.type === 'manuscript.chapter' && <AnalysisDrawer
      kind={analysisMode}
      revisionId={state.document.revisionId}
      report={reports.find(item => item.kind === analysisMode)}
      busy={analysisBusy}
      error={analysisError}
      rerun={() => { void runAnalysis(analysisMode) }}
      close={() => { setAnalysisMode(undefined); setAnalysisError(undefined) }}
      t={t}
    />}
    {skillsOpen && <SkillDrawer
      settings={skillSettings}
      busy={skillsBusy}
      error={skillsError}
      toggle={(name) => { void toggleSkill(name) }}
      close={() => { setSkillsOpen(false); setSkillsError(undefined) }}
      t={t}
    />}
    {preferenceOpen && state.document.type === 'manuscript.chapter' && <PreferenceDrawer
      revisionId={state.document.revisionId}
      candidate={preferenceCandidate}
      notice={preferenceNotice}
      storyCandidate={storyCandidate}
      storyNotice={storyNotice}
      busy={preferenceBusy}
      error={preferenceError}
      accept={() => { void decidePreference('accept') }}
      reject={() => { void decidePreference('reject') }}
      acceptStoryState={() => { void decideStoryState('accept') }}
      rejectStoryState={() => { void decideStoryState('reject') }}
      close={() => { setPreferenceOpen(false) }}
      t={t}
    />}
  </div>
}

function RestoreRevisionDialog({ current, historical, renderer, busy, cancel, confirm, t }: {
  readonly current: NovelAssetDocument
  readonly historical: NovelAssetDocument
  readonly renderer: NovelAssetRendererDefinition
  readonly busy: boolean
  readonly cancel: () => void
  readonly confirm: () => void
  readonly t: CanvasProps['t']
}) {
  const noop = (): void => {}
  const currentTitle = current.title
  const historicalTitle = historical.title
  return <div className={css.restoreBackdrop} onMouseDown={cancel}>
    <section className={css.restoreDialog} role="dialog" aria-modal="true" aria-labelledby="novel-restore-title"
      onMouseDown={(event) => { event.stopPropagation() }}>
      <header><div><p>{t('revisionHistory')}</p><h2 id="novel-restore-title">{t('restoreTitle')}</h2></div>
        <button type="button" aria-label={t('dismiss')} onClick={cancel}>×</button></header>
      <p className={css.restoreDescription}>{t('restoreDescription')}</p>
      <div className={css.restoreComparison}>
        <article><header><strong>{t('restoreCurrentVersion')}</strong></header>
          <div className={css.restoreDocument}>{renderer.renderEditor({
            document: current, content: current.content, title: currentTitle,
            ariaLabel: `${t('restoreCurrentVersion')} · ${currentTitle}`, readOnly: true,
            onContentChange: noop, onTitleChange: noop, onSelectionChange: noop,
          })}</div></article>
        <article data-restore-source=""><header><strong>{t('restoreSelectedVersion')}</strong></header>
          <div className={css.restoreDocument}>{renderer.renderEditor({
            document: historical, content: historical.content, title: historicalTitle,
            ariaLabel: `${t('restoreSelectedVersion')} · ${historicalTitle}`, readOnly: true,
            onContentChange: noop, onTitleChange: noop, onSelectionChange: noop,
          })}</div></article>
      </div>
      <footer><span>{t('restoreSafety')}</span><div><button type="button" disabled={busy} onClick={cancel}>{t('cancel')}</button>
        <button type="button" disabled={busy} onClick={confirm}>{busy ? t('restoring') : t('confirmRestore')}</button></div></footer>
    </section>
  </div>
}

function ProjectBootstrap({ sessionId, initialize, onInitialized, fail, t }: {
  readonly sessionId: SessionId | undefined
  readonly initialize: CanvasInjected['initialize']
  readonly onInitialized: (project: NovelProjectDescriptor) => void
  readonly fail: (message: string) => void
  readonly t: CanvasProps['t']
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (sessionId === undefined || title.trim() === '' || busy) return
    setBusy(true)
    try { onInitialized(await initialize(sessionId, title.trim())) }
    catch (cause: unknown) { fail(errorMessage(cause)) }
    finally { setBusy(false) }
  }
  return <section className={css.projectBootstrap} aria-labelledby="novel-project-bootstrap-title">
    <div className={css.projectBootstrapBody}>
      <span className={css.projectBootstrapMark} aria-hidden="true">✦</span>
      <p className={css.projectBootstrapEyebrow}>{t('studio')}</p>
      <h1 id="novel-project-bootstrap-title">{t('initializeProjectTitle')}</h1>
      <p>{t('initializeProjectDescription')}</p>
      <label>
        <span>{t('projectTitleLabel')}</span>
        <input value={title} autoFocus placeholder={t('projectTitlePlaceholder')}
          onChange={(event) => { setTitle(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void submit() } }} />
      </label>
      <button type="button" disabled={busy || title.trim() === ''} onClick={() => { void submit() }}>
        {busy ? t('initializingProject') : t('initializeProject')}
      </button>
      <small>{t('initializeProjectSafety')}</small>
    </div>
  </section>
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

function AnalysisDrawer({ kind, revisionId, report, busy, error, rerun, close, t }: {
  readonly kind: 'chapter-review' | 'noai-scan'
  readonly revisionId: string
  readonly report: NovelAnalysisReportDescriptor | undefined
  readonly busy: boolean
  readonly error: string | undefined
  readonly rerun: () => void
  readonly close: () => void
  readonly t: CanvasProps['t']
}) {
  return <div className={css.chapterOutlineBackdrop} onMouseDown={close}>
    <aside className={css.analysisDrawer} role="dialog" aria-modal="true"
      aria-label={t(kind === 'chapter-review' ? 'chapterReview' : 'noAiScan')}
      onMouseDown={(event) => { event.stopPropagation() }}>
      <header className={css.analysisHeader}>
        <div><strong>{t(kind === 'chapter-review' ? 'chapterReview' : 'noAiScan')}</strong>
          <small>{t('boundRevision')} · {shortRevisionId(revisionId)}</small></div>
        <div>{report !== undefined && <button type="button" disabled={busy} onClick={rerun}>{busy ? t('analyzing') : t('rerunAnalysis')}</button>}
          <button type="button" onClick={close}>{t('collapseChapterOutline')} ›</button></div>
      </header>
      {error !== undefined && <p className={css.chapterOutlineError} role="alert">{error}</p>}
      <div className={css.analysisBody}>
        {busy && report === undefined && <p className={css.analysisEmpty}>{t('analyzing')}</p>}
        {!busy && report === undefined && error === undefined && <div className={css.analysisEmpty}>
          <p>{t(kind === 'chapter-review' ? 'reviewReady' : 'noAnalysisReport')}</p>
          {kind === 'chapter-review' && <button type="button" onClick={rerun}>{t('startReview')}</button>}
        </div>}
        {report !== undefined && <>
          <div className={css.analysisMeta}><span>{new Date(report.generatedAt).toLocaleString()}</span>
            <span>{report.analyzerVersion}</span></div>
          <AnalysisReportBody report={report} t={t} />
        </>}
      </div>
    </aside>
  </div>
}

function SkillDrawer({ settings, busy, error, toggle, close, t }: {
  readonly settings: NovelSkillSettingsDescriptor | undefined
  readonly busy: boolean
  readonly error: string | undefined
  readonly toggle: (name: string) => void
  readonly close: () => void
  readonly t: CanvasProps['t']
}) {
  return <div className={css.chapterOutlineBackdrop} onMouseDown={close}>
    <aside className={css.analysisDrawer} role="dialog" aria-modal="true" aria-label={t('skills')}
      onMouseDown={(event) => { event.stopPropagation() }}>
      <header className={css.analysisHeader}>
        <div><strong>{t('skills')}</strong><small>{t('skillsSessionScope')}</small></div>
        <div><button type="button" onClick={close}>{t('collapseChapterOutline')} ›</button></div>
      </header>
      {error !== undefined && <p className={css.chapterOutlineError} role="alert">{error}</p>}
      <div className={css.skillBody}>
        <p className={css.skillIntroduction}>{t('skillsDescription')}</p>
        {busy && settings === undefined && <p className={css.analysisEmpty}>{t('loadingSkills')}</p>}
        {settings !== undefined && settings.skills.length === 0
          && <p className={css.analysisEmpty}>{t('noPresetSkills')}</p>}
        {settings !== undefined && settings.skills.length > 0 && <div className={css.skillList}>
          {settings.skills.map(skill => <article className={css.skillRow} key={skill.name}>
            <div><header><code>{skill.name}</code><span>{skill.enabled ? t('skillEnabled') : t('skillDisabled')}</span></header>
              <p>{skill.description}</p>
              {skill.whenToUse !== undefined && <small>{skill.whenToUse}</small>}
            </div>
            <label className={css.skillSwitch}>
              <input type="checkbox" checked={skill.enabled} disabled={busy}
                aria-label={`${skill.name} · ${skill.enabled ? t('skillEnabled') : t('skillDisabled')}`}
                onChange={() => { toggle(skill.name) }} />
              <span aria-hidden="true" />
            </label>
          </article>)}
        </div>}
      </div>
    </aside>
  </div>
}

function PreferenceDrawer({
  revisionId, candidate, notice, storyCandidate, storyNotice, busy, error,
  accept, reject, acceptStoryState, rejectStoryState, close, t,
}: {
  readonly revisionId: string
  readonly candidate: NovelPreferenceCandidateDescriptor | undefined
  readonly notice: string | undefined
  readonly storyCandidate: NovelStoryStateCandidateDescriptor | undefined
  readonly storyNotice: string | undefined
  readonly busy: boolean
  readonly error: string | undefined
  readonly accept: () => void
  readonly reject: () => void
  readonly acceptStoryState: () => void
  readonly rejectStoryState: () => void
  readonly close: () => void
  readonly t: CanvasProps['t']
}) {
  return <div className={css.chapterOutlineBackdrop} onMouseDown={close}>
    <aside className={css.analysisDrawer} role="dialog" aria-modal="true" aria-label={t('preferenceLearning')}
      onMouseDown={(event) => { event.stopPropagation() }}>
      <header className={css.analysisHeader}>
        <div><strong>{t('preferenceLearning')}</strong>
          <small>{t('boundRevision')} · {shortRevisionId(revisionId)}</small></div>
        <div><button type="button" onClick={close}>{t('collapseChapterOutline')} ›</button></div>
      </header>
      {error !== undefined && <p className={css.chapterOutlineError} role="alert">{error}</p>}
      <div className={css.analysisBody}>
        {busy && candidate === undefined && storyCandidate === undefined
          && <p className={css.analysisEmpty}>{t('analyzing')}</p>}
        {notice !== undefined && <p className={css.preferenceNotice}>{notice}</p>}
        <h2 className={css.preferenceSummary}>{t('preferenceLearning')}</h2>
        {candidate !== undefined && <>
          <div className={css.analysisMeta}><span>{new Date(candidate.generatedAt).toLocaleString()}</span>
            <span>{candidate.status === 'pending' ? t('preferencePending')
              : candidate.status === 'accepted' ? t('preferenceAccepted') : t('preferenceRejected')}</span></div>
          <h3 className={css.preferenceSummary}>{candidate.summary}</h3>
          <pre className={css.preferenceGuidance}>{candidate.guidanceMarkdown}</pre>
          <section className={css.preferenceEvidence}><h3>{t('preferenceEvidence')}</h3>
            {candidate.evidence.map((item, index) => <article key={`${index}-${item.inference}`}>
              <p><del>{item.before}</del></p><p><ins>{item.after}</ins></p><small>{item.inference}</small>
            </article>)}</section>
          {candidate.status === 'pending' && <div className={css.preferenceActions}>
            <button type="button" disabled={busy} onClick={reject}>{t('rejectPreference')}</button>
            <button type="button" disabled={busy} onClick={accept}>{busy ? t('saving') : t('acceptPreference')}</button>
          </div>}
        </>}
        <h2 className={css.preferenceSummary}>{t('storyStateUpdate')}</h2>
        {storyNotice !== undefined && <p className={css.preferenceNotice}>{storyNotice}</p>}
        {storyCandidate !== undefined && <>
          <div className={css.analysisMeta}><span>{new Date(storyCandidate.generatedAt).toLocaleString()}</span>
            <span>{storyCandidate.status === 'pending' ? t('preferencePending')
              : storyCandidate.status === 'accepted' ? t('preferenceAccepted') : t('preferenceRejected')}</span></div>
          <h3 className={css.preferenceSummary}>{storyCandidate.summary}</h3>
          <pre className={css.preferenceGuidance}>{storyCandidate.replacementMarkdown}</pre>
          <section className={css.preferenceEvidence}><h3>{t('storyStateEvidence')}</h3>
            {storyCandidate.evidence.map((item, index) => <article key={`${index}-${item.update}`}>
              <blockquote>{item.quote}</blockquote><small>{item.update}</small>
            </article>)}</section>
          {storyCandidate.status === 'pending' && <div className={css.preferenceActions}>
            <button type="button" disabled={busy} onClick={rejectStoryState}>{t('rejectStoryState')}</button>
            <button type="button" disabled={busy} onClick={acceptStoryState}>
              {busy ? t('saving') : t('acceptStoryState')}</button>
          </div>}
        </>}
      </div>
    </aside>
  </div>
}

function AnalysisReportBody({ report, t }: {
  readonly report: NovelAnalysisReportDescriptor
  readonly t: CanvasProps['t']
}) {
  const data = wireRecord(report.data)
  if (report.kind === 'noai-scan') {
    const findings = wireRecords(data?.['findings'])
    return <>
      <section className={css.analysisScore}>
        <div><strong>{wireNumber(data?.['riskScore']) ?? 0}</strong><span>/ 100</span><small>{t('noAiRisk')}</small></div>
        <p>{sampleLabel(data?.['sampleLevel'], t)} · {wireNumber(data?.['characterCount']) ?? 0} {t('characters')}</p>
      </section>
      <ReportFindings findings={findings} t={t} mode="noai" />
    </>
  }
  const findings = wireRecords(data?.['findings'])
  const dimensions = wireRecords(data?.['dimensions'])
  const priorities = wireStrings(data?.['priorities'])
  return <>
    <section className={css.analysisScore}>
      <div><strong>{wireNumber(data?.['overallScore']) ?? 0}</strong><span>/ 100</span><small>{t('reviewScore')}</small></div>
      <p>{wireString(data?.['verdict']) ?? t('noAnalysisReport')}</p>
    </section>
    {dimensions.length > 0 && <section className={css.dimensionGrid}>{dimensions.map((dimension, index) => <article key={`${wireString(dimension['id']) ?? 'dimension'}-${index}`}>
      <header><strong>{reviewDimensionLabel(wireString(dimension['id']), t)}</strong><span>{wireNumber(dimension['score']) ?? 0}</span></header>
      <p>{wireString(dimension['summary']) ?? ''}</p>
    </article>)}</section>}
    {priorities.length > 0 && <section className={css.analysisPriorities}><h3>{t('reviewPriorities')}</h3><ol>
      {priorities.map((priority, index) => <li key={`${priority}-${index}`}>{priority}</li>)}</ol></section>}
    <ReportFindings findings={findings} t={t} mode="review" />
  </>
}

function ReportFindings({ findings, mode, t }: {
  readonly findings: readonly Record<string, unknown>[]
  readonly mode: 'review' | 'noai'
  readonly t: CanvasProps['t']
}) {
  if (findings.length === 0) return <p className={css.analysisEmpty}>{t('noFindings')}</p>
  return <section className={css.findingList}><h3>{t('analysisFindings')} · {findings.length}</h3>
    {findings.map((finding, index) => {
      const severity = wireString(finding['severity']) ?? 'low'
      const title = mode === 'noai' ? wireString(finding['label']) : wireString(finding['category'])
      const evidence = mode === 'noai' ? wireString(finding['evidence']) : wireString(finding['quote'])
      const diagnosis = mode === 'noai' ? undefined : wireString(finding['diagnosis'])
      const advice = mode === 'noai' ? wireString(finding['advice']) : wireString(finding['suggestion'])
      return <article key={`${title ?? 'finding'}-${index}`} data-severity={severity}>
        <header><strong>{title ?? t('analysisFinding')}</strong><span>{severityLabel(severity, t)}</span></header>
        {evidence !== undefined && evidence !== '' && <blockquote>{evidence}</blockquote>}
        {diagnosis !== undefined && <p>{diagnosis}</p>}
        {advice !== undefined && <p className={css.findingAdvice}>{advice}</p>}
      </article>
    })}
  </section>
}

function ReaderControls({
  activeSkin, activeFont, fontSize, characterCount, chapterOutlineAvailable, chapterOutlineOpen,
  analysisMode, analysisBusy, skillsOpen, skillsBusy, openChapterOutline, runNoAi, runReview, openSkills,
  setSkin, setFont, setFontSize, t,
}: {
  readonly activeSkin: NovelReaderSkin
  readonly activeFont: NovelReaderFont
  readonly fontSize: number
  readonly characterCount: number | undefined
  readonly chapterOutlineAvailable: boolean
  readonly chapterOutlineOpen: boolean
  readonly analysisMode: 'chapter-review' | 'noai-scan' | undefined
  readonly analysisBusy: boolean
  readonly skillsOpen: boolean
  readonly skillsBusy: boolean
  readonly openChapterOutline: () => void
  readonly runNoAi: () => void
  readonly runReview: () => void
  readonly openSkills: () => void
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
    <div className={css.readerStats}>{characterCount === undefined ? null
      : <span>{t('chapterCharacters')}：<strong>{characterCount.toLocaleString()}</strong></span>}</div>
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
      <button type="button" className={css.skillTrigger} aria-label={t('skills')}
        aria-expanded={skillsOpen} disabled={skillsBusy} onClick={openSkills}><SkillIcon /></button>
      <span className={css.dockDivider} aria-hidden="true" />
      {chapterOutlineAvailable && <><button type="button" className={css.chapterOutlineTrigger} aria-label={t('chapterOutline')}
        aria-expanded={chapterOutlineOpen} onClick={openChapterOutline}><ChapterOutlineIcon /></button>
      <button type="button" className={css.reviewTrigger} aria-label={t('chapterReview')}
        aria-expanded={analysisMode === 'chapter-review'} disabled={analysisBusy}
        onClick={runReview}><ReviewIcon /></button>
      <button type="button" className={css.noAiTrigger} aria-label={t('noAiScan')}
        aria-expanded={analysisMode === 'noai-scan'} disabled={analysisBusy}
        onClick={runNoAi}>NOAI</button>
      <span className={css.dockDivider} aria-hidden="true" /></>}
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

function ReviewIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" d="M8 4.5h8M9 3h6v3H9zM6 5.5H5a2 2 0 0 0-2 2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7.5a2 2 0 0 0-2-2h-1M7 11l2 2 4-4m-6 9h10" /></svg>
}

function SkillIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round"
    d="M5 5.5h6M5 9h9M5 12.5h5M16.5 12.5l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8.8-1.7ZM6.5 16l.65 1.35 1.35.65-1.35.65L6.5 20l-.65-1.35L4.5 18l1.35-.65L6.5 16Z" /></svg>
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

function revisionLabel(revision: NovelAssetRevisionDescriptor, current: boolean, t: CanvasProps['t']): string {
  const date = new Date(revision.createdAt)
  const when = Number.isNaN(date.getTime()) ? revision.createdAt : date.toLocaleString()
  const originKey = revision.restoredFromRevisionId !== undefined ? 'revisionRestored'
    : revision.origin === 'initial-scan' ? 'revisionInitial'
      : revision.origin === 'user-edit' ? 'revisionUser'
        : revision.origin === 'agent-apply' ? 'revisionAgent' : 'revisionExternal'
  const origin = t(originKey)
  return `${current ? `${t('currentRevision')} · ` : ''}${when} · ${origin}`
}

function shortRevisionId(revisionId: string): string {
  return revisionId.length <= 14 ? revisionId : `${revisionId.slice(0, 12)}…`
}

function wireRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function wireRecords(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(wireRecord).filter((item): item is Record<string, unknown> => item !== undefined) : []
}

function wireStrings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function wireString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function wireNumber(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined }

function sampleLabel(value: unknown, t: CanvasProps['t']): string {
  return t(value === 'strong' ? 'sampleStrong' : value === 'usable' ? 'sampleUsable' : 'sampleInsufficient')
}

function severityLabel(value: string, t: CanvasProps['t']): string {
  return t(value === 'high' ? 'severityHigh' : value === 'medium' ? 'severityMedium' : 'severityLow')
}

function reviewDimensionLabel(value: string | undefined, t: CanvasProps['t']): string {
  if (value === 'plot') return t('dimensionPlot')
  if (value === 'causality') return t('dimensionCausality')
  if (value === 'logic') return t('dimensionLogic')
  if (value === 'character') return t('dimensionCharacter')
  if (value === 'pacing') return t('dimensionPacing')
  if (value === 'hook') return t('dimensionHook')
  if (value === 'style') return t('dimensionStyle')
  if (value === 'immersion') return t('dimensionImmersion')
  if (value === 'ai-pattern') return t('dimensionAiPattern')
  return value ?? t('analysisFinding')
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
