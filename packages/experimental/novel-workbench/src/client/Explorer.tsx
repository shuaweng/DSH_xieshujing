/** Project and chapter explorer. */

import { useEffect, useRef } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  NovelAssetDescriptor,
  NovelChapterDocument,
  NovelProjectDescriptor,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { createNovelWorkbenchStore } from './store.ts'
import css from './workbench.module.css'

export interface ExplorerInjected {
  load: (sessionId: SessionId) => Promise<{ project?: NovelProjectDescriptor; assets: readonly NovelAssetDescriptor[] }>
  open: (sessionId: SessionId, assetId: string) => Promise<NovelChapterDocument>
  onRefresh: (listener: () => void) => () => void
}

type ExplorerProps = PropsRuntime<'novel.explorer'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<ExplorerInjected>

/** Session-aware navigator; the shared canvas stays mounted while its data reloads. */
export function Explorer({ useSessions, useStore, actions, load, open, onRefresh, t }: ExplorerProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const state = useStore(value => ({
    assets: value.assets,
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

  return (
    <div className={css.explorerInner}>
      <header className={css.brand}><span className={css.mark}>N</span><strong>{t('studio')}</strong></header>
      <div className={css.sectionTitle}>{t('chapters')}</div>
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
            <small>{asset.projectRelativePath}</small>
          </button>
        ))}
      </nav>
    </div>
  )
}
