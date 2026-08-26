/** Compact, preset-scoped disclosure and editor for the next Novel context workset. */

import { useEffect, useMemo, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type {
  NovelAssetSearchResult,
  NovelContextWorksetDescriptor,
  SearchNovelAssetsRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type {} from '@deepseek-ai/dsh-experimental-novel-context/client'
import type { NovelContextFocus } from './context-controller.ts'
import type { NovelProjectStatusFocus } from './context-controller.ts'
import { NOVEL_WORKBENCH_PRESET } from './constants.ts'
import css from './ContextTray.module.css'

export interface ContextTrayInjected {
  hooks: {
    contextFocus: HostObservable<NovelContextFocus | undefined>
    projectStatus: HostObservable<NovelProjectStatusFocus | undefined>
  }
  search: (request: SearchNovelAssetsRequest) => Promise<readonly NovelAssetSearchResult[]>
  replace: (workset: NovelContextWorksetDescriptor) => Promise<NovelContextWorksetDescriptor>
}

type ContextTrayProps = PropsRuntime<'conversation.input.dock'>
  & PropsLocale<'novel-workbench'>
  & InjectFace<ContextTrayInjected>

/** Human-visible controls for exact follow/pin references; model payload stays in the Session Log. */
export function ContextTray({
  sessionId, useSessions, useProjection, useContextFocus, useProjectStatus, search, replace, t,
}: ContextTrayProps) {
  const preset = useSessions(state => state.byId[sessionId]?.agentPreset)
  const projected = useProjection('novelContextWorkset') as NovelContextWorksetDescriptor | null | undefined
  const focus = useContextFocus(value => value?.sessionId === sessionId ? value : undefined)
  const projectStatus = useProjectStatus(value => value?.sessionId === sessionId ? value.status : 'loading')
  const [picker, setPicker] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<readonly NovelAssetSearchResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const workset = projected ?? (focus === undefined ? undefined : {
    version: 2 as const, projectId: focus.project.id, items: [],
  })
  const follow = workset?.items.find(item => item.mode === 'follow')
  const currentFollow = follow ?? (focus === undefined || focus.dirty ? undefined : {
    projectId: focus.project.id,
    assetId: focus.document.id,
    label: focus.document.title,
    mode: 'follow' as const,
    origin: 'active-asset' as const,
  })
  const pinned = useMemo(
    () => workset?.items.filter(item => item.mode === 'pinned') ?? [],
    [workset],
  )

  useEffect(() => {
    if (preset !== NOVEL_WORKBENCH_PRESET || focus === undefined || focus.dirty) return
    if (workset?.version === 2 && follow?.assetId === focus.document.id
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
    void replace(next).catch((cause: unknown) => { setError(errorMessage(cause)) })
  }, [focus, follow, pinned, preset, replace, workset?.version])

  if (preset !== NOVEL_WORKBENCH_PRESET) return null
  if (projectStatus !== 'ready') {
    return <div className={css.tray} data-novel-context-tray>
      <span className={css.title}>{t('context')}</span>
      <span className={css.follow}>{projectStatus === 'uninitialized'
        ? t('contextProjectUninitialized')
        : t('contextProjectUnavailable')}</span>
    </div>
  }

  const commit = async (items: NovelContextWorksetDescriptor['items']): Promise<void> => {
    const projectId = focus?.project.id ?? workset?.projectId
    if (projectId === undefined) return
    setBusy(true); setError(undefined)
    try { await replace({ version: 2, projectId, items }) }
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
    <span className={css.follow} data-active={currentFollow !== undefined || undefined}
      title={currentFollow === undefined ? t('followCurrent') : `${currentFollow.label} · ${contextCoordinate(currentFollow)}`}>
      <span aria-hidden="true">◎</span>{currentFollow === undefined ? t('followCurrent') : humanContextLabel(currentFollow.label)}
    </span>
    {pinned.map(item => <span className={css.chip} key={`${item.assetId}:${item.revisionId}`}>
      <span title={`${item.label} · ${contextCoordinate(item)}`}>{humanContextLabel(item.label)}</span>
      <button type="button" aria-label={`${t('removeContext')} ${item.label}`} disabled={busy}
        onClick={() => { void commit([
          ...(currentFollow === undefined ? [] : [currentFollow]),
          ...pinned.filter(candidate => candidate !== item),
        ]) }}>×</button>
    </span>)}
    <button type="button" className={css.add} aria-expanded={picker} onClick={() => { setPicker(value => !value) }}>
      ＋ {t('searchContext')}
    </button>
    {focus?.dirty === true && follow !== undefined && <small>{t('contextNeedsSave')}</small>}
    {error !== undefined && <small className={css.error} role="alert">{error}</small>}
    {picker && <div className={css.picker}>
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

/** Compact human coordinate; the model manifest also carries the canonical dsh-novel URI. */
export function contextCoordinate(item: NovelContextWorksetDescriptor['items'][number]): string {
  return `novel://${item.projectId}/${item.assetId}@${item.mode === 'follow' ? 'current' : item.revisionId}`
}

/** Keep the tray readable while the exact coordinate remains available to the model and tooltip. */
export function humanContextLabel(label: string): string {
  return label.replace(/^(第[^\s·：:]+章)[\s·：:]+(.+)$/u, '$1：$2')
}
