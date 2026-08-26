import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { CallId } from '@deepseek-ai/dsh-llm'
import {
  AssetId,
  ChangeSetId,
  ProjectId,
  type RevisionId,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelAssetTypeRegistry from '../../novel-repository/src/asset-types.ts'
import * as NovelAssetOutline from '../../novel-asset-outline/src/index.ts'
import NovelContextResolver, {
  encodeNovelReferenceUri,
} from '../../novel-context/src/index.ts'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import UserApproval, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as ToolNovel from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []
let callNumber = 0

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function harness(): Promise<{
  ctx: Context
  agent: Agent
  path: string
  revisionId: RevisionId
  outlinePath: string
  outlineRevisionId: RevisionId
}> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tool-novel-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'manuscript'))
  await mkdir(join(dir, 'planning'))
  await writeFile(join(dir, 'novel.yaml'), [
    'kind: novel-project',
    'schema: 1',
    'id: project-tool',
    'title: Tool Project',
    'contentRoots:',
    '  manuscript: manuscript',
    '  planning: planning',
    '',
  ].join('\n'))
  const path = join(dir, 'manuscript', 'chapter.md')
  await writeFile(path, [
    '---',
    'novel:',
    '  schema: 1',
    '  id: chapter-tool',
    '  type: manuscript.chapter',
    '  title: Tool Chapter',
    '---',
    '白港下雨了。',
  ].join('\n'))
  const outlinePath = join(dir, 'planning', 'main-outline.md')
  await writeFile(outlinePath, [
    '---',
    'novel:',
    '  schema: 1',
    '  id: outline-tool',
    '  type: planning.outline',
    '  title: Tool Outline',
    '  level: book',
    '---',
    '',
    '# 全书大纲',
    '',
    '主角抵达白港。',
    '',
  ].join('\n'))
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  await ctx.plugin(NovelAssetOutline)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NovelContextResolver)
  ctx.provide('novelAnalysis', { candidateWarning: vi.fn(() => undefined) } as never)
  await ctx.plugin(ToolNovel)
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (project === undefined) throw new Error('expected Novel Project')
  const assets = await ctx.novelRepository.listAssets(project)
  const asset = assets.find(candidate => candidate.asset.id === 'chapter-tool')
  const outline = assets.find(candidate => candidate.asset.id === 'outline-tool')
  if (asset === undefined || outline === undefined) throw new Error('expected chapter and outline Assets')
  const id = SessionId('tool-novel-agent')
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: dir })
  return {
    ctx,
    agent: { id, session, ctx } as Agent,
    path,
    revisionId: asset.revisionId,
    outlinePath,
    outlineRevisionId: outline.revisionId,
  }
}

async function blankHarness(): Promise<{ ctx: Context; agent: Agent; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tool-novel-blank-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  await writeFile(join(dir, 'author-note.txt'), '保留我。')
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  await ctx.plugin(NovelAssetOutline)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(UserApproval)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NovelContextResolver)
  ctx.provide('novelAnalysis', { candidateWarning: vi.fn(() => undefined) } as never)
  await ctx.plugin(ToolNovel)
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const id = SessionId('tool-novel-blank-agent')
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: dir })
  session.append('turn/start', { turn: 1 })
  return { ctx, agent: { id, session, ctx } as Agent, dir }
}

function execute(ctx: Context, agent: Agent | undefined, name: string, args: unknown) {
  return ctx.tools.execute({
    callId: CallId(`novel-call-${++callNumber}`),
    name,
    arguments: args,
    signal: new AbortController().signal,
    ...(agent === undefined ? {} : { agent }),
  })
}

