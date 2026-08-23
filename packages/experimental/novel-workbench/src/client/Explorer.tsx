/** Project and chapter explorer. */

import { useEffect, useRef } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelProjectDescriptor,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelAssetRendererRegistry } from './renderers.tsx'
import type { createNovelWorkbenchStore } from './store.ts'
import css from './workbench.module.css'

export interface ExplorerInjected {
  renderers: NovelAssetRendererRegistry
  load: (sessionId: SessionId) => Promise<{ project?: NovelProjectDescriptor; assets: readonly NovelAssetDescriptor[] }>
  open: (sessionId: SessionId, assetId: string) => Promise<NovelAssetDocument>
  onRefresh: (listener: () => void) => () => void
}

type ExplorerProps = PropsRuntime<'novel.explorer'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<ExplorerInjected>

/** Session-aware navigator; the shared canvas stays mounted while its data reloads. */
export function Explorer({ useSessions, useStore, actions, renderers, load, open, onRefresh, t }: ExplorerProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const state = useStore(value => ({
    assets: value.assets,
    project: value.project,
    document: value.document,
    draft: value.draft,
    active: value.document?.id,
    loading: value.loading,
    error: value.error,
    reload: value.reload,
  }))
  const activeAssetId = useRef(state.active)

  useEffect(() => {
    if (state.active !== undefined) activeAssetId.current = state.active
  }, [state.active])

  useEffect(() => onRefresh(() => { actions.refresh() }), [actions, onRefresh])

  useEffect(() => {
    actions.reset()
    if (sessionId === undefined) return
    let live = true
    void load(sessionId).then(async ({ project, assets }) => {
      if (!live) return
      if (project === undefined) {
        actions.fail(t('noProject'))
        return
      }
      actions.loaded(project, assets)
      const target = assets.find(asset => asset.id === activeAssetId.current) ?? assets[0]
      if (target !== undefined) actions.open(await open(sessionId, target.id))
    }).catch((error: unknown) => { if (live) actions.fail(error instanceof Error ? error.message : String(error)) })
    return () => { live = false }
  }, [actions, load, open, sessionId, state.reload, t])

  const openAsset = (assetId: string) => {
    if (sessionId === undefined) return
    void open(sessionId, assetId).then((document) => { actions.open(document) })
      .catch((error: unknown) => { actions.fail(String(error)) })
  }

  let characterCount: number | undefined
  if (state.document !== undefined && state.draft !== undefined) {
    try {
      characterCount = renderers.get(state.document.type).reader?.countCharacters(state.draft)
    } catch {
      characterCount = undefined
    }
  }

  return (
    <div className={css.explorerInner}>
      <header className={css.brand}><strong>{t('studio')}</strong></header>
      <div className={css.projectTitle}>
        <strong>{state.project?.title ?? t('chapters')}</strong>
        <small>{state.assets.length} {t('chapterUnit')}</small>
      </div>
      <div className={css.sectionTitle}><span>{t('drafts')}</span><small>{t('total')} {state.assets.length} {t('chapterUnit')}</small></div>
      {state.loading && <p className={css.muted}>{t('loading')}</p>}
      {state.error !== undefined && <p className={css.error}>{state.error}</p>}
      <nav className={css.assetList}>
        {state.assets.map(asset => (
          <button
            type="button"
            key={asset.id}
            className={css.assetButton}
            data-active={asset.id === state.active || undefined}
            onClick={() => { openAsset(asset.id) }}
          >
            <span>{asset.title}</span>
            {asset.id === state.active && characterCount !== undefined
              ? <small>{characterCount.toLocaleString()} {t('characters')}</small>
              : null}
          </button>
        ))}
      </nav>
      <footer className={css.chapterCount}>
        <span>{t('chapterCharacters')}</span>
        <strong>{characterCount?.toLocaleString() ?? '—'}</strong>
      </footer>
    </div>
  )
}
