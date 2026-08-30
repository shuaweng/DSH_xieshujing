/** Project explorer for manuscript chapters and the two-level freeform outline hierarchy. */

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  CreateNovelAssetRequest,
  DeleteNovelAssetDescriptor,
  DeleteNovelAssetRequest,
  NovelAssetDescriptor,
  NovelAssetDocument,
  NovelProjectDescriptor,
  ReorderNovelAssetsRequest,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelAssetRendererRegistry } from './renderers.tsx'
import type { createNovelWorkbenchStore } from './store.ts'
import { NovelWorkbenchViewController, useNovelWorkbenchView } from './view-controller.ts'
import css from './workbench.module.css'

const fallbackWorkbench = new NovelWorkbenchViewController('book')

export interface ExplorerInjected {
  workbench?: NovelWorkbenchViewController
  renderers: NovelAssetRendererRegistry
  load: (sessionId: SessionId) => Promise<{ project?: NovelProjectDescriptor; assets: readonly NovelAssetDescriptor[] }>
  open: (sessionId: SessionId, assetId: string) => Promise<NovelAssetDocument>
  create: (sessionId: SessionId, request: CreateNovelAssetRequest) => Promise<NovelAssetDocument>
  reorder: (sessionId: SessionId, request: ReorderNovelAssetsRequest) => Promise<readonly NovelAssetDescriptor[]>
  delete: (sessionId: SessionId, request: DeleteNovelAssetRequest) => Promise<DeleteNovelAssetDescriptor>
  onRefresh: (listener: () => void) => () => void
}

type ExplorerProps = PropsRuntime<'novel.explorer'>
  & PropsStore<ReturnType<typeof createNovelWorkbenchStore>>
  & PropsLocale<'novel-workbench'>
  & InjectFace<ExplorerInjected>

