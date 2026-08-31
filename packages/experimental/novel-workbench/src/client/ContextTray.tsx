/** Compact, preset-scoped disclosure and editor for the next Novel context workset. */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  NovelAssetSearchResult,
  NovelContextWorksetDescriptor,
  NovelProjectDescriptor,
  SearchNovelAssetsRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type {} from '@deepseek-ai/dsh-experimental-novel-context/client'
import type {} from '@deepseek-ai/dsh-agent-presets/types'
import type { NovelContextFocus } from './context-controller.ts'
import type { NovelLibraryContextFocus, NovelProjectStatusFocus } from './context-controller.ts'
import { NOVEL_WORKBENCH_PRESET } from './constants.ts'
import css from './ContextTray.module.css'

export interface ContextTrayInjected {
  hooks: {
    contextFocus: HostObservable<NovelContextFocus | undefined>
    libraryContext: HostObservable<NovelLibraryContextFocus | undefined>
    projectStatus: HostObservable<NovelProjectStatusFocus | undefined>
  }
  search: (request: SearchNovelAssetsRequest) => Promise<readonly NovelAssetSearchResult[]>
  discover: () => Promise<NovelProjectDescriptor | undefined>
  replace: (workset: NovelContextWorksetDescriptor) => Promise<NovelContextWorksetDescriptor>
}

type ContextTrayProps = PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'novel-workbench'>
  & InjectFace<ContextTrayInjected>