describe('Novel model tools', () => {
  it('registers discovery, exact-read, and proposal tools with explicit proposal guidance', async () => {
    const { ctx, agent } = await harness()
    expect(ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('novel_')).sort())
      .toEqual(['novel_create', 'novel_get', 'novel_initialize_project', 'novel_list', 'novel_present', 'novel_propose_changes', 'novel_search'])
    const assembly = await ctx.systemPrompt.assemble({ scope: agent.ctx })
    expect(renderPrompt(assembly)).toContain('never means the file changed')

    await expect(execute(ctx, agent, 'novel_initialize_project', { title: 'Ignored' }))
      .resolves.toMatchObject({ isError: false, value: { status: 'already-initialized', title: 'Tool Project' } })

    const present = ctx.tools.get('novel_present')!
    expect(present.presentCall?.({ intent: 'open-workbench' })).toEqual({
      card: 'generic', title: '打开小说工作台', kind: 'read',
    })
    expect(present.output.presentationMeta?.({}, { intent: 'open-workbench' })).toEqual({
      kind: 'novel-presentation', intent: 'open-workbench',
    })
    await expect(execute(ctx, agent, 'novel_present', { intent: 'open-workbench' }))
      .resolves.toMatchObject({ isError: false, value: { intent: 'open-workbench' } })

    const read = ctx.tools.get('novel_get')!
    expect(read.output.render({}, { assets: [] })).toEqual([{ type: 'text', text: '[]' }])
    expect(read.presentCall?.({ references: ['dsh-novel:ref'] })).toEqual({
      card: 'generic', title: '读取小说资产', kind: 'read', rawInput: ['dsh-novel:ref'],
    })
    const list = ctx.tools.get('novel_list')!
    expect(list.presentCall?.({})).toEqual({ card: 'generic', title: '浏览小说资产', kind: 'read' })
    const search = ctx.tools.get('novel_search')!
    expect(search.presentCall?.({ query: '白港' })).toEqual({
      card: 'generic', title: '检索小说资产', kind: 'read', rawInput: '白港',
    })
    const create = ctx.tools.get('novel_create')!
    expect(create.presentCall?.({
      type: 'planning.outline',
      title: '第一卷卷纲',
      parent_asset_id: 'outline-tool',
      content: { kind: 'outline', level: 'volume', body: '' },
    })).toEqual({
      card: 'generic', title: '创建小说资产', kind: 'edit', rawInput: '第一卷卷纲',
    })
    const propose = ctx.tools.get('novel_propose_changes')!
    const value = {
      changeSetId: 'changeset-1', projectId: 'project-tool', assetId: 'chapter-tool',
      assetType: 'manuscript.chapter', baseRevisionId: 'revision-1', summary: '摘要', status: 'proposed' as const,
    }
    expect(propose.output.render({}, value as never)).toEqual([{
      type: 'text', text: '已创建修改提案 changeset-1：摘要。等待用户审阅，尚未修改资产。',
    }])
    expect(propose.output.presentationMeta?.({}, value as never)).toMatchObject({
      kind: 'novel-change-set', changeSetId: 'changeset-1', summary: '摘要',
    })
    expect(propose.presentCall?.({
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: 'revision-1',
      operations: [{ kind: 'replace-text', startUtf16: 0, endUtf16: 1, replacement: '新' }],
      summary: '摘要',
    })).toEqual({
      card: 'generic', title: '提出小说修改', kind: 'edit', rawInput: '摘要',
    })
  })

  it('initializes a blank Session directory only after one explicit approval', async () => {
    const { ctx, agent, dir } = await blankHarness()
    const prompted = vi.fn()
    ctx.on('approval/request', (request) => {
      prompted(request)
      return Promise.resolve<ApprovalOutcome>('allowed-once')
    })

    const result = await execute(ctx, agent, 'novel_initialize_project', { title: '国运擂台' })
    expect(result).toMatchObject({
      isError: false,
      value: { status: 'created', title: '国运擂台', manifestPath: expect.stringContaining('novel.yaml') },
    })
    expect(prompted).toHaveBeenCalledWith(expect.objectContaining({
      agent, toolName: 'novel_initialize_project', reason: expect.stringContaining('国运擂台'),
    }))
    expect(await readFile(join(dir, 'author-note.txt'), 'utf8')).toBe('保留我。')
    expect(await readFile(join(dir, 'novel.yaml'), 'utf8')).toContain('title: 国运擂台')
    expect(agent.session.events.map(event => event.type)).toContain('approval/asked')
    expect(agent.session.events.map(event => event.type)).toContain('approval/decided')
  })

  it('discovers the current project and returns canonical exact-Revision references', async () => {
    const { ctx, agent, revisionId } = await harness()
    const result = await execute(ctx, agent, 'novel_list', {})
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected novel_list success')
    expect(result.value).toMatchObject({
      projectId: 'project-tool',
      title: 'Tool Project',
      assets: [
        {
          assetId: 'chapter-tool', revisionId, title: 'Tool Chapter', path: 'manuscript/chapter.md',
        },
        {
          assetId: 'outline-tool', title: 'Tool Outline', path: 'planning/main-outline.md',
          type: 'planning.outline',
        },
      ],
    })
    const value = result.value as { assets: Array<{ reference: string }> }
    expect(value.assets).toHaveLength(2)
    for (const asset of value.assets) expect(asset.reference).toMatch(/^dsh-novel:[A-Za-z0-9_-]+$/u)
    await expect(execute(ctx, undefined, 'novel_list', {})).resolves.toMatchObject({ isError: true })
  })

  it('searches authored model text without injecting or mutating assets', async () => {
    const { ctx, agent, path, revisionId } = await harness()
    const before = await readFile(path, 'utf8')
    const result = await execute(ctx, agent, 'novel_search', { query: '下雨', types: ['manuscript.chapter'] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected novel_search success')
    const value = result.value as { results: Array<{
      assetId: string
      revisionId: string
      title: string
      excerpt: string
      reference: string
    }> }
    expect(value.results[0]).toMatchObject({
      assetId: 'chapter-tool', revisionId, title: 'Tool Chapter',
    })
    expect(value.results[0]?.excerpt).toContain('下雨')
    expect(value.results[0]?.reference)
      .toMatch(/^dsh-novel:[A-Za-z0-9_-]+$/u)
    expect(await readFile(path, 'utf8')).toBe(before)
    await expect(execute(ctx, undefined, 'novel_search', { query: '下雨' }))
      .resolves.toMatchObject({ isError: true })
  })

  it('reads canonical retained references and rejects calls without an owning Agent', async () => {
    const { ctx, agent, revisionId } = await harness()
    const uri = encodeNovelReferenceUri({
      projectId: ProjectId('project-tool'),
      assetId: AssetId('chapter-tool'),
      revisionId,
    })
    const result = await execute(ctx, agent, 'novel_get', { references: [uri] })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected novel_get success')
    expect(result.value).toMatchObject({
      assets: [{
        projectId: 'project-tool', assetId: 'chapter-tool', text: '白港下雨了。', utf16Length: 6,
      }],
    })
    await expect(execute(ctx, undefined, 'novel_get', { references: [uri] }))
      .resolves.toMatchObject({ isError: true })
    await expect(execute(ctx, agent, 'novel_get', { references: [] }))
      .resolves.toMatchObject({ isError: true })
  })

  it('creates a durable proposal and presentation card without changing the authored file', async () => {
    const { ctx, agent, path, revisionId } = await harness()
    const analysis = ctx.novelAnalysis as unknown as {
      candidateWarning: ReturnType<typeof vi.fn>
    }
    analysis.candidateWarning.mockReturnValue({
      report: {
        version: 1,
        characterCount: 1_200,
        sampleLevel: 'strong',
        riskScore: 74,
        counts: { high: 4, medium: 1, low: 0 },
        findings: [],
      },
      text: '<novel-noai-candidate-warning>NOAI candidate risk 74/100</novel-noai-candidate-warning>',
    })
    const before = await readFile(path, 'utf8')
    const result = await execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool',
      asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      operations: [{ kind: 'replace-text', startUtf16: 2, endUtf16: 4, replacement: '放晴' }],
      summary: '把天气改为放晴',
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected proposal success')
    const value: unknown = result.value
    if (typeof value !== 'object' || value === null || !('changeSetId' in value) || typeof value.changeSetId !== 'string') {
      throw new Error('proposal result is missing a ChangeSet id')
    }
    expect(value).toMatchObject({
      projectId: 'project-tool',
      assetId: 'chapter-tool',
      baseRevisionId: revisionId,
      status: 'proposed',
    })
    expect(result.meta).toMatchObject({
      kind: 'novel-change-set',
      changeSetId: value.changeSetId,
      projectId: 'project-tool',
    })
    const additionalContexts: unknown = result.additionalContexts
    expect(additionalContexts).toMatchObject([{
      source: {
        kind: 'plugin', plugin: 'novel-analysis', form: 'notice', summary: 'NOAI candidate risk 74/100',
      },
      content: [{ type: 'text' }],
    }])
    expect(JSON.stringify(additionalContexts)).toContain('NOAI candidate risk 74/100')
    expect(await readFile(path, 'utf8')).toBe(before)
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const retained = await ctx.novelRepository.readChangeSet(project, ChangeSetId(value.changeSetId))
    expect(retained).toMatchObject({
      status: 'proposed',
      actor: { kind: 'agent', sessionId: agent.id },
    })
    const [operation] = retained.operations
    if (operation?.kind !== 'replace-text') throw new Error('expected retained manuscript operation')
    expect(operation.selector.quoteHash).toMatch(/^sha256:[0-9a-f]{64}$/u)

    await expect(execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: revisionId,
      operations: [{ kind: 'replace-text', startUtf16: 4, endUtf16: 2, replacement: '放晴' }], summary: '摘要',
    })).resolves.toMatchObject({ isError: true })

    await expect(execute(ctx, undefined, 'novel_propose_changes', {
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: revisionId,
      operations: [{ kind: 'replace-text', startUtf16: 2, endUtf16: 4, replacement: '放晴' }], summary: '摘要',
    })).resolves.toMatchObject({ isError: true })
  })

  it('creates a volume outline through the typed creation tool', async () => {
    const { ctx, agent } = await harness()
    const created = await execute(ctx, agent, 'novel_create', {
      type: 'planning.outline',
      title: '第一卷卷纲',
      parent_asset_id: 'outline-tool',
      content: { kind: 'outline', level: 'volume', body: '# 第一卷\n\n围绕雨夜来客自由展开。' },
    })
    expect(created.isError).toBe(false)
    if (created.isError) throw new Error('expected novel_create success')
    expect(created.value).toMatchObject({
      projectId: 'project-tool',
      type: 'planning.outline',
      parentAssetId: 'outline-tool',
      title: '第一卷卷纲',
    })
    expect(created.meta).toMatchObject({ kind: 'novel-asset-created', assetType: 'planning.outline' })

    const list = await execute(ctx, agent, 'novel_list', {})
    expect(list.isError).toBe(false)
    if (list.isError) throw new Error('expected novel_list success')
    const assets = (list.value as { assets: Array<{ title: string; parentAssetId?: string }> }).assets
    expect(assets).toContainEqual(expect.objectContaining({ title: '第一卷卷纲', parentAssetId: 'outline-tool' }))
  })

  it('reads and proposes an exact freeform outline replacement through the generic tools', async () => {
    const { ctx, agent, outlinePath, outlineRevisionId } = await harness()
    const uri = encodeNovelReferenceUri({
      projectId: ProjectId('project-tool'),
      assetId: AssetId('outline-tool'),
      revisionId: outlineRevisionId,
    })
    const read = await execute(ctx, agent, 'novel_get', { references: [uri] })
    expect(read.isError).toBe(false)
    if (read.isError) throw new Error('expected outline novel_get success')
    const readValue = read.value as { assets: Array<{ text: string; proposalInstructions: string }> }
    expect(readValue.assets[0]!.text).toBe('# 全书大纲\n\n主角抵达白港。\n')
    expect(readValue.assets[0]!.proposalInstructions).toContain('replace-text')

    const before = await readFile(outlinePath, 'utf8')
    const proposed = await execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool',
      asset_id: 'outline-tool',
      base_revision_id: outlineRevisionId,
      operations: [{
        kind: 'replace-text',
        startUtf16: '# 全书大纲\n\n主角'.length,
        endUtf16: '# 全书大纲\n\n主角抵达'.length,
        replacement: '在雨夜抵达',
      }],
      summary: '补充雨夜氛围',
    })
    expect(proposed.isError).toBe(false)
    if (proposed.isError) throw new Error('expected outline proposal success')
    expect(await readFile(outlinePath, 'utf8')).toBe(before)
    const value = proposed.value as { changeSetId: string }
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const retained = await ctx.novelRepository.readChangeSet(project, ChangeSetId(value.changeSetId))
    expect(retained.assetType).toBe('planning.outline')
    const [operation] = retained.operations
    if (operation?.kind !== 'replace-text') throw new Error('expected retained outline operation')
    expect(operation.selector).toMatchObject({ kind: 'text-range' })
    expect(operation.selector.quoteHash).toMatch(/^sha256:/u)
  })
})
