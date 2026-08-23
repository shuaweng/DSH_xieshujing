import { createHash } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import {
  ProjectId,
  RevisionId,
  type AssetSnapshot,
  type ContentHash,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import NovelAssetTypeRegistry from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import {
  apply,
  parseOutline,
  planningOutlineTypeDefinition,
  type PlanningOutlineContent,
} from '../src/index.ts'

const PATH = 'planning/main-outline.yaml'

function source(overrides: readonly string[] = []): Uint8Array {
  return new TextEncoder().encode([
    '# retained project note',
    'novel:',
    '  schema: 1',
    '  id: outline-main',
    '  type: planning.outline',
    '  title: 主线大纲',
    'custom: retained',
    'nodes:',
    '  - id: volume-1',
    '    title: 第一卷',
    '    summary: 主角进入白港。',
    '    children:',
    '      - id: chapter-1',
    '        title: 第一章',
    '        goal: 找到失踪者留下的线索。',
    '        children: []',
    ...overrides,
    '',
  ].join('\n'))
}

function snapshot(bytes = source()): AssetSnapshot {
  const parsed = parseOutline(bytes, PATH)
  return {
    asset: {
      id: parsed.id,
      projectId: ProjectId('project-white-harbor'),
      type: parsed.type,
      projectRelativePath: PATH,
    },
    revisionId: RevisionId('revision-outline-1'),
    serializedUtf8: bytes,
    contentHash: hash(bytes),
    frontmatter: parsed.frontmatter,
    content: parsed.content,
  }
}

function hash(bytes: Uint8Array): ContentHash {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`
}

describe('planning.outline Host definition', () => {
  it('registers independently for one plugin lifetime', async () => {
    const ctx = new Context()
    const registry = ctx.plugin(NovelAssetTypeRegistry)
    await registry
    const contribution = ctx.plugin({ inject: ['novelAssetTypes'], apply })
    await contribution
    expect(ctx.novelAssetTypes.get('planning.outline')).toBe(planningOutlineTypeDefinition)
    await contribution.dispose()
    expect(() => ctx.novelAssetTypes.get('planning.outline')).toThrow(/no registered Host definition/u)
    await registry.dispose()
  })

  it('parses a strict tree, freezes an exact node, and projects deterministic model JSON', () => {
    const retained = snapshot()
    const content = retained.content as PlanningOutlineContent
    expect(content.nodes[0]).toMatchObject({ id: 'volume-1', children: [{ id: 'chapter-1' }] })
    const captured = planningOutlineTypeDefinition.captureSelection(
      retained,
      { kind: 'outline-node', nodeId: 'chapter-1' },
      { contextUnits: 0, previewUnits: 160 },
    )
    expect(captured.selector).toMatchObject({ kind: 'outline-node', nodeId: 'chapter-1' })
    if (captured.selector.kind !== 'outline-node') throw new Error('expected outline-node selector')
    expect(captured.selector.nodeHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(captured.preview).toBe('第一章')
    expect(JSON.parse(planningOutlineTypeDefinition.modelText(retained, captured.selector))).toMatchObject({
      kind: 'outline-node',
      outlineTitle: '主线大纲',
      node: { id: 'chapter-1', goal: '找到失踪者留下的线索。' },
    })
    expect(planningOutlineTypeDefinition.modelText(retained)).toBe(planningOutlineTypeDefinition.modelText(retained))
  })

  it('materializes one typed field update and preserves unrelated top-level YAML', () => {
    const retained = snapshot()
    const operations = planningOutlineTypeDefinition.prepareOperations(retained, [{
      kind: 'update-outline-node',
      nodeId: 'chapter-1',
      changes: { summary: '雨夜抵达白港。', goal: null },
    }])
    const materialized = planningOutlineTypeDefinition.materializeOperations(retained, operations)
    const text = new TextDecoder().decode(materialized.serializedUtf8)
    expect(text).toContain('# retained project note')
    expect(text).toContain('custom: retained')
    const chapter = ((materialized.parsed.content as PlanningOutlineContent).nodes[0]?.children[0])
    expect(chapter).toMatchObject({ id: 'chapter-1', summary: '雨夜抵达白港。' })
    expect(chapter).not.toHaveProperty('goal')

    const stale = structuredClone(operations) as unknown as Array<Record<string, unknown>>
    const selector = stale[0]?.['selector'] as Record<string, unknown>
    selector['nodeHash'] = `sha256:${'0'.repeat(64)}`
    expect(() => planningOutlineTypeDefinition.materializeOperations(retained, stale as never)).toThrow(/node hash/u)
  })

  it('rejects duplicate node ids, unsupported fields, and empty change mappings', () => {
    const duplicate = new TextEncoder().encode([
      'novel:', '  schema: 1', '  id: duplicate', '  type: planning.outline', '  title: Duplicate',
      'nodes:', '  - id: same', '    title: A', '    children: []',
      '  - id: same', '    title: B', '    children: []', '',
    ].join('\n'))
    expect(() => parseOutline(duplicate, PATH)).toThrow(/duplicated/u)

    const unknown = new TextEncoder().encode([
      'novel:', '  schema: 1', '  id: unknown', '  type: planning.outline', '  title: Unknown',
      'nodes:', '  - id: n1', '    title: A', '    color: red', '    children: []', '',
    ].join('\n'))
    expect(() => parseOutline(unknown, PATH)).toThrow(/unsupported field/u)
    expect(() => planningOutlineTypeDefinition.prepareOperations(snapshot(), [{
      kind: 'update-outline-node', nodeId: 'chapter-1', changes: {},
    }])).toThrow(/at least one field/u)
  })
})
