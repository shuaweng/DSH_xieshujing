import { Context } from '@deepseek-ai/cordis'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { ToolCallId, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
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
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import UserApproval, {
  type ApprovalOutcome,
  type ApprovalRequest,
} from '@deepseek-ai/dsh-user-approval'
import UserQuestionService, { type AskUserQuestionRequest } from '@deepseek-ai/dsh-user-questions'
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
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  await ctx.plugin(NovelAssetOutline)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NovelContextResolver)
  ctx.provide('novelAnalysis', { candidateWarning: vi.fn(() => undefined) } as never)
  const toolFiber = ctx.plugin(ToolNovel)
  await toolFiber.await()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (project === undefined) throw new Error('expected Novel Project')
  const assets = await ctx.novelRepository.listAssets(project)
  const asset = assets.find(candidate => candidate.asset.id === 'chapter-tool')
  const outline = assets.find(candidate => candidate.asset.id === 'outline-tool')
  if (asset === undefined || outline === undefined) throw new Error('expected chapter and outline Assets')
  const id = SessionId('tool-novel-agent')
  const session = Session.create(id, [], {
    version: 0, id, createdAt: 0, cwd: dir, agentPreset: 'novel-workbench',
  })
  const agent = { id, session, ctx } as Agent
  ctx.agents.register(agent)
  return {
    ctx,
    agent,
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
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  await ctx.plugin(NovelAssetOutline)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(UserApproval)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NovelContextResolver)
  ctx.provide('novelAnalysis', { candidateWarning: vi.fn(() => undefined) } as never)
  const toolFiber = ctx.plugin(ToolNovel)
  await toolFiber.await()
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const id = SessionId('tool-novel-blank-agent')
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: dir })
  session.append('turn/start', { turn: 1 })
  return { ctx, agent: { id, session, ctx } as Agent, dir }
}

function execute(
  ctx: Context,
  agent: Agent | undefined,
  name: string,
  args: unknown,
  callId = ToolCallId(`novel-call-${++callNumber}`),
) {
  return ctx.tools.execute({
    callId,
    name,
    arguments: args,
    signal: new AbortController().signal,
    ...(agent === undefined ? {} : { agent }),
  })
}

function prepareChapterWritingTurn(
  agent: Agent,
  turn: number,
  manifestId: `sha256:${string}`,
  revisionId: RevisionId,
): void {
  const skillCallId = ToolCallId(`skill-chapter-execution-${turn}`)
  agent.session.append('turn/start', { turn })
  agent.session.append('step/start', { turn, step: 1 })
  agent.session.append('request/header', {
    header: { config: { provider: 'test-provider', model: 'test-writer' } }, reason: 'initial',
  })
  agent.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '<novel-context>frozen material</novel-context>' }],
    source: {
      kind: 'novel-context', form: 'manifest', version: 3, manifestId,
      projectId: ProjectId('project-tool'), policies: ['chapter-write'], references: [{
        assetId: AssetId('chapter-tool'), revisionId, label: 'Tool Chapter', type: 'manuscript.chapter',
        origin: 'message', mode: 'explicit', projection: 'full', reason: 'target-asset',
        contentHash: `sha256:${'0'.repeat(64)}`, modelTextBytes: 21,
      }],
    },
  }), { surfaceOp: 'append' })
  agent.session.append('tool/call', {
    turn, step: 1, callId: skillCallId, name: 'skill', arguments: '{"name":"chapter-execution"}',
  })
  agent.session.append('tool/result', {
    turn, step: 1,
    message: createToolResultMessage({
      callId: skillCallId, content: [{ type: 'text', text: 'loaded' }], isError: false,
    }),
  }, { surfaceOp: 'append' })
}

function prepareDirectChapterTurn(agent: Agent, turn: number, revisionId: RevisionId): void {
  agent.session.append('turn/start', { turn })
  agent.session.append('step/start', { turn, step: 1 })
  agent.session.append('request/header', {
    header: { config: { provider: 'test-provider', model: 'test-writer' } }, reason: 'initial',
  })
  agent.session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '<novel-context>coordinate only</novel-context>' }],
    source: {
      kind: 'novel-context', form: 'manifest', version: 3,
      manifestId: `sha256:${'d'.repeat(64)}`,
      projectId: ProjectId('project-tool'), policies: ['direct-turn'], references: [{
        assetId: AssetId('chapter-tool'), revisionId, label: 'Tool Chapter', type: 'manuscript.chapter',
        origin: 'active-asset', mode: 'follow', projection: 'coordinate', reason: 'active-asset',
        contentHash: `sha256:${'1'.repeat(64)}`, modelTextBytes: 0,
      }],
    },
  }), { surfaceOp: 'append' })
}

