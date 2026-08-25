/** Client registry connecting typed Novel Asset values to human editing surfaces. */

import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Service, type Context } from '@deepseek-ai/cordis'
import type {
  NovelAssetDocument,
  NovelWireValue,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import css from './workbench.module.css'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelAssetRenderers: NovelAssetRendererRegistry
  }
}

/** Props shared by all typed Asset editor contributions. */
export interface NovelAssetEditorProps {
  readonly document: NovelAssetDocument
  readonly content: NovelWireValue
  readonly title: string
  readonly ariaLabel: string
  /** Historical Revisions render through the same typed surface without exposing mutations. */
  readonly readOnly: boolean
  readonly onContentChange: (content: NovelWireValue) => void
  readonly onTitleChange: (title: string) => void
  readonly onSelectionChange: (selection?: NovelWireValue) => void
}

/** Browser behavior contributed by one exact authored Asset type. */
export interface NovelAssetRendererDefinition {
  readonly type: string
  /** Localized editor-kind label used by the shared Canvas accessibility surface. */
  readonly editorLabel?: () => string
  /** Optional human reading presentation supplied by prose-like Asset types. */
  readonly reader?: {
    /** Count authored characters for the active typed value (whitespace excluded). */
    countCharacters(content: NovelWireValue): number
  }
  renderEditor(props: NovelAssetEditorProps): ReactNode
  renderDiff(before: NovelWireValue, operations: readonly NovelWireValue[]): ReactNode
  describeSelection(selector: NovelWireValue): string
}

/** Effect-scoped registry for Asset editors, selection capture, and review rendering. */
export class NovelAssetRendererRegistry extends Service {
  private readonly definitions = new Map<string, NovelAssetRendererDefinition>()

  constructor(ctx: Context) {
    super(ctx, 'novelAssetRenderers')
  }

  /** Register one exact renderer for the calling plugin lifetime. */
  register(definition: NovelAssetRendererDefinition): () => void {
    validateRenderer(definition)
    if (this.definitions.has(definition.type)) {
      throw new Error(`novel Asset renderer ${JSON.stringify(definition.type)} is already registered`)
    }
    const definitions = this.definitions
    definitions.set(definition.type, definition)
    const dispose = this.ctx.effect(() => () => {
      if (definitions.get(definition.type) === definition) definitions.delete(definition.type)
    }, `novelAssetRenderers.register(${JSON.stringify(definition.type)})`)
    return () => { void dispose() }
  }

  /** Resolve the required renderer or fail explicitly instead of showing a misleading generic editor. */
  get(type: string): NovelAssetRendererDefinition {
    const definition = this.definitions.get(type)
    if (definition === undefined) {
      throw new Error(`novel workbench: Asset type ${JSON.stringify(type)} has no registered Client renderer`)
    }
    return definition
  }

  /** List renderer contributions in deterministic type order. */
  list(): readonly NovelAssetRendererDefinition[] {
    return [...this.definitions.values()].sort((left, right) => left.type.localeCompare(right.type))
  }
}

function validateRenderer(definition: NovelAssetRendererDefinition): void {
  if (!/^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u.test(definition.type)) {
    throw new Error(`novel Asset renderer type ${JSON.stringify(definition.type)} must be a dotted lowercase identifier`)
  }
  for (const method of ['renderEditor', 'renderDiff', 'describeSelection'] as const) {
    if (typeof definition[method] !== 'function') {
      throw new Error(`novel Asset renderer ${JSON.stringify(definition.type)} is missing ${method}()`)
    }
  }
  if (definition.editorLabel !== undefined && typeof definition.editorLabel !== 'function') {
    throw new Error(`novel Asset renderer ${JSON.stringify(definition.type)} has an invalid editorLabel`)
  }
}

