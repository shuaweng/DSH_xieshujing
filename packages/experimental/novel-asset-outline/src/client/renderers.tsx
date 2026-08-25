/** Freeform planning editors and exact text Diffs. */

import { useLayoutEffect, useRef } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { NovelWireValue } from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type {
  NovelAssetEditorProps,
  NovelAssetRendererDefinition,
} from '@deepseek-ai/dsh-experimental-novel-workbench/client'
import css from './outline.module.css'

type OutlineTranslate = TranslateNS<'novel-asset-outline'>

/** Create the freeform book/volume outline renderer. */
export function createPlanningOutlineRenderer(t: OutlineTranslate): NovelAssetRendererDefinition {
  return freeformRenderer('planning.outline', t('outlineEditor'), t('freeformPlaceholder'), outlineContent, t)
}

/** Create the freeform chapter-plan renderer used by proposal review and direct navigation. */
export function createChapterOutlineRenderer(t: OutlineTranslate): NovelAssetRendererDefinition {
  return freeformRenderer('planning.chapter-outline', t('chapterOutlineEditor'), t('freeformPlaceholder'), chapterContent, t)
}

/** Create the project-singleton book-brief renderer. */
export function createBookBriefRenderer(t: OutlineTranslate): NovelAssetRendererDefinition {
  return freeformRenderer('book.brief', t('bookBriefEditor'), t('bookBriefPlaceholder'), bookBriefContent, t)
}

/** Create the project-singleton style-profile renderer. */
export function createBookStyleProfileRenderer(t: OutlineTranslate): NovelAssetRendererDefinition {
  return freeformRenderer(
    'book.style-profile',
    t('bookStyleProfileEditor'),
    t('bookStyleProfilePlaceholder'),
    bookStyleProfileContent,
    t,
  )
}

function freeformRenderer(
  type: 'planning.outline' | 'planning.chapter-outline' | 'book.brief' | 'book.style-profile',
  label: string,
  placeholder: string,
  decode: (value: NovelWireValue) => {
    readonly body: string
    readonly withBody: (body: string) => NovelWireValue
  },
  t: OutlineTranslate,
): NovelAssetRendererDefinition {
  return {
    type,
    editorLabel: () => label,
    renderEditor(props) {
      const value = decode(props.content)
      return <FreeformEditor {...props} body={value.body} contentOf={value.withBody} placeholder={placeholder} t={t} />
    },
    renderDiff(before, operations) {
      const body = decode(before).body
      const operation = textOperation(operations)
      return <div className={css.diff}>
        <del aria-label={t('before')}>{body.slice(operation.start, operation.end)}</del>
        <ins aria-label={t('after')}>{operation.replacement}</ins>
      </div>
    },
    describeSelection(selector) {
      if (!isRecord(selector) || selector['kind'] !== 'text-range'
        || typeof selector['startUtf16'] !== 'number' || typeof selector['endUtf16'] !== 'number') {
        throw new Error('novel planning renderer: incompatible text selection')
      }
      return `${selector['startUtf16']}–${selector['endUtf16']}`
    },
  }
}

function FreeformEditor({
  body, title, ariaLabel, readOnly, onContentChange, onTitleChange, onSelectionChange, contentOf, placeholder, t,
}: NovelAssetEditorProps & {
  readonly body: string
  readonly contentOf: (body: string) => NovelWireValue
  readonly placeholder: string
  readonly t: OutlineTranslate
}) {
  const editor = useRef<HTMLTextAreaElement>(null)
  const captureSelection = (target: HTMLTextAreaElement) => {
    const startUtf16 = target.selectionStart
    const endUtf16 = target.selectionEnd
    onSelectionChange(endUtf16 <= startUtf16 ? undefined : { kind: 'text-range', startUtf16, endUtf16 })
  }
  useLayoutEffect(() => {
    if (editor.current === null) return
    editor.current.style.height = '0px'
    editor.current.style.height = `${Math.max(620, editor.current.scrollHeight)}px`
  }, [body])
  return <section className={css.shell} aria-label={ariaLabel}>
    <label className={css.titleField}>
      <span>{t('outlineTitle')}</span>
      <input value={title} readOnly={readOnly} onChange={(event) => { onTitleChange(event.target.value) }} />
    </label>
    <textarea
      ref={editor}
      className={css.editor}
      aria-label={t('freeformBody')}
      value={body}
      readOnly={readOnly}
      placeholder={placeholder}
      spellCheck
      onChange={(event) => { onContentChange(contentOf(event.target.value)) }}
      onSelect={(event) => { captureSelection(event.currentTarget) }}
      onKeyUp={(event) => { captureSelection(event.currentTarget) }}
      onPointerUp={(event) => { captureSelection(event.currentTarget) }}
    />
  </section>
}

function outlineContent(value: NovelWireValue): { body: string; withBody: (body: string) => NovelWireValue } {
  if (!isRecord(value) || value['kind'] !== 'outline' || (value['level'] !== 'book' && value['level'] !== 'volume')
    || typeof value['body'] !== 'string') throw new Error('novel planning renderer: incompatible outline content')
  const level = value['level']
  return { body: value['body'], withBody: body => ({ kind: 'outline', level, body }) }
}

function chapterContent(value: NovelWireValue): { body: string; withBody: (body: string) => NovelWireValue } {
  if (!isRecord(value) || value['kind'] !== 'chapter-outline' || typeof value['body'] !== 'string') {
    throw new Error('novel planning renderer: incompatible chapter-outline content')
  }
  return { body: value['body'], withBody: body => ({ kind: 'chapter-outline', body }) }
}

function bookBriefContent(value: NovelWireValue): { body: string; withBody: (body: string) => NovelWireValue } {
  return exactFreeformContent(value, 'book-brief')
}

function bookStyleProfileContent(value: NovelWireValue): { body: string; withBody: (body: string) => NovelWireValue } {
  return exactFreeformContent(value, 'book-style-profile')
}

function exactFreeformContent(
  value: NovelWireValue,
  kind: 'book-brief' | 'book-style-profile',
): { body: string; withBody: (body: string) => NovelWireValue } {
  if (!isRecord(value) || value['kind'] !== kind || typeof value['body'] !== 'string') {
    throw new Error(`novel planning renderer: incompatible ${kind} content`)
  }
  return { body: value['body'], withBody: body => ({ kind, body }) }
}

function textOperation(operations: readonly NovelWireValue[]): { start: number; end: number; replacement: string } {
  const [operation] = operations
  if (operations.length !== 1 || !isRecord(operation) || operation['kind'] !== 'replace-text'
    || !isRecord(operation['selector']) || typeof operation['selector']['startUtf16'] !== 'number'
    || typeof operation['selector']['endUtf16'] !== 'number' || typeof operation['replacement'] !== 'string') {
    throw new Error('novel planning renderer: incompatible operation')
  }
  return {
    start: operation['selector']['startUtf16'],
    end: operation['selector']['endUtf16'],
    replacement: operation['replacement'],
  }
}

function isRecord(value: unknown): value is { [key: string]: NovelWireValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
