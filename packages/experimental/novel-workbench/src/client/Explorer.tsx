/** Project explorer for manuscript chapters and the two-level freeform outline hierarchy. */

import { useEffect, useRef, useState } from 'react'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CreateNovelAssetRequest,
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
  create: (sessionId: SessionId, request: CreateNovelAssetRequest) => Promise<NovelAssetDocument>
  onRefresh: (listener: () => void) => () => void
}

type ExplorerProps = PropsRuntime<'novel.explorer'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<ExplorerInjected>

/** Session-aware navigator; paths organize files while semantic parent ids organize outlines. */
export function Explorer({ useSessions, useStore, actions, renderers, load, open, create, onRefresh, t }: ExplorerProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const state = useStore(value => ({
    assets: value.assets, project: value.project, document: value.document,
    titleDraft: value.titleDraft, draft: value.draft, active: value.document?.id,
    loading: value.loading, error: value.error, reload: value.reload,
  }))
  const activeAssetId = useRef(state.active)
  const [creating, setCreating] = useState(false)

  useEffect(() => { if (state.active !== undefined) activeAssetId.current = state.active }, [state.active])
  useEffect(() => onRefresh(() => { actions.refresh() }), [actions, onRefresh])
  useEffect(() => {
    actions.reset()
    if (sessionId === undefined) return
    let live = true
    void load(sessionId).then(async ({ project, assets }) => {
      if (!live) return
      if (project === undefined) { actions.uninitialized(); return }
      actions.loaded(project, assets)
      const target = assets.find(asset => asset.id === activeAssetId.current)
        ?? assets.find(asset => asset.type === 'manuscript.chapter')
        ?? assets[0]
      if (target !== undefined) actions.open(await open(sessionId, target.id))
    }).catch((error: unknown) => { if (live) actions.fail(errorMessage(error)) })
    return () => { live = false }
  }, [actions, load, open, sessionId, state.reload, t])

  const openAsset = (assetId: string) => {
    if (sessionId === undefined) return
    void open(sessionId, assetId).then(actions.open).catch((error: unknown) => { actions.fail(errorMessage(error)) })
  }
  const createOutline = async (level: 'book' | 'volume', parentId?: string) => {
    if (sessionId === undefined || creating) return
    setCreating(true)
    try {
      const document = await create(sessionId, {
        type: 'planning.outline',
        title: level === 'book' ? t('newBookOutlineTitle') : t('newVolumeOutlineTitle'),
        ...(parentId === undefined ? {} : { parentId: parentId as never }),
        content: { kind: 'outline', level, body: '' },
      })
      actions.assetCreated(document)
      actions.open(document)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }
  const createBookGuidance = async (type: 'book.brief' | 'book.style-profile') => {
    if (sessionId === undefined || creating) return
    setCreating(true)
    try {
      const brief = type === 'book.brief'
      const document = await create(sessionId, {
        type,
        title: brief ? t('newBookBriefTitle') : t('newBookStyleProfileTitle'),
        content: brief ? { kind: 'book-brief', body: '' } : { kind: 'book-style-profile', body: '' },
      })
      actions.assetCreated(document)
      actions.open(document)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }

  let characterCount: number | undefined
  if (state.document !== undefined && state.draft !== undefined) {
    try { characterCount = renderers.get(state.document.type).reader?.countCharacters(state.draft) }
    catch { characterCount = undefined }
  }
  const manuscripts = state.assets.filter(asset => asset.type.startsWith('manuscript.'))
  const guidance = state.assets.filter(asset => asset.type === 'book.brief' || asset.type === 'book.style-profile')
  const outlines = state.assets.filter(asset => asset.type === 'planning.outline')
  const roots = outlines.filter(asset => asset.parentId === undefined)
  const other = state.assets.filter(asset => !asset.type.startsWith('manuscript.')
    && asset.type !== 'planning.outline' && asset.type !== 'planning.chapter-outline'
    && asset.type !== 'book.brief' && asset.type !== 'book.style-profile')
  const titleOf = (asset: NovelAssetDescriptor) => asset.id === state.active ? state.titleDraft ?? asset.title : asset.title

  return <div className={css.explorerInner}>
    <header className={css.brand}><strong>{t('studio')}</strong></header>
    <div className={css.projectTitle}><strong>{state.project?.title ?? t('newProject')}</strong></div>
    {state.loading && <p className={css.muted}>{t('loading')}</p>}
    {state.error !== undefined && <p className={css.error}>{state.error}</p>}
    {state.project === undefined && !state.loading && state.error === undefined
      ? <div className={css.projectPending}><strong>{t('projectNotInitialized')}</strong><p>{t('projectNotInitializedSidebar')}</p></div>
      : null}
    {state.project !== undefined && <>
      <nav className={css.assetList}>
        <BookGuidanceGroup
          assets={guidance}
          active={state.active}
          creating={creating}
          titleOf={titleOf}
          openAsset={openAsset}
          createAsset={createBookGuidance}
          labels={{
            title: t('bookGuidance'), items: t('assetUnit'), brief: t('bookBrief'), style: t('bookStyleProfile'),
            addBrief: t('addBookBrief'), addStyle: t('addBookStyleProfile'),
          }}
        />
        <AssetGroup title={t('chapters')} assets={manuscripts} active={state.active} unit={t('chapterUnit')}
          titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')} />
        <OutlineGroup
          roots={roots}
          all={outlines}
          active={state.active}
          creating={creating}
          titleOf={titleOf}
          openAsset={openAsset}
          createOutline={createOutline}
          labels={{ outline: t('outline'), items: t('assetUnit'), addBook: t('addBookOutline'), addVolume: t('addVolumeOutline') }}
        />
        {other.length > 0 && <AssetGroup title={t('otherAssets')} assets={other} active={state.active} unit={t('assetUnit')}
          titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')} />}
      </nav>
    </>}
  </div>
}

function BookGuidanceGroup({ assets, active, creating, titleOf, openAsset, createAsset, labels }: {
  readonly assets: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly creating: boolean
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly createAsset: (type: 'book.brief' | 'book.style-profile') => Promise<void>
  readonly labels: {
    readonly title: string
    readonly items: string
    readonly brief: string
    readonly style: string
    readonly addBrief: string
    readonly addStyle: string
  }
}) {
  const brief = assets.find(asset => asset.type === 'book.brief')
  const style = assets.find(asset => asset.type === 'book.style-profile')
  return <details className={css.assetGroup} open>
    <summary><strong>{labels.title}</strong><small>{assets.length} {labels.items}</small></summary>
    <div className={css.assetGroupItems}>
      {brief === undefined
        ? <button className={css.addGuidance} type="button" disabled={creating}
          onClick={() => { void createAsset('book.brief') }}>＋ {labels.addBrief}</button>
        : <AssetButton asset={brief} active={active} title={titleOf(brief)} details={labels.brief} openAsset={openAsset} />}
      {style === undefined
        ? <button className={css.addGuidance} type="button" disabled={creating}
          onClick={() => { void createAsset('book.style-profile') }}>＋ {labels.addStyle}</button>
        : <AssetButton asset={style} active={active} title={titleOf(style)} details={labels.style} openAsset={openAsset} />}
    </div>
  </details>
}

function OutlineGroup({ roots, all, active, creating, titleOf, openAsset, createOutline, labels }: {
  readonly roots: readonly NovelAssetDescriptor[]
  readonly all: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly creating: boolean
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly createOutline: (level: 'book' | 'volume', parentId?: string) => Promise<void>
  readonly labels: { outline: string; items: string; addBook: string; addVolume: string }
}) {
  return <details className={css.assetGroup} open>
    <summary><strong>{labels.outline}</strong><small>{all.length} {labels.items}</small></summary>
    <div className={css.outlineActions}>
      <button type="button" disabled={creating} onClick={() => { void createOutline('book') }}>＋ {labels.addBook}</button>
    </div>
    <div className={css.assetGroupItems}>
      {roots.map((root) => {
        const volumes = all.filter(asset => asset.parentId === root.id)
        return <div className={css.outlineBranch} key={root.id}>
          <AssetButton asset={root} active={active} title={titleOf(root)} openAsset={openAsset} />
          <div className={css.volumeList}>
            {volumes.map(volume => <AssetButton
              key={volume.id}
              asset={volume}
              active={active}
              title={titleOf(volume)}
              openAsset={openAsset}
            />)}
            <button className={css.addVolume} type="button" disabled={creating}
              onClick={() => { void createOutline('volume', root.id) }}>＋ {labels.addVolume}</button>
          </div>
        </div>
      })}
    </div>
  </details>
}

function AssetButton({ asset, active, title, openAsset, details }: {
  readonly asset: NovelAssetDescriptor
  readonly active: string | undefined
  readonly title: string
  readonly openAsset: (assetId: string) => void
  readonly details?: string
}) {
  return <button type="button" className={css.assetButton} data-active={asset.id === active || undefined}
    onClick={() => { openAsset(asset.id) }}><span>{title}</span>{details === undefined ? null : <small>{details}</small>}</button>
}

function AssetGroup({ title, assets, active, unit, titleOf, openAsset, characterCount, characters }: {
  readonly title: string
  readonly assets: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly unit: string
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly characterCount: number | undefined
  readonly characters: string
}) {
  return <details className={css.assetGroup} open>
    <summary><strong>{title}</strong><small>{assets.length} {unit}</small></summary>
    <div className={css.assetGroupItems}>{assets.map((asset) => {
      const details = asset.id === active && characterCount !== undefined
        ? `${characterCount.toLocaleString()} ${characters}`
        : undefined
      return <AssetButton
        key={asset.id} asset={asset} active={active} title={titleOf(asset)} openAsset={openAsset}
        {...(details === undefined ? {} : { details })}
      />
    })}</div>
  </details>
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
