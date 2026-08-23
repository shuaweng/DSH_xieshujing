/** Human editor and field-level Diff for structured outline Assets. */

import { useEffect, useMemo, useState } from 'react'
import type { TranslateNS } from '@deepseek-ai/dsh-client-locale/client'
import type { NovelWireValue } from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type {
  NovelAssetEditorProps,
  NovelAssetRendererDefinition,
} from '@deepseek-ai/dsh-experimental-novel-workbench/client'
import type { OutlineNode, OutlineNodeChanges, PlanningOutlineContent } from '../types.ts'
import css from './outline.module.css'

type OutlineTranslate = TranslateNS<'novel-asset-outline'>
type EditableField = 'title' | 'summary' | 'goal' | 'conflict' | 'turn'
const OPTIONAL_FIELDS = ['summary', 'goal', 'conflict', 'turn'] as const

/** Create one localized exact-type renderer contribution. */
export function createPlanningOutlineRenderer(t: OutlineTranslate): NovelAssetRendererDefinition {
  return {
    type: 'planning.outline',
    editorLabel: () => t('editor'),
    renderEditor(props) {
      return <OutlineEditor {...props} t={t} />
    },
    renderDiff(before, operations) {
      const content = outlineContent(before)
      const operation = outlineOperation(operations)
      const node = findNode(content.nodes, operation.nodeId)
      if (node === undefined) throw new Error('novel outline renderer: Diff target node is absent')
      return <OutlineDiff node={node} changes={operation.changes} t={t} />
    },
    describeSelection(selector) {
      if (!isRecord(selector) || selector['kind'] !== 'outline-node' || typeof selector['nodeId'] !== 'string') {
        throw new Error('novel outline renderer: incompatible node selection')
      }
      return selector['nodeId']
    },
  }
}

interface OutlineEditorProps extends NovelAssetEditorProps {
  readonly t: OutlineTranslate
}

