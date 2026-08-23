/** Review card replacing the generic row for `novel_propose_changes`. */

import { useEffect, useState } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { NovelChangeSetDescriptor, NovelWireValue } from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelAssetRendererRegistry } from './renderers.tsx'
import css from './workbench.module.css'

const NO_DECISION_EFFECT = (): void => {}

export interface NovelChangeReview {
  changeSet: NovelChangeSetDescriptor
  before: NovelWireValue
}

export interface ChangeSetInjected {
  renderers: NovelAssetRendererRegistry
  read: (sessionId: string, changeSetId: string) => Promise<NovelChangeReview>
  applyChange: (sessionId: string, changeSetId: string) => Promise<NovelChangeSetDescriptor>
  rejectChange: (sessionId: string, changeSetId: string) => Promise<NovelChangeSetDescriptor>
  refreshWorkbench: () => void
}

type ChangeSetCardProps = ToolCallViewProps
  & PropsLocale<'novel-workbench'>
  & InjectFace<ChangeSetInjected>

/** Durable proposal status and explicit accept/reject controls. */
export function ChangeSetCard({ block, sessionId, read, applyChange, rejectChange, refreshWorkbench, renderers, t }: ChangeSetCardProps) {
  const changeSetId = settledChangeSetId(block)
  const [review, setReview] = useState<NovelChangeReview>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (changeSetId === undefined) return
    let live = true
    void read(sessionId, changeSetId).then((value) => { if (live) setReview(value) }).catch((cause: unknown) => {
      if (live) setError(cause instanceof Error ? cause.message : String(cause))
    })
    return () => { live = false }
  }, [changeSetId, read, sessionId])

  const decide = async (decision: 'apply' | 'reject', currentReview: NovelChangeReview) => {
    /* v8 ignore next -- decision controls only render after a valid ChangeSet id has been decoded. */
    if (changeSetId === undefined) return
    setBusy(true)
    try {
      const changeSet = decision === 'apply'
        ? await applyChange(sessionId, changeSetId)
        : await rejectChange(sessionId, changeSetId)
      setReview({ ...currentReview, changeSet })
      const sideEffects: Record<NovelChangeSetDescriptor['status'], () => void> = {
        proposed: NO_DECISION_EFFECT,
        applying: NO_DECISION_EFFECT,
        applied: refreshWorkbench,
        rejected: NO_DECISION_EFFECT,
        conflicted: NO_DECISION_EFFECT,
      }
      sideEffects[changeSet.status]()
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setBusy(false)
    }
  }

  if (changeSetId === undefined) return <div className={css.changeCard}>{t('proposal')}</div>
  const changeSet = review?.changeSet
  const diff = changeSet === undefined || review === undefined
    ? undefined
    : renderers.get(changeSet.assetType).renderDiff(review.before, changeSet.operations)
  return (
    <article className={css.changeCard} data-status={changeSet?.status}>
      <header><strong>{t('proposal')}</strong><span>{changeSet?.summary ?? changeSetId}</span></header>
      {diff}
      {error !== undefined && <p className={css.error}>{error}</p>}
      {review?.changeSet.status === 'proposed' && (
        <footer>
          <button type="button" disabled={busy} onClick={() => { void decide('reject', review) }}>{t('reject')}</button>
          <button type="button" disabled={busy} onClick={() => { void decide('apply', review) }}>{t('accept')}</button>
        </footer>
      )}
      {changeSet?.status === 'applied' && <p>{t('applied')}</p>}
      {changeSet?.status === 'rejected' && <p>{t('rejected')}</p>}
      {changeSet?.status === 'conflicted' && <p className={css.error}>{t('conflicted')}</p>}
    </article>
  )
}

function settledChangeSetId(block: ChangeSetCardProps['block']): string | undefined {
  if (!('kind' in block) || typeof block.meta !== 'object' || block.meta === null) return undefined
  const meta = block.meta as Record<string, unknown>
  return meta['kind'] === 'novel-change-set' && typeof meta['changeSetId'] === 'string'
    ? meta['changeSetId']
    : undefined
}
