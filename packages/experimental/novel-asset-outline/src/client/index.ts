/** Browser registration for the structured outline editor and Diff renderer. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-experimental-novel-workbench/client'
import { createPlanningOutlineRenderer } from './renderers.tsx'

export { createPlanningOutlineRenderer } from './renderers.tsx'

export const name = 'novel-asset-outline-client'
export const inject = ['novelAssetRenderers', 'locale']
/** Locale namespace owned by the outline Asset renderer. */
export const NS = 'novel-asset-outline' as const

/** Chinese product copy for the structured outline surface. */
export const zh = {
  editor: '结构化大纲',
  outlineTitle: '大纲名称',
  tree: '大纲结构',
  empty: '这份大纲还没有节点。请先在 YAML 文件中加入节点。',
  nodeTitle: '节点名称',
  summary: '概要',
  goal: '目标',
  conflict: '冲突',
  turn: '转折',
  optional: '可选',
  before: '修改前',
  after: '修改后',
} as const

/** Stable translation keys shared by both outline dictionaries. */
export type OutlineLocaleKey = keyof typeof zh

/** English product copy for the structured outline surface. */
export const en: Record<OutlineLocaleKey, string> = {
  editor: 'Structured outline',
  outlineTitle: 'Outline title',
  tree: 'Outline structure',
  empty: 'This outline has no nodes yet. Add nodes to its YAML file first.',
  nodeTitle: 'Node title',
  summary: 'Summary',
  goal: 'Goal',
  conflict: 'Conflict',
  turn: 'Turn',
  optional: 'optional',
  before: 'Before',
  after: 'After',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'novel-asset-outline': OutlineLocaleKey
  }
}

/** Register locale copy and the exact `planning.outline` browser renderer. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'novel-asset-outline: dictionaries')
  ctx.novelAssetRenderers.register(createPlanningOutlineRenderer(ctx.locale.bind(NS)))
}
