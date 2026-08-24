/** Browser registration for freeform outline and chapter-plan renderers. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-experimental-novel-workbench/client'
import { createChapterOutlineRenderer, createPlanningOutlineRenderer } from './renderers.tsx'

export { createChapterOutlineRenderer, createPlanningOutlineRenderer } from './renderers.tsx'

export const name = 'novel-asset-outline-client'
export const inject = ['novelAssetRenderers', 'locale']

/** Locale namespace owned by the freeform planning client plugin. */
export const NS = 'novel-asset-outline' as const

/** Simplified Chinese copy for freeform planning surfaces. */
export const zh = {
  outlineEditor: '自由大纲',
  chapterOutlineEditor: '自由章纲',
  outlineTitle: '名称',
  freeformBody: '自由策划内容',
  freeformPlaceholder: '自由写作。可使用标题、列表、表格或任何适合这本书的方法……',
  before: '修改前',
  after: '修改后',
} as const

/** Message keys shared by every supported planning locale. */
export type OutlineLocaleKey = keyof typeof zh

/** English copy for freeform planning surfaces. */
export const en: Record<OutlineLocaleKey, string> = {
  outlineEditor: 'Freeform outline',
  chapterOutlineEditor: 'Freeform chapter plan',
  outlineTitle: 'Name',
  freeformBody: 'Freeform planning content',
  freeformPlaceholder: 'Write freely. Use headings, lists, tables, or any method that fits this book…',
  before: 'Before',
  after: 'After',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'novel-asset-outline': OutlineLocaleKey }
}

/** Register locale copy and both exact planning renderers. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'novel-asset-outline: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.novelAssetRenderers.register(createPlanningOutlineRenderer(t))
  ctx.novelAssetRenderers.register(createChapterOutlineRenderer(t))
}