/** Human-visible controls for the references compiled into the next model request. */
export function ContextTray({
  sessionId, useSessions, useContextFocus, useLibraryContext, useProjectStatus,
  search, discover, replace, t,
}: ContextTrayProps) {
  const preset = useSessions(state => state.byId[sessionId]?.projectionValues?.agentPreset)
  const focus = useContextFocus(value => value?.sessionId === sessionId ? value : undefined)
  const library = useLibraryContext(value => value?.sessionId === sessionId ? value : undefined)
  const reportedProjectStatus = useProjectStatus(value => value?.sessionId === sessionId ? value.status : undefined)
  const [discoveredProject, setDiscoveredProject] = useState<NovelProjectDescriptor>()
  const [discoveryStatus, setDiscoveryStatus] = useState<'loading' | 'uninitialized' | 'ready' | 'error'>('loading')
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly NovelAssetSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [workset, setWorkset] = useState<NovelContextWorksetDescriptor | undefined>(
    () => readStoredWorkset(sessionId),
  )

  useEffect(() => { setWorkset(readStoredWorkset(sessionId)) }, [sessionId])

  const replaceAndRetain = useCallback(async (
    next: NovelContextWorksetDescriptor,
  ): Promise<NovelContextWorksetDescriptor> => {
    const retained = await replace(next)
    setWorkset(retained)
    writeStoredWorkset(sessionId, retained)
    return retained
  }, [replace, sessionId])

  useEffect(() => {
    if (preset !== NOVEL_WORKBENCH_PRESET) {
      setDiscoveredProject(undefined)
      setDiscoveryStatus('loading')
      return
    }
    let live = true
    setDiscoveryStatus('loading')
    void discover().then((project) => {
      if (!live) return
      setDiscoveredProject(project)
      setDiscoveryStatus(project === undefined ? 'uninitialized' : 'ready')
    }).catch((cause: unknown) => {
      if (!live) return
      setDiscoveredProject(undefined)
      setDiscoveryStatus('error')
      setError(errorMessage(cause))
    })
    return () => { live = false }
  }, [discover, preset, sessionId])

  const projectStatus = discoveredProject !== undefined
    ? 'ready'
    : discoveryStatus === 'loading' && reportedProjectStatus !== undefined
      ? reportedProjectStatus
      : discoveryStatus
  const focusedProjectId = focus?.project.id ?? library?.projectId ?? discoveredProject?.id
  const compatibleWorkset = focusedProjectId === undefined || workset?.projectId === focusedProjectId
    ? workset
    : undefined
  const activeWorkset = compatibleWorkset ?? (focusedProjectId === undefined ? undefined : {
    version: 2 as const, projectId: focusedProjectId, items: [],
  })
  const follow = activeWorkset?.items.find(item => item.mode === 'follow')
  const currentFollow = library !== undefined ? undefined : follow ?? (focus === undefined || focus.dirty ? undefined : {
    projectId: focus.project.id,
    assetId: focus.document.id,
    label: focus.document.title,
    mode: 'follow' as const,
    origin: 'active-asset' as const,
  })
  const pinned = useMemo(
    () => activeWorkset?.items.filter(item => item.mode === 'pinned') ?? [],
    [activeWorkset],
  )
  const currentSurface = library === undefined ? undefined : (activeWorkset?.surface ?? library.surface)

  useEffect(() => {
    if (preset !== NOVEL_WORKBENCH_PRESET || discoveredProject === undefined
      || focus !== undefined || library !== undefined) return
    if (compatibleWorkset?.version === 2 && compatibleWorkset.projectId === discoveredProject.id) return
    const next: NovelContextWorksetDescriptor = {
      version: 2,
      projectId: discoveredProject.id,
      items: [],
    }
    void replaceAndRetain(next).catch((cause: unknown) => { setError(errorMessage(cause)) })
  }, [compatibleWorkset, discoveredProject, focus, library, preset, replaceAndRetain])

  useEffect(() => {
    if (preset !== NOVEL_WORKBENCH_PRESET || library !== undefined || focus === undefined || focus.dirty) return
    if (activeWorkset?.version === 2 && activeWorkset.surface === undefined && follow?.assetId === focus.document.id
      && follow.projectId === focus.project.id && follow.label === focus.document.title) return
    const next: NovelContextWorksetDescriptor = {
      version: 2,
      projectId: focus.project.id,
      items: [
        {
          projectId: focus.project.id,
          assetId: focus.document.id,
          label: focus.document.title,
          mode: 'follow',
          origin: 'active-asset',
        },
        ...pinned.filter(item => item.projectId === focus.project.id),
      ],
    }
    void replaceAndRetain(next).catch((cause: unknown) => { setError(errorMessage(cause)) })
  }, [activeWorkset?.surface, activeWorkset?.version, focus, follow, library, pinned, preset, replaceAndRetain])

  useEffect(() => {
    if (preset !== NOVEL_WORKBENCH_PRESET || library === undefined) return
    const kept = pinned.filter(item => item.projectId === library.projectId)
    const next: NovelContextWorksetDescriptor = {
      version: 2,
      projectId: library.projectId,
      items: kept,
      surface: library.surface,
    }
    if (activeWorkset?.version === 2 && JSON.stringify(activeWorkset) === JSON.stringify(next)) return
    void replaceAndRetain(next).catch((cause: unknown) => { setError(errorMessage(cause)) })
  }, [activeWorkset, library, pinned, preset, replaceAndRetain])

  if (preset !== NOVEL_WORKBENCH_PRESET) return null
  if (projectStatus !== 'ready') {
    return <div className={css.tray} data-novel-context-tray>
      <span className={css.title}>{t('context')}</span>
      <span className={css.follow}>{projectStatus === 'uninitialized'
        ? t('contextProjectUninitialized')
        : t('contextProjectUnavailable')}</span>
      {error !== undefined && <small className={css.error} role="alert">{error}</small>}
    </div>
  }

  const commit = async (items: NovelContextWorksetDescriptor['items']): Promise<void> => {
    const projectId = focus?.project.id ?? library?.projectId ?? activeWorkset?.projectId
    if (projectId === undefined) return
    setBusy(true); setError(undefined)
    try {
      await replaceAndRetain({
        version: 2, projectId, items,
        ...(library === undefined ? {} : { surface: library.surface }),
      })
    }
    catch (cause: unknown) { setError(errorMessage(cause)) }
    finally { setBusy(false) }
  }

  const runSearch = async (): Promise<void> => {
    if (query.trim() === '') return
    setBusy(true); setError(undefined)
    try { setResults(await search({ query: query.trim(), limit: 8 })) }
    catch (cause: unknown) { setError(errorMessage(cause)); setResults([]) }
    finally { setBusy(false) }
  }

  const pin = (result: NovelAssetSearchResult): void => {
    const kept = pinned.filter(item => !(item.assetId === result.id && item.revisionId === result.revisionId))
    void commit([
      ...(currentFollow === undefined ? [] : [currentFollow]),
      ...kept,
      {
        projectId: result.projectId,
        assetId: result.id,
        revisionId: result.revisionId,
        label: result.title,
        mode: 'pinned' as const,
        origin: 'search' as const,
      },
    ])
    setPicker(false); setQuery(''); setResults([])
  }

  return <div className={css.tray} data-novel-context-tray>
    <span className={css.title}>{t('context')}</span>
    <span className={css.follow} data-active={currentFollow !== undefined || currentSurface !== undefined || undefined}
      title={currentSurface?.label ?? (currentFollow === undefined ? t('followCurrent') : `${currentFollow.label} · ${contextCoordinate(currentFollow)}`)}>
      <span aria-hidden="true">◎</span>{currentSurface === undefined
        ? (currentFollow === undefined ? t('followCurrent') : humanContextLabel(currentFollow.label))
        : `${currentSurface.label} · ${currentSurface.bookCount}${t('bookUnit')}`}
    </span>
    {pinned.map(item => <span className={css.chip} key={`${item.assetId}:${item.revisionId}`}>
      <span title={`${item.label} · ${contextCoordinate(item)}`}>{humanContextLabel(item.label)}</span>
      <button type="button" aria-label={`${t('removeContext')} ${item.label}`} disabled={busy}
        onClick={() => { void commit([
          ...(currentFollow === undefined ? [] : [currentFollow]),
          ...pinned.filter(candidate => candidate !== item),
        ]) }}>×</button>
    </span>)}
    {library === undefined && <button type="button" className={css.add} aria-expanded={picker}
      onClick={() => { setPicker(value => !value) }}>＋ {t('searchContext')}</button>}
    {focus?.dirty === true && follow !== undefined && <small>{t('contextNeedsSave')}</small>}
    {error !== undefined && <small className={css.error} role="alert">{error}</small>}
    {library === undefined && picker && <div className={css.picker}>
      <div className={css.searchRow}>
        <input value={query} autoFocus placeholder={t('searchContextPlaceholder')}
          onChange={(event) => { setQuery(event.target.value) }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void runSearch() } }} />
        <button type="button" disabled={busy || query.trim() === ''} onClick={() => { void runSearch() }}>{t('search')}</button>
      </div>
      <div className={css.results}>{results.map(result => <button type="button" key={result.id}
        onClick={() => { pin(result) }}><strong>{result.title}</strong><span>{result.type}</span>
        <small>{result.excerpt}</small></button>)}</div>
      {!busy && query.trim() !== '' && results.length === 0 && <small>{t('noSearchResults')}</small>}
    </div>}
  </div>
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }

