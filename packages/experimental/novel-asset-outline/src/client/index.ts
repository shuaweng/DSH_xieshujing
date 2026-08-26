/** Browser registration for freeform planning and book-guidance renderers. */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-experimental-novel-workbench/client'
import {
  createBookBriefRenderer,
  createBookStyleProfileRenderer,
  createChapterOutlineRenderer,
  createPlanningOutlineRenderer,
} from './renderers.tsx'

export {
  createBookBriefRenderer,
  createBookStyleProfileRenderer,
  createChapterOutlineRenderer,
  createPlanningOutlineRenderer,
} from './renderers.tsx'

export const name = 'novel-asset-outline-client'
export const inject = ['novelAssetRenderers', 'locale']

/** Locale namespace owned by the freeform planning client plugin. */
export const NS = 'novel-asset-outline' as const

/** Simplified Chinese copy for freeform planning surfaces. */
export const zh = {
  outlineEditor: '自由大纲',
  chapterOutlineEditor: '自由章纲',
  bookBriefEditor: '本书概述',
  bookStyleProfileEditor: '本书风格',
  outlineTitle: '名称',
  freeformBody: '自由策划内容',
  freeformPlaceholder: '自由写作。可使用标题、列表、表格或任何适合这本书的方法……',
  bookBriefPlaceholder: '自由记录作品定位、读者承诺、主角、核心冲突、世界边界、长线方向与其他全书事实……',
  bookStyleProfilePlaceholder: '自由记录叙事声音、句式节奏、对白、信息释放、连载节奏、钩子、正向范例与明确禁忌……',
  editMarkdown: '编辑',
  readMarkdown: '阅读',
  markdownPreview: 'Markdown 阅读视图',
  before: '修改前',
  after: '修改后',
} as const

/** Message keys shared by every supported planning locale. */
export type OutlineLocaleKey = keyof typeof zh

/** English copy for freeform planning surfaces. */
export const en: Record<OutlineLocaleKey, string> = {
  outlineEditor: 'Freeform outline',
  chapterOutlineEditor: 'Freeform chapter plan',
  bookBriefEditor: 'Book brief',
  bookStyleProfileEditor: 'Book style',
  outlineTitle: 'Name',
  freeformBody: 'Freeform planning content',
  freeformPlaceholder: 'Write freely. Use headings, lists, tables, or any method that fits this book…',
  bookBriefPlaceholder: 'Freely record the premise, reader promise, protagonist, core conflict, world boundaries, long arc, and other book-wide facts…',
  bookStyleProfilePlaceholder: 'Freely record narrative voice, sentence rhythm, dialogue, information release, serial pacing, hooks, positive references, and explicit avoidances…',
  editMarkdown: 'Edit',
  readMarkdown: 'Read',
  markdownPreview: 'Markdown reading view',
  before: 'Before',
  after: 'After',
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { 'novel-asset-outline': OutlineLocaleKey }
}

/** Register locale copy and all exact freeform planning renderers. */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'novel-asset-outline: dictionaries')
  const t = ctx.locale.bind(NS)
  ctx.novelAssetRenderers.register(createPlanningOutlineRenderer(t))
  ctx.novelAssetRenderers.register(createChapterOutlineRenderer(t))
  ctx.novelAssetRenderers.register(createBookBriefRenderer(t))
  ctx.novelAssetRenderers.register(createBookStyleProfileRenderer(t))
}
