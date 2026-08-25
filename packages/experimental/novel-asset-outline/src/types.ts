/** Provider-neutral freeform planning values. */

/** The only structural distinction imposed on an outline body. */
export type PlanningOutlineLevel = 'book' | 'volume'

/** Freeform Markdown for one book-level or volume-level outline. */
export interface PlanningOutlineContent {
  readonly kind: 'outline'
  readonly level: PlanningOutlineLevel
  readonly body: string
}

/** Freeform Markdown planning notes bound to one manuscript chapter. */
export interface ChapterOutlineContent {
  readonly kind: 'chapter-outline'
  readonly body: string
}

/** Freeform project-level synopsis and canon boundary for one book. */
export interface BookBriefContent {
  readonly kind: 'book-brief'
  readonly body: string
}

/** Freeform project-level prose, rhythm, and serial-writing guidance. */
export interface BookStyleProfileContent {
  readonly kind: 'book-style-profile'
  readonly body: string
}

declare module '@deepseek-ai/dsh-experimental-novel-repository/types' {
  interface NovelAssetTypeMap {
    'planning.outline': {
      readonly content: PlanningOutlineContent
      readonly selectionInput: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelectionInput
      readonly selector: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelector
      readonly operation: import('@deepseek-ai/dsh-experimental-novel-repository/types').ReplaceTextOperation
    }
    'planning.chapter-outline': {
      readonly content: ChapterOutlineContent
      readonly selectionInput: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelectionInput
      readonly selector: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelector
      readonly operation: import('@deepseek-ai/dsh-experimental-novel-repository/types').ReplaceTextOperation
    }
    'book.brief': {
      readonly content: BookBriefContent
      readonly selectionInput: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelectionInput
      readonly selector: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelector
      readonly operation: import('@deepseek-ai/dsh-experimental-novel-repository/types').ReplaceTextOperation
    }
    'book.style-profile': {
      readonly content: BookStyleProfileContent
      readonly selectionInput: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelectionInput
      readonly selector: import('@deepseek-ai/dsh-experimental-novel-repository/types').TextRangeSelector
      readonly operation: import('@deepseek-ai/dsh-experimental-novel-repository/types').ReplaceTextOperation
    }
  }
}
