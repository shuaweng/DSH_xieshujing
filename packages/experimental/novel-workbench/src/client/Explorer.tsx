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
    titleDraft: value.titleDraft,
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
  const manuscriptAssets = state.assets.filter(asset => asset.type.startsWith('manuscript.'))
  const outlineAssets = state.assets.filter(asset => asset.type.startsWith('planning.'))
  const otherAssets = state.assets.filter(asset =>
    !asset.type.startsWith('manuscript.') && !asset.type.startsWith('planning.'))
  const titleOf = (asset: NovelAssetDescriptor) =>
    asset.id === state.active ? state.titleDraft ?? asset.title : asset.title

  return (
    <div className={css.explorerInner}>
      <header className={css.brand}><strong>{t('studio')}</strong></header>
      <div className={css.projectTitle}>
        <strong>{state.project?.title ?? t('chapters')}</strong>
      </div>
      {state.loading && <p className={css.muted}>{t('loading')}</p>}
      {state.error !== undefined && <p className={css.error}>{state.error}</p>}
      <nav className={css.assetList}>
        <AssetGroup title={t('chapters')} assets={manuscriptAssets} active={state.active} unit={t('chapterUnit')}
          titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')} />
        <AssetGroup title={t('outline')} assets={outlineAssets} active={state.active} unit={t('assetUnit')}
          titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')} />
        {otherAssets.length > 0 && (
          <AssetGroup title={t('otherAssets')} assets={otherAssets} active={state.active} unit={t('assetUnit')}
            titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')} />
        )}
      </nav>
    </div>
  )
}

interface AssetGroupProps {
  readonly title: string
  readonly assets: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly unit: string
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly characterCount: number | undefined
  readonly characters: string
}

/** One semantic branch under the current Book; empty branches remain visible for stable orientation. */
function AssetGroup({ title, assets, active, unit, titleOf, openAsset, characterCount, characters }: AssetGroupProps) {
  return (
    <details className={css.assetGroup} open>
      <summary><strong>{title}</strong><small>{assets.length} {unit}</small></summary>
      <div className={css.assetGroupItems}>
        {assets.map(asset => (
          <button
            type="button"
            key={asset.id}
            className={css.assetButton}
            data-active={asset.id === active || undefined}
            onClick={() => { openAsset(asset.id) }}
          >
            <span>{titleOf(asset)}</span>
            {asset.id === active && characterCount !== undefined
              ? <small>{characterCount.toLocaleString()} {characters}</small>
              : null}
          </button>
        ))}
      </div>
    </details>
  )
}
