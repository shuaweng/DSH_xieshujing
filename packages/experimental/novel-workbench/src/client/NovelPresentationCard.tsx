/** Tool-result presentation bridge for explicit Agent workbench intents. */

import { useEffect } from 'react'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import css from './workbench.module.css'

export interface NovelPresentationInjected {
  present: (intent: 'open-workbench' | 'close-workbench') => void
}

type NovelPresentationCardProps = ToolCallViewProps
  & PropsLocale<'novel-workbench'>
  & InjectFace<NovelPresentationInjected>

/** Apply only typed, logged presentation metadata; ordinary prose never controls the frame. */
export function NovelPresentationCard({ block, present, t }: NovelPresentationCardProps) {
  const intent = presentationIntent(block)
  useEffect(() => {
    if (intent !== undefined) present(intent)
  }, [intent, present])
  if (intent === undefined) return null
  return (
    <article className={css.presentationCard} data-intent={intent}>
      {intent === 'close-workbench' ? t('agentClosedWorkbench') : t('agentOpenedWorkbench')}
    </article>
  )
}

function presentationIntent(block: NovelPresentationCardProps['block']): 'open-workbench' | 'close-workbench' | undefined {
  if (!('kind' in block) || typeof block.meta !== 'object' || block.meta === null) return undefined
  const meta = block.meta as Record<string, unknown>
  if (meta['kind'] !== 'novel-presentation') return undefined
  return meta['intent'] === 'open-workbench' || meta['intent'] === 'close-workbench'
    ? meta['intent']
    : undefined
}