/** Shipped plain-text editor and Diff projection for `manuscript.chapter`. */
export const manuscriptChapterRenderer: NovelAssetRendererDefinition = {
  type: 'manuscript.chapter',
  reader: {
    countCharacters(content) {
      return Array.from(manuscriptContent(content).body.replace(/\s/gu, '')).length
    },
  },
  renderEditor({ content, ariaLabel, readOnly, onContentChange, onSelectionChange }) {
    const chapter = manuscriptContent(content)
    return <ManuscriptEditor
      body={chapter.body}
      ariaLabel={ariaLabel}
      readOnly={readOnly}
      onContentChange={onContentChange}
      onSelectionChange={onSelectionChange}
    />
  },
  renderDiff(before, operations) {
    const chapter = manuscriptContent(before)
    const [operation] = manuscriptOperations(operations)
    if (operation === undefined || operations.length !== 1) return undefined
    return (
      <div className={css.diff}>
        <del>{chapter.body.slice(operation.selector.startUtf16, operation.selector.endUtf16)}</del>
        <ins>{operation.replacement}</ins>
      </div>
    )
  },
  describeSelection(selector) {
    if (!isWireRecord(selector) || selector['kind'] !== 'text-range'
      || typeof selector['startUtf16'] !== 'number' || typeof selector['endUtf16'] !== 'number') {
      throw new Error('novel workbench: manuscript renderer received an incompatible selection')
    }
    return `${selector['startUtf16']}–${selector['endUtf16']}`
  },
}

interface ManuscriptEditorProps {
  readonly body: string
  readonly ariaLabel: string
  readonly readOnly: boolean
  readonly onContentChange: NovelAssetEditorProps['onContentChange']
  readonly onSelectionChange: NovelAssetEditorProps['onSelectionChange']
}

/** Grow with the manuscript so the workbench viewport owns scrolling instead of the paper textarea. */
function ManuscriptEditor({ body, ariaLabel, readOnly, onContentChange, onSelectionChange }: ManuscriptEditorProps) {
  const editor = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (editor.current === null) return
    editor.current.style.height = '0px'
    editor.current.style.height = `${Math.max(540, editor.current.scrollHeight)}px`
  }, [body])
  return (
    <textarea
      ref={editor}
      className={css.editor}
      aria-label={ariaLabel}
      value={body}
      readOnly={readOnly}
      spellCheck
      onChange={(event) => {
        onContentChange({ kind: 'manuscript', body: event.target.value })
      }}
      onSelect={(event) => {
        const startUtf16 = event.currentTarget.selectionStart
        const endUtf16 = event.currentTarget.selectionEnd
        onSelectionChange(endUtf16 <= startUtf16
          ? undefined
          : { kind: 'text-range', startUtf16, endUtf16 })
      }}
    />
  )
}

function manuscriptContent(content: NovelWireValue): { kind: 'manuscript'; body: string } {
  if (!isWireRecord(content) || content['kind'] !== 'manuscript' || typeof content['body'] !== 'string') {
    throw new Error('novel workbench: manuscript renderer received incompatible content')
  }
  return { kind: 'manuscript', body: content['body'] }
}

interface ManuscriptWireOperation {
  readonly kind: 'replace-text'
  readonly selector: { readonly kind: 'text-range'; readonly startUtf16: number; readonly endUtf16: number }
  readonly replacement: string
}

function manuscriptOperations(operations: readonly NovelWireValue[]): ManuscriptWireOperation[] {
  const decoded: ManuscriptWireOperation[] = []
  for (const operation of operations) {
    if (!isWireRecord(operation) || operation['kind'] !== 'replace-text'
      || !isWireRecord(operation['selector']) || operation['selector']['kind'] !== 'text-range'
      || typeof operation['selector']['startUtf16'] !== 'number'
      || typeof operation['selector']['endUtf16'] !== 'number'
      || typeof operation['replacement'] !== 'string') {
      throw new Error('novel workbench: manuscript renderer received incompatible operations')
    }
    decoded.push({
      kind: 'replace-text',
      selector: {
        kind: 'text-range',
        startUtf16: operation['selector']['startUtf16'],
        endUtf16: operation['selector']['endUtf16'],
      },
      replacement: operation['replacement'],
    })
  }
  return decoded
}

function isWireRecord(value: unknown): value is { [key: string]: NovelWireValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export default NovelAssetRendererRegistry