/** Session-aware navigator; paths organize files while semantic parent ids organize outlines. */
export function Explorer({
  useSessions, useStore, actions, workbench = fallbackWorkbench,
  renderers, load, open, create, reorder, delete: deleteRemote, onRefresh, t,
}: ExplorerProps) {
  const sessionId = useSessions(snapshot => snapshot.current)
  const requestedAssetId = useNovelWorkbenchView(workbench, value => value.requestedAssetId)
  const state = useStore(value => ({
    assets: value.assets, project: value.project, document: value.document,
    titleDraft: value.titleDraft, draft: value.draft, active: value.document?.id,
    loading: value.loading, error: value.error, reload: value.reload,
  }))
  const activeAssetId = useRef(state.active)
  const [creating, setCreating] = useState(false)
  const [reordering, setReordering] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<NovelAssetDescriptor>()
  const [dialogHost, setDialogHost] = useState<Element | null>(null)

  useEffect(() => { setDialogHost(document.querySelector('[data-novel-workbench]')) }, [])
  useEffect(() => { if (state.active !== undefined) activeAssetId.current = state.active }, [state.active])
  useEffect(() => onRefresh(() => { actions.refresh() }), [actions, onRefresh])
  useEffect(() => {
    actions.bindSession(sessionId)
    actions.reset()
    if (sessionId === undefined) return
    let live = true
    void load(sessionId).then(async ({ project, assets }) => {
      if (!live) return
      if (project === undefined) { actions.uninitialized(); return }
      actions.loaded(project, assets)
      const target = assets.find(asset => asset.id === requestedAssetId)
        ?? assets.find(asset => asset.id === activeAssetId.current)
        ?? assets.find(asset => asset.type === 'manuscript.chapter')
        ?? assets[0]
      if (target !== undefined) {
        actions.open(await open(sessionId, target.id))
        workbench.clearRequestedAsset(target.id)
      }
    }).catch((error: unknown) => { if (live) actions.fail(errorMessage(error)) })
    return () => { live = false }
  }, [actions, load, open, requestedAssetId, sessionId, state.reload, t, workbench])

  const openAsset = (assetId: string) => {
    if (sessionId === undefined) return
    void open(sessionId, assetId).then(actions.open).catch((error: unknown) => { actions.fail(errorMessage(error)) })
  }
  const createBookGuidance = async (type: 'book.brief' | 'book.style-profile' | 'book.story-state') => {
    if (sessionId === undefined || creating) return
    setCreating(true)
    try {
      const brief = type === 'book.brief'
      const style = type === 'book.style-profile'
      const document = await create(sessionId, {
        type,
        title: brief ? t('newBookBriefTitle') : style ? t('newBookStyleProfileTitle') : t('newBookStoryStateTitle'),
        content: brief ? { kind: 'book-brief', body: '' }
          : style ? { kind: 'book-style-profile', body: '' } : { kind: 'book-story-state', body: '' },
      })
      actions.assetCreated(document)
      actions.open(document)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }
  const createChapter = async () => {
    if (sessionId === undefined || creating) return
    setCreating(true)
    try {
      const document = await create(sessionId, {
        type: 'manuscript.chapter',
        title: t('newChapterTitle'),
        content: { kind: 'manuscript', body: '' },
      })
      actions.assetCreated(document)
      actions.open(document)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }
  const createVolumeOutline = async (bookOutline: NovelAssetDescriptor) => {
    if (sessionId === undefined || creating) return
    setCreating(true)
    try {
      const document = await create(sessionId, {
        type: 'planning.outline',
        title: t('newVolumeOutlineTitle'),
        parentId: bookOutline.id,
        content: { kind: 'outline', level: 'volume', body: '' },
      })
      actions.assetCreated(document)
      actions.open(document)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setCreating(false)
    }
  }
  const reorderChapters = async (orderedAssetIds: readonly NovelAssetDescriptor['id'][]) => {
    if (sessionId === undefined || state.project === undefined || reordering) return
    const previous = state.assets
    const positions = new Map(orderedAssetIds.map((id, index) => [id, index]))
    const optimistic = [...state.assets].sort((left, right) => {
      if (left.type !== 'manuscript.chapter' || right.type !== 'manuscript.chapter') return 0
      return (positions.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    })
    actions.assetsReordered(optimistic)
    setReordering(true)
    try {
      const assets = await reorder(sessionId, {
        type: 'manuscript.chapter',
        orderedAssetIds,
      })
      actions.assetsReordered(assets)
    } catch (error: unknown) {
      actions.assetsReordered(previous)
      actions.fail(errorMessage(error))
    } finally {
      setReordering(false)
    }
  }
  const deleteAsset = async () => {
    if (sessionId === undefined || deleting || deleteTarget === undefined) return
    const asset = deleteTarget
    setDeleting(true)
    try {
      const result = await deleteRemote(sessionId, { assetId: asset.id, baseRevisionId: asset.revisionId })
      const removedActive = state.active !== undefined && result.deletedAssetIds.includes(state.active)
      actions.assetsDeleted(result.assets, result.deletedAssetIds)
      if (removedActive) {
        const target = result.assets.find(item => item.type === 'manuscript.chapter') ?? result.assets[0]
        if (target !== undefined) actions.open(await open(sessionId, target.id))
      }
      setDeleteTarget(undefined)
    } catch (error: unknown) {
      actions.fail(errorMessage(error))
    } finally {
      setDeleting(false)
    }
  }

  let characterCount: number | undefined
  if (state.document !== undefined && state.draft !== undefined) {
    try { characterCount = renderers.get(state.document.type).reader?.countCharacters(state.draft) }
    catch { characterCount = undefined }
  }
  const manuscripts = state.assets.filter(asset => asset.type.startsWith('manuscript.'))
  const guidance = state.assets.filter(asset => asset.type === 'book.brief'
    || asset.type === 'book.style-profile' || asset.type === 'book.story-state')
  const outlines = state.assets.filter(asset => asset.type === 'planning.outline')
  const roots = outlines.filter(asset => asset.parentId === undefined)
  const other = state.assets.filter(asset => !asset.type.startsWith('manuscript.')
    && asset.type !== 'planning.outline' && asset.type !== 'planning.chapter-outline'
    && asset.type !== 'book.brief' && asset.type !== 'book.style-profile' && asset.type !== 'book.story-state')
  const titleOf = (asset: NovelAssetDescriptor) => asset.id === state.active ? state.titleDraft ?? asset.title : asset.title

  return <div className={css.explorerInner}>
    <header className={css.brand}><button type="button" className={css.homeLink}
      onClick={() => { workbench.openHome() }} aria-label={t('studio')}>
      <span className={css.sidebarBrandLogo} aria-hidden="true" />
    </button></header>
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
          deleteAsset={setDeleteTarget}
          deleting={deleting}
          deleteLabel={t('deleteAsset')}
          labels={{
            title: t('bookGuidance'), items: t('assetUnit'), brief: t('bookBrief'), style: t('bookStyleProfile'),
            storyState: t('bookStoryState'), addBrief: t('addBookBrief'), addStyle: t('addBookStyleProfile'),
            addStoryState: t('addBookStoryState'),
          }}
        />
        <AssetGroup title={t('chapters')} assets={manuscripts} active={state.active} unit={t('chapterUnit')}
          titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')}
          creating={creating} addLabel={t('addChapter')} createAsset={createChapter}
          deleteAsset={setDeleteTarget} deleting={deleting} deleteLabel={t('deleteAsset')}
          reorderAssets={reorderChapters} reorderDisabled={reordering} dragLabel={t('dragChapter')} />
        <OutlineGroup
          roots={roots}
          all={outlines}
          active={state.active}
          titleOf={titleOf}
          openAsset={openAsset}
          createVolumeOutline={createVolumeOutline}
          creating={creating}
          deleteAsset={setDeleteTarget}
          deleting={deleting}
          deleteLabel={t('deleteAsset')}
          labels={{ outline: t('outline'), items: t('assetUnit'), addVolume: t('addVolumeOutline') }}
        />
        {other.length > 0 && <AssetGroup title={t('otherAssets')} assets={other} active={state.active} unit={t('assetUnit')}
          titleOf={titleOf} openAsset={openAsset} characterCount={characterCount} characters={t('characters')}
          deleteAsset={setDeleteTarget} deleting={deleting} deleteLabel={t('deleteAsset')} />}
      </nav>
    </>}
    {deleteTarget === undefined ? null : portal(dialogHost, <DeleteAssetDialog
      title={titleOf(deleteTarget)}
      description={t('deleteAssetConfirm').replace('{title}', titleOf(deleteTarget))}
      busy={deleting}
      cancelLabel={t('cancel')}
      confirmLabel={t('confirmDeleteAsset')}
      close={() => { if (!deleting) setDeleteTarget(undefined) }}
      confirm={() => { void deleteAsset() }}
    />)}
  </div>
}

function BookGuidanceGroup({ assets, active, creating, deleting, titleOf, openAsset, createAsset, deleteAsset, deleteLabel, labels }: {
  readonly assets: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly creating: boolean
  readonly deleting: boolean
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly createAsset: (type: 'book.brief' | 'book.style-profile' | 'book.story-state') => Promise<void>
  readonly deleteAsset: (asset: NovelAssetDescriptor) => void
  readonly deleteLabel: string
  readonly labels: {
    readonly title: string
    readonly items: string
    readonly brief: string
    readonly style: string
    readonly storyState: string
    readonly addBrief: string
    readonly addStyle: string
    readonly addStoryState: string
  }
}) {
  const brief = assets.find(asset => asset.type === 'book.brief')
  const style = assets.find(asset => asset.type === 'book.style-profile')
  const storyState = assets.find(asset => asset.type === 'book.story-state')
  return <details className={css.assetGroup} open>
    <summary><strong>{labels.title}（{assets.length}{labels.items}）</strong>
      <span className={css.groupActions}>
        {brief === undefined && <button type="button" disabled={creating} onClick={(event) => {
          event.preventDefault(); event.stopPropagation(); void createAsset('book.brief')
        }}>＋{labels.addBrief}</button>}
        {style === undefined && <button type="button" disabled={creating} onClick={(event) => {
          event.preventDefault(); event.stopPropagation(); void createAsset('book.style-profile')
        }}>＋{labels.addStyle}</button>}
        {storyState === undefined && <button type="button" disabled={creating} onClick={(event) => {
          event.preventDefault(); event.stopPropagation(); void createAsset('book.story-state')
        }}>＋{labels.addStoryState}</button>}
      </span>
    </summary>
    <div className={css.assetGroupItems}>
      {brief !== undefined && <AssetButton asset={brief} active={active} title={titleOf(brief)} details={labels.brief}
        openAsset={openAsset} deleteAsset={deleteAsset} deleting={deleting} deleteLabel={deleteLabel} />}
      {style !== undefined && <AssetButton asset={style} active={active} title={titleOf(style)} details={labels.style}
        openAsset={openAsset} deleteAsset={deleteAsset} deleting={deleting} deleteLabel={deleteLabel} />}
      {storyState !== undefined && <AssetButton asset={storyState} active={active} title={titleOf(storyState)}
        details={labels.storyState} openAsset={openAsset} deleteAsset={deleteAsset} deleting={deleting} deleteLabel={deleteLabel} />}
    </div>
  </details>
}

function OutlineGroup({ roots, all, active, creating, deleting, titleOf, openAsset, createVolumeOutline,
  deleteAsset, deleteLabel, labels }: {
  readonly roots: readonly NovelAssetDescriptor[]
  readonly all: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly creating: boolean
  readonly deleting: boolean
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly createVolumeOutline: (bookOutline: NovelAssetDescriptor) => Promise<void>
  readonly deleteAsset: (asset: NovelAssetDescriptor) => void
  readonly deleteLabel: string
  readonly labels: { outline: string; items: string; addVolume: string }
}) {
  return <details className={css.assetGroup} open>
    <summary><strong>{labels.outline}（{all.length}{labels.items}）</strong></summary>
    <div className={css.assetGroupItems}>
      {roots.map((root) => {
        const volumes = all.filter(asset => asset.parentId === root.id)
        return <div className={css.outlineBranch} key={root.id}>
          <AssetButton asset={root} active={active} title={titleOf(root)} openAsset={openAsset}
            deleteAsset={deleteAsset} deleting={deleting} deleteLabel={deleteLabel} />
          <div className={css.volumeList}>
            {volumes.map(volume => <AssetButton
              key={volume.id}
              asset={volume}
              active={active}
              title={titleOf(volume)}
              openAsset={openAsset}
              deleteAsset={deleteAsset}
              deleting={deleting}
              deleteLabel={deleteLabel}
            />)}
            <button type="button" className={css.addVolume} disabled={creating}
              onClick={() => { void createVolumeOutline(root) }}>＋{labels.addVolume}</button>
          </div>
        </div>
      })}
    </div>
  </details>
}

function AssetButton({ asset, active, title, openAsset, deleteAsset, deleting, deleteLabel, details, drag }: {
  readonly asset: NovelAssetDescriptor
  readonly active: string | undefined
  readonly title: string
  readonly openAsset: (assetId: string) => void
  readonly deleteAsset: (asset: NovelAssetDescriptor) => void
  readonly deleting: boolean
  readonly deleteLabel: string
  readonly details?: string
  readonly drag?: {
    readonly dragging: boolean
    readonly dropPosition?: 'before' | 'after'
    readonly label: string
    readonly onDragStart: (event: DragEvent<HTMLButtonElement>) => void
    readonly onDragOver: (event: DragEvent<HTMLButtonElement>) => void
    readonly onDragEnd: () => void
    readonly onDrop: (event: DragEvent<HTMLButtonElement>) => void
  }
}) {
  return <div className={css.assetRow} data-active={asset.id === active || undefined}>
    <button type="button" className={css.assetButton} data-active={asset.id === active || undefined}
      draggable={drag !== undefined}
      data-dragging={drag?.dragging || undefined}
      data-drop-position={drag?.dropPosition}
      aria-label={drag === undefined ? undefined : `${title}，${drag.label}`}
      onDragStart={drag?.onDragStart}
      onDragOver={drag?.onDragOver}
      onDragEnd={drag?.onDragEnd}
      onDrop={drag?.onDrop}
      onClick={() => { openAsset(asset.id) }}>
      <span>{title}</span>{details === undefined ? null : <small>{details}</small>}
      {drag === undefined ? null : <i className={css.dragGrip} aria-hidden="true">⋮⋮</i>}
    </button>
    <button className={css.deleteAsset} type="button" disabled={deleting}
      aria-label={`${deleteLabel} ${title}`} title={deleteLabel}
      onClick={() => { deleteAsset(asset) }}>×</button>
  </div>
}

function AssetGroup({
  title, assets, active, unit, titleOf, openAsset, characterCount, characters, creating, addLabel, createAsset,
  reorderAssets, reorderDisabled = false, dragLabel,
  deleteAsset, deleting, deleteLabel,
}: {
  readonly title: string
  readonly assets: readonly NovelAssetDescriptor[]
  readonly active: string | undefined
  readonly unit: string
  readonly titleOf: (asset: NovelAssetDescriptor) => string
  readonly openAsset: (assetId: string) => void
  readonly characterCount: number | undefined
  readonly characters: string
  readonly creating?: boolean
  readonly addLabel?: string
  readonly createAsset?: () => Promise<void>
  readonly reorderAssets?: (orderedAssetIds: readonly NovelAssetDescriptor['id'][]) => Promise<void>
  readonly reorderDisabled?: boolean
  readonly dragLabel?: string
  readonly deleteAsset: (asset: NovelAssetDescriptor) => void
  readonly deleting: boolean
  readonly deleteLabel: string
}) {
  const [draggingId, setDraggingId] = useState<NovelAssetDescriptor['id']>()
  const [dropTarget, setDropTarget] = useState<{ id: NovelAssetDescriptor['id']; position: 'before' | 'after' }>()
  const finishDrag = () => { setDraggingId(undefined); setDropTarget(undefined) }
  const dropAsset = (event: DragEvent<HTMLButtonElement>, targetId: NovelAssetDescriptor['id']) => {
    event.preventDefault()
    const sourceId = draggingId
    const rectangle = event.currentTarget.getBoundingClientRect()
    const observedTarget = {
      id: targetId,
      position: event.clientY < rectangle.top + rectangle.height / 2 ? 'before' as const : 'after' as const,
    }
    const target = dropTarget?.id === targetId ? dropTarget : observedTarget
    finishDrag()
    if (sourceId === undefined || sourceId === targetId || reorderAssets === undefined) return
    const ids = assets.map(asset => asset.id).filter(id => id !== sourceId)
    const targetIndex = ids.indexOf(targetId)
    if (targetIndex < 0) return
    ids.splice(targetIndex + (target.position === 'after' ? 1 : 0), 0, sourceId)
    void reorderAssets(ids)
  }
  return <details className={css.assetGroup} open>
    <summary><strong>{title}（{assets.length}{unit}）</strong>
      {addLabel !== undefined && createAsset !== undefined
        ? <span className={css.groupActions}><button type="button" disabled={creating}
          onClick={(event) => { event.preventDefault(); event.stopPropagation(); void createAsset() }}>＋{addLabel}</button></span>
        : null}
    </summary>
    <div className={css.assetGroupItems}>{assets.map((asset) => {
      const details = asset.id === active && characterCount !== undefined
        ? `${characterCount.toLocaleString()} ${characters}`
        : undefined
      return <AssetButton
        key={asset.id} asset={asset} active={active} title={titleOf(asset)} openAsset={openAsset}
        deleteAsset={deleteAsset} deleting={deleting} deleteLabel={deleteLabel}
        {...(details === undefined ? {} : { details })}
        {...(reorderAssets === undefined || dragLabel === undefined ? {} : { drag: {
          dragging: draggingId === asset.id,
          ...(dropTarget?.id === asset.id ? { dropPosition: dropTarget.position } : {}),
          label: dragLabel,
          onDragStart: (event: DragEvent<HTMLButtonElement>) => {
            if (reorderDisabled) { event.preventDefault(); return }
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/plain', asset.id)
            setDraggingId(asset.id)
          },
          onDragOver: (event: DragEvent<HTMLButtonElement>) => {
            if (draggingId === undefined || draggingId === asset.id || reorderDisabled) return
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            const rectangle = event.currentTarget.getBoundingClientRect()
            setDropTarget({ id: asset.id, position: event.clientY < rectangle.top + rectangle.height / 2 ? 'before' : 'after' })
          },
          onDragEnd: finishDrag,
          onDrop: (event: DragEvent<HTMLButtonElement>) => { dropAsset(event, asset.id) },
        } })}
      />
    })}</div>
  </details>
}

function DeleteAssetDialog({ title, description, busy, cancelLabel, confirmLabel, close, confirm }: {
  readonly title: string
  readonly description: string
  readonly busy: boolean
  readonly cancelLabel: string
  readonly confirmLabel: string
  readonly close: () => void
  readonly confirm: () => void
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('keydown', onKeyDown) }
  }, [close])
  return <div className={css.deleteBackdrop} onMouseDown={(event) => {
    if (event.target === event.currentTarget) close()
  }}>
    <section className={css.deleteDialog} role="dialog" aria-modal="true" aria-labelledby="novel-delete-title">
      <header><span className={css.deleteDialogMark} aria-hidden="true">×</span>
        <div><p>{confirmLabel}</p><h2 id="novel-delete-title">{title}</h2></div></header>
      <p className={css.deleteDialogDescription}>{description}</p>
      <footer><button type="button" disabled={busy} autoFocus onClick={close}>{cancelLabel}</button>
        <button type="button" className={css.deleteConfirm} disabled={busy}
          onClick={confirm}>{confirmLabel}</button></footer>
    </section>
  </div>
}

function portal(host: Element | null, content: ReactNode): ReactNode {
  return host === null ? content : createPortal(content, host)
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error) }