function OutlineEditor({ content, title, ariaLabel, onContentChange, onTitleChange, onSelectionChange, t }: OutlineEditorProps) {
  const outline = outlineContent(content)
  const firstId = outline.nodes[0]?.id
  const [selectedId, setSelectedId] = useState<string | undefined>(firstId)
  const selected = useMemo(() => selectedId === undefined ? undefined : findNode(outline.nodes, selectedId), [outline.nodes, selectedId])

  useEffect(() => {
    if (selected !== undefined || firstId === undefined) return
    setSelectedId(firstId)
    onSelectionChange({ kind: 'outline-node', nodeId: firstId })
  }, [firstId, onSelectionChange, selected])

  const choose = (nodeId: string) => {
    setSelectedId(nodeId)
    onSelectionChange({ kind: 'outline-node', nodeId })
  }
  const editNode = (field: EditableField, value: string) => {
    if (selectedId === undefined) return
    const next = updateNode(outline.nodes, selectedId, (node) => {
      if (field === 'title') return { ...node, title: value }
      const optional = value === '' ? undefined : value
      return { ...node, [field]: optional }
    })
    onContentChange({ kind: 'outline', nodes: next } as unknown as NovelWireValue)
  }

  return (
    <section className={css.shell} aria-label={ariaLabel}>
      <header className={css.header}>
        <label>
          <span>{t('outlineTitle')}</span>
          <input value={title} onChange={(event) => { onTitleChange(event.target.value) }} />
        </label>
      </header>
      <div className={css.workspace}>
        <nav className={css.tree} aria-label={t('tree')}>
          {outline.nodes.length === 0
            ? <p>{t('empty')}</p>
            : <OutlineTree nodes={outline.nodes} selectedId={selectedId} choose={choose} />}
        </nav>
        <div className={css.inspector}>
          {selected === undefined ? <p>{t('empty')}</p> : (
            <>
              <Field label={t('nodeTitle')} value={selected.title} onChange={(value) => { editNode('title', value) }} />
              {OPTIONAL_FIELDS.map(field => (
                <Field
                  key={field}
                  label={`${t(field)} · ${t('optional')}`}
                  value={selected[field] ?? ''}
                  multiline
                  onChange={(value) => { editNode(field, value) }}
                />
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  )
}

function OutlineTree({ nodes, selectedId, choose }: {
  readonly nodes: readonly OutlineNode[]
  readonly selectedId: string | undefined
  readonly choose: (nodeId: string) => void
}) {
  return <ul>{nodes.map(node => (
    <li key={node.id}>
      <button type="button" aria-pressed={node.id === selectedId} onClick={() => { choose(node.id) }}>{node.title}</button>
      {node.children.length > 0 && <OutlineTree nodes={node.children} selectedId={selectedId} choose={choose} />}
    </li>
  ))}</ul>
}

function Field({ label, value, multiline = false, onChange }: {
  readonly label: string
  readonly value: string
  readonly multiline?: boolean
  readonly onChange: (value: string) => void
}) {
  return <label className={css.field}>
    <span>{label}</span>
    {multiline
      ? <textarea value={value} rows={3} onChange={(event) => { onChange(event.target.value) }} />
      : <input value={value} onChange={(event) => { onChange(event.target.value) }} />}
  </label>
}

function OutlineDiff({ node, changes, t }: {
  readonly node: OutlineNode
  readonly changes: OutlineNodeChanges
  readonly t: OutlineTranslate
}) {
  return <div className={css.diff}>
    <strong>{node.title}</strong>
    {(['title', ...OPTIONAL_FIELDS] as const).filter(field => field in changes).map(field => (
      <div key={field} className={css.diffRow}>
        <span>{t(field === 'title' ? 'nodeTitle' : field)}</span>
        <del aria-label={t('before')}>{node[field] ?? '—'}</del>
        <ins aria-label={t('after')}>{changes[field] ?? '—'}</ins>
      </div>
    ))}
  </div>
}

function outlineContent(value: NovelWireValue): PlanningOutlineContent {
  if (!isRecord(value) || value['kind'] !== 'outline' || !Array.isArray(value['nodes'])) {
    throw new Error('novel outline renderer: incompatible content')
  }
  return { kind: 'outline', nodes: value['nodes'].map(outlineNode) }
}

function outlineNode(value: NovelWireValue): OutlineNode {
  if (!isRecord(value) || typeof value['id'] !== 'string' || typeof value['title'] !== 'string'
    || !Array.isArray(value['children'])) throw new Error('novel outline renderer: incompatible node')
  const summary = optionalNodeField(value, 'summary')
  const goal = optionalNodeField(value, 'goal')
  const conflict = optionalNodeField(value, 'conflict')
  const turn = optionalNodeField(value, 'turn')
  return {
    id: value['id'], title: value['title'],
    ...(summary === undefined ? {} : { summary }),
    ...(goal === undefined ? {} : { goal }),
    ...(conflict === undefined ? {} : { conflict }),
    ...(turn === undefined ? {} : { turn }),
    children: value['children'].map(outlineNode),
  }
}

function optionalNodeField(value: Readonly<Record<string, NovelWireValue>>, field: typeof OPTIONAL_FIELDS[number]): string | undefined {
  const candidate = value[field]
  if (candidate === undefined) return undefined
  if (typeof candidate !== 'string') throw new Error('novel outline renderer: incompatible node field')
  return candidate
}

function outlineOperation(operations: readonly NovelWireValue[]): { nodeId: string; changes: OutlineNodeChanges } {
  const [raw] = operations
  if (operations.length !== 1 || !isRecord(raw) || raw['kind'] !== 'update-outline-node'
    || !isRecord(raw['selector']) || typeof raw['selector']['nodeId'] !== 'string'
    || !isRecord(raw['changes'])) throw new Error('novel outline renderer: incompatible operation')
  const changes: Record<string, string | null> = {}
  for (const [field, value] of Object.entries(raw['changes'])) {
    if (!['title', ...OPTIONAL_FIELDS].includes(field) || (typeof value !== 'string' && value !== null)) {
      throw new Error('novel outline renderer: incompatible operation changes')
    }
    changes[field] = value
  }
  return { nodeId: raw['selector']['nodeId'], changes }
}

function updateNode(nodes: readonly OutlineNode[], nodeId: string, update: (node: OutlineNode) => OutlineNode): readonly OutlineNode[] {
  return nodes.map(node => node.id === nodeId ? update(node) : { ...node, children: updateNode(node.children, nodeId, update) })
}

function findNode(nodes: readonly OutlineNode[], nodeId: string): OutlineNode | undefined {
  for (const node of nodes) {
    if (node.id === nodeId) return node
    const child = findNode(node.children, nodeId)
    if (child !== undefined) return child
  }
}

function isRecord(value: unknown): value is { [key: string]: NovelWireValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