function appendSuccessfulToolResult(
  agent: Agent,
  input: {
    readonly turn: number
    readonly step: number
    readonly callId: ReturnType<typeof ToolCallId>
    readonly name: string
    readonly args: unknown
    readonly content: readonly { readonly type: 'text'; readonly text: string }[]
    readonly meta?: unknown
  },
): void {
  agent.session.append('tool/call', {
    turn: input.turn,
    step: input.step,
    callId: input.callId,
    name: input.name,
    arguments: JSON.stringify(input.args),
  })
  agent.session.append('tool/result', {
    turn: input.turn,
    step: input.step,
    message: createToolResultMessage({
      callId: input.callId,
      content: [...input.content],
      isError: false,
    }),
    ...(input.meta === undefined ? {} : { meta: input.meta as never }),
  }, { surfaceOp: 'append' })
}

describe('Novel model tools', () => {
  it('registers discovery, exact-read, and proposal tools with explicit proposal guidance', async () => {
    const { ctx, agent } = await harness()
    expect(ctx.tools.schemas().map(schema => schema.name).filter(name => name.startsWith('novel_')).sort())
      .toEqual(['novel_choose_scene_action', 'novel_create', 'novel_get', 'novel_get_analysis', 'novel_initialize_project', 'novel_list', 'novel_present', 'novel_propose_changes', 'novel_search'])
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

    const choose = ctx.tools.get('novel_choose_scene_action')!
    expect(choose.presentCall?.({ selection_mode: 'user', goal: '怎样试探徐闻？', options: [] })).toEqual({
      card: 'generic', title: '请作者选择场景行动', kind: 'read', rawInput: '怎样试探徐闻？',
    })

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
    const prompted = vi.fn<(request: ApprovalRequest) => void>()
    ctx.on('approval/request', (request) => {
      prompted(request)
      return Promise.resolve<ApprovalOutcome>('allowed-once')
    })

    const result = await execute(ctx, agent, 'novel_initialize_project', {
      title: '国运擂台',
      description: '神明擂台降临，华夏以失落神话迎战。',
    })
    expect(result).toMatchObject({
      isError: false,
    })
    const initialized = result.value as { manifestPath: string; status: string; title: string }
    expect(initialized.status).toBe('created')
    expect(initialized.title).toBe('国运擂台')
    expect(initialized.manifestPath.endsWith('/novel.yaml')).toBe(true)
    expect(prompted).toHaveBeenCalledTimes(1)
    const request = prompted.mock.calls[0]![0]
    expect(request.agent).toBe(agent)
    expect(request.toolName).toBe('novel_initialize_project')
    expect(request.reason).toBe(
      'Initialize the current working directory as Novel Project “国运擂台”; existing files will be preserved.',
    )
    expect(await readFile(join(dir, 'author-note.txt'), 'utf8')).toBe('保留我。')
    expect(await readFile(join(dir, 'novel.yaml'), 'utf8')).toContain('title: 国运擂台')
    expect(await readFile(join(dir, 'novel.yaml'), 'utf8')).toContain('description: 神明擂台降临，华夏以失落神话迎战。')
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

  it('uses the native DSH question seam for author-owned scene selection', async () => {
    const { ctx, agent, revisionId } = await harness()
    const manifestId = `sha256:${'b'.repeat(64)}` as const
    prepareChapterWritingTurn(agent, 2, manifestId, revisionId)
    const requests: AskUserQuestionRequest[] = []
    ctx.on('user-questions/request', async (request) => {
      requests.push(request)
      return { answers: [{ id: 'scene-action', selected: ['2. 说错日期试探'] }] }
    })
    const callId = ToolCallId('scene-choice-user')
    const result = await execute(ctx, agent, 'novel_choose_scene_action', {
      selection_mode: 'user',
      goal: '林澈应该怎样确认徐闻知道旧案？',
      target_asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      options: [
        {
          id: 'direct-question', title: '直接质问',
          action: '林澈正面追问，徐闻立即封闭信息。', tradeoff: '冲突快，但不符合谨慎性格。',
        },
        {
          id: 'wrong-date-test', title: '说错日期试探',
          action: '林澈故意报错日期，徐闻下意识纠正，怀疑由动作产生。', tradeoff: '潜台词更强，但需要控制解释。',
        },
      ],
    }, callId)
    if (result.isError) throw new Error(`expected user scene choice success: ${JSON.stringify(result)}`)
    expect(requests).toHaveLength(1)
    expect(requests[0]?.agent).toBe(agent)
    expect(requests[0]?.questions).toMatchObject([{
      id: 'scene-action', header: '场景行动选择', question: '林澈应该怎样确认徐闻知道旧案？',
      options: [
        { label: '1. 直接质问' },
        { label: '2. 说错日期试探' },
      ],
    }])
    expect(result.value).toMatchObject({
      decisionCallId: callId,
      selectionMode: 'user',
      optionCount: 2,
      selectedOptionId: 'wrong-date-test',
      selectedOptionIndex: 2,
      contextManifestId: manifestId,
      writingSkill: 'chapter-execution',
    })
    expect(result.meta).toMatchObject({
      kind: 'novel-scene-action-decision', decisionCallId: callId, selectionMode: 'user',
    })
  })

  it('reuses the active Session writing Skill and refreshes an exact chapter-write Manifest', async () => {
    const { ctx, agent, revisionId } = await harness()
    prepareChapterWritingTurn(agent, 1, `sha256:${'e'.repeat(64)}`, revisionId)
    prepareDirectChapterTurn(agent, 2, revisionId)
    ctx.on('user-questions/request', async () => ({
      answers: [{ id: 'scene-action', selected: ['1. 暗中试探'] }],
    }))

    const decisionCallId = ToolCallId('scene-choice-reused-skill')
    const decisionArgs = {
      selection_mode: 'user',
      goal: '选择章末冲突行动',
      target_asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      options: [
        { id: 'test', title: '暗中试探', action: '主角说错日期试探。', tradeoff: '悬疑强但较慢。' },
        { id: 'ask', title: '正面质问', action: '主角当面逼问。', tradeoff: '冲突快但太直白。' },
      ],
    }
    const result = await execute(ctx, agent, 'novel_choose_scene_action', decisionArgs, decisionCallId)

    if (result.isError) throw new Error(`expected cross-turn Skill reuse success: ${JSON.stringify(result)}`)
    expect(result.value).toMatchObject({ writingSkill: 'chapter-execution' })
    expect(result.additionalContexts).toHaveLength(1)
    const source = result.additionalContexts?.[0]?.source
    expect(source).toMatchObject({ kind: 'novel-context', version: 3, policies: ['chapter-write'] })
    expect((source as { references?: unknown[] } | undefined)?.references).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assetId: 'chapter-tool', revisionId, reason: 'target-asset', projection: 'full',
      }),
    ]))
    expect((result.value as { contextManifestId: string }).contextManifestId)
      .toBe((source as { manifestId?: string } | undefined)?.manifestId)

    appendSuccessfulToolResult(agent, {
      turn: 2, step: 1, callId: decisionCallId, name: 'novel_choose_scene_action', args: decisionArgs,
      content: result.content as Array<{ type: 'text'; text: string }>, meta: result.meta,
    })
    for (const context of result.additionalContexts ?? []) {
      agent.session.append('user/message', context, { surfaceOp: 'append' })
    }
    const proposal = await execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: revisionId,
      operations: [{ kind: 'replace-text', startUtf16: 2, endUtf16: 4, replacement: '放晴' }],
      summary: '按作者选定行动推进', scene_decision_call_id: decisionCallId,
    })
    expect(proposal).toMatchObject({ isError: false })
  })

  it('explains how to activate scene execution when no writing Skill has been loaded', async () => {
    const { ctx, agent, revisionId } = await harness()
    prepareDirectChapterTurn(agent, 1, revisionId)
    const result = await execute(ctx, agent, 'novel_choose_scene_action', {
      selection_mode: 'agent',
      goal: '选择场景行动',
      target_asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      options: [
        { id: 'left', title: '向左', action: '主角向左走。', tradeoff: '安全但慢。' },
        { id: 'right', title: '向右', action: '主角向右走。', tradeoff: '危险但快。' },
      ],
      selected_option_id: 'left',
    })
    expect(result).toMatchObject({ isError: true })
    expect(result.content.some(block => block.type === 'text'
      && block.text.includes('Load chapter-execution or scene-drive'))).toBe(true)
  })

  it('treats author free-text feedback as a request to replan, not an authorized scene choice', async () => {
    const { ctx, agent, revisionId } = await harness()
    prepareChapterWritingTurn(agent, 2, `sha256:${'c'.repeat(64)}`, revisionId)
    ctx.on('user-questions/request', async () => ({
      answers: [{ id: 'scene-action', selected: [], custom: '两个都太直白，重新给更隐蔽的方案' }],
    }))
    await expect(execute(ctx, agent, 'novel_choose_scene_action', {
      selection_mode: 'user',
      goal: '选择人物试探方式',
      target_asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      options: [
        { id: 'question', title: '直接质问', action: '当面追问。', tradeoff: '快但直白。' },
        { id: 'observe', title: '观察反应', action: '假装离开再观察。', tradeoff: '隐蔽但偏慢。' },
      ],
    })).resolves.toMatchObject({ isError: true })
  })

  it('derives bounded generation lineage from one durable same-turn scene decision', async () => {
    const { ctx, agent, revisionId } = await harness()
    const manifestId = `sha256:${'a'.repeat(64)}` as const
    prepareChapterWritingTurn(agent, 2, manifestId, revisionId)
    const decisionCallId = ToolCallId('scene-choice-agent')
    const decisionArgs = {
      selection_mode: 'agent',
      goal: '选择本场确认徐闻知情的行动',
      target_asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      options: [
        { id: 'question', title: '直接质问', action: '林澈直接追问。', tradeoff: '快但直白。' },
        { id: 'observe', title: '观察反应', action: '林澈假装离开再观察。', tradeoff: '悬疑强但较慢。' },
        { id: 'wrong-date', title: '说错日期', action: '林澈说错日期诱使徐闻纠正。', tradeoff: '符合人物但需潜台词。' },
      ],
      selected_option_id: 'observe',
    }
    const decision = await execute(ctx, agent, 'novel_choose_scene_action', decisionArgs, decisionCallId)
    if (decision.isError) throw new Error(`expected Agent scene choice success: ${JSON.stringify(decision)}`)
    appendSuccessfulToolResult(agent, {
      turn: 2,
      step: 1,
      callId: decisionCallId,
      name: 'novel_choose_scene_action',
      args: decisionArgs,
      content: decision.content as Array<{ type: 'text'; text: string }>,
      meta: decision.meta,
    })

    const result = await execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool',
      asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      operations: [{ kind: 'replace-text', startUtf16: 2, endUtf16: 4, replacement: '放晴' }],
      summary: '采用第二个行动方案推进天气变化',
      scene_decision_call_id: decisionCallId,
    })
    if (result.isError) throw new Error(`expected lineage proposal success: ${JSON.stringify(result)}`)
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const retained = await ctx.novelRepository.readChangeSet(
      project, ChangeSetId((result.value as { changeSetId: string }).changeSetId),
    )
    expect(retained.generation).toEqual({
      sessionId: agent.id,
      turn: 2,
      provider: 'test-provider',
      model: 'test-writer',
      presetId: 'novel-workbench',
      skillName: 'chapter-execution',
      contextManifestId: manifestId,
      contextPolicies: ['chapter-write'],
      strategy: 'action-options-agent-selected',
      sceneDecisionCallId: decisionCallId,
      actionPlanCount: 3,
      selectedActionPlan: 2,
    })
    const applied = await ctx.novelRepository.applyChangeSet(
      project, retained.id, { sessionId: agent.id }, undefined,
      ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    expect(applied.status).toBe('applied')
    expect((await ctx.novelRepository.listAssetRevisions(project, AssetId('chapter-tool')))[0]?.generation)
      .toEqual(retained.generation)

    await expect(execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: revisionId,
      operations: [{ kind: 'replace-text', startUtf16: 2, endUtf16: 4, replacement: '放晴' }],
      summary: '伪造决策', scene_decision_call_id: 'missing-scene-decision',
    })).resolves.toMatchObject({ isError: true })

    await expect(execute(ctx, agent, 'novel_create', {
      type: 'manuscript.chapter', title: '错误复用决策',
      content: { kind: 'manuscript', body: '这条新章不得复用绑定旧章节的选择。' },
      scene_decision_call_id: decisionCallId,
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

  it('creates a complete manuscript chapter without a separate container step', async () => {
    const { ctx, agent } = await harness()
    const created = await execute(ctx, agent, 'novel_create', {
      type: 'manuscript.chapter',
      title: '第二章 三坛海会大神',
      content: { kind: 'manuscript', body: '少年抬头时，风火轮已经照亮天门。\n' },
    })

    expect(created.isError).toBe(false)
    if (created.isError) throw new Error('expected manuscript novel_create success')
    expect(created.value).toMatchObject({
      projectId: 'project-tool',
      type: 'manuscript.chapter',
      title: '第二章 三坛海会大神',
    })
    expect(created.meta).toMatchObject({ kind: 'novel-asset-created', assetType: 'manuscript.chapter' })

    const reference = (created.value as { reference: string }).reference
    const read = await execute(ctx, agent, 'novel_get', { references: [reference] })
    expect(read.isError).toBe(false)
    if (read.isError) throw new Error('expected created chapter read success')
    expect(JSON.stringify(read.value)).toContain('风火轮已经照亮天门')
  })

  it('reads persisted analysis only for the requested exact chapter Revision', async () => {
    const { ctx, agent, revisionId } = await harness()
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    await ctx.novelRepository.putAnalysisReport(project, {
      assetId: AssetId('chapter-tool'),
      revisionId,
      kind: 'chapter-review',
      analyzerVersion: 'chapter-review/1',
      generatedAt: '2026-08-27T00:00:00.000Z',
      data: { overallScore: 72, verdict: '章末钩子偏弱' },
      sourceSessionId: agent.id,
    })
    const reference = encodeNovelReferenceUri({
      projectId: ProjectId('project-tool'), assetId: AssetId('chapter-tool'), revisionId, label: 'Tool Chapter',
    })

    const result = await execute(ctx, agent, 'novel_get_analysis', {
      references: [reference], kinds: ['chapter-review'],
    })
    if (result.isError) throw new Error(`expected analysis read success: ${JSON.stringify(result)}`)
    expect(result.value).toEqual({ reports: [{
      projectId: 'project-tool',
      assetId: 'chapter-tool',
      revisionId,
      title: 'Tool Chapter',
      kind: 'chapter-review',
      analyzerVersion: 'chapter-review/1',
      generatedAt: '2026-08-27T00:00:00.000Z',
      dataJson: JSON.stringify({ overallScore: 72, verdict: '章末钩子偏弱' }),
    }] })
  })

  it('proposes writing into an existing empty manuscript chapter', async () => {
    const { ctx, agent } = await harness()
    const created = await execute(ctx, agent, 'novel_create', {
      type: 'manuscript.chapter',
      title: '未命名章节',
      content: { kind: 'manuscript', body: '' },
    })
    expect(created.isError).toBe(false)
    if (created.isError) throw new Error('expected blank manuscript creation success')
    const value = created.value as { assetId: string; revisionId: string }
    const proposed = await execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool',
      asset_id: value.assetId,
      base_revision_id: value.revisionId,
      operations: [
        { kind: 'update-title', title: '第1章 华夏无神' },
        { kind: 'insert-text', atUtf16: 0, text: '鼓声从天门外传来。' },
      ],
      summary: '写入第一章正文',
    })
    expect(proposed.isError).toBe(false)
    if (proposed.isError) throw new Error('expected insert-text proposal success')
    expect(proposed.value).toMatchObject({ status: 'proposed', assetId: value.assetId })
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const retained = await ctx.novelRepository.readChangeSet(
      project, ChangeSetId((proposed.value as { changeSetId: string }).changeSetId),
    )
    expect(retained.operations).toEqual([
      { kind: 'update-title', title: '第1章 华夏无神' },
      { kind: 'insert-text', atUtf16: 0, text: '鼓声从天门外传来。' },
    ])
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