const WORKSET_STORAGE_PREFIX = 'dsh.novel.workset.'

function isStoredWorkset(value: unknown): value is NovelContextWorksetDescriptor {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record['version'] === 2
    && typeof record['projectId'] === 'string'
    && Array.isArray(record['items'])
}

function readStoredWorkset(sessionId: string): NovelContextWorksetDescriptor | undefined {
  try {
    const source = window.localStorage.getItem(`${WORKSET_STORAGE_PREFIX}${sessionId}`)
    if (source === null) return undefined
    const value: unknown = JSON.parse(source)
    return isStoredWorkset(value) ? value : undefined
  } catch {
    return undefined
  }
}

function writeStoredWorkset(sessionId: string, workset: NovelContextWorksetDescriptor): void {
  try { window.localStorage.setItem(`${WORKSET_STORAGE_PREFIX}${sessionId}`, JSON.stringify(workset)) }
  catch { /* A disabled storage backend only makes pins tab-local. */ }
}

/** Compact human coordinate; the model manifest also carries the canonical dsh-novel URI. */
export function contextCoordinate(item: NovelContextWorksetDescriptor['items'][number]): string {
  return `novel://${item.projectId}/${item.assetId}@${item.mode === 'follow' ? 'current' : item.revisionId}`
}

/** Keep the tray readable while the exact coordinate remains available to the model and tooltip. */
export function humanContextLabel(label: string): string {
  return label.replace(/^(第[^\s·：:]+章)[\s·：:]+(.+)$/u, '$1：$2')
}
