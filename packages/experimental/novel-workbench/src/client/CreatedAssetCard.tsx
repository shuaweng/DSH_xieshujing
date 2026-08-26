/** Compact creation result replacing the generic row for `novel_create`. */

import { useEffect } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import css from './workbench.module.css'

export interface CreatedAssetInjected { refreshWorkbench: () => void }
type CreatedAssetCardProps = ToolCallViewProps
  & PropsLocale<'novel-workbench'>
  & InjectFace<CreatedAssetInjected>

/** Refresh the shared catalog and retain a replay-readable creation receipt. */
export function CreatedAssetCard({ block, refreshWorkbench, t }: CreatedAssetCardProps) {
  const meta = createdMeta(block)
  useEffect(() => {
    if (meta !== undefined) refreshWorkbench()
  }, [meta?.assetId, refreshWorkbench])
  return <article className={css.changeCard}>
    <header><strong>{meta?.kind === 'project' ? t('projectInitialized') : t('assetCreated')}</strong>
      <span>{meta?.title ?? t('assetCreated')}</span></header>
    {meta?.kind === 'asset' && <p>{meta.assetType}</p>}
  </article>
}

type CreatedMeta =
  | { kind: 'asset'; assetId: string; assetType: string; title: string }
  | { kind: 'project'; assetId: string; title: string }

function createdMeta(block: CreatedAssetCardProps['block']): CreatedMeta | undefined {
  if (!('kind' in block) || typeof block.meta !== 'object' || block.meta === null) return undefined
  const meta = block.meta as Record<string, unknown>
  if (meta['kind'] === 'novel-asset-created' && typeof meta['assetId'] === 'string'
    && typeof meta['assetType'] === 'string' && typeof meta['title'] === 'string') {
    return { kind: 'asset', assetId: meta['assetId'], assetType: meta['assetType'], title: meta['title'] }
  }
  if (meta['kind'] === 'novel-project-initialized' && typeof meta['projectId'] === 'string'
    && typeof meta['title'] === 'string') {
    return { kind: 'project', assetId: meta['projectId'], title: meta['title'] }
  }
  return undefined
}
