import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { AssetId, type RevisionId } from '@deepseek-ai/dsh-experimental-novel-repository'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelAssetTypeRegistry from '../../novel-repository/src/asset-types.ts'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SubagentRuntime, {
  type ResolvedSubagentStartRequest,
  type SubagentProvider,
  type SubagentRun,
} from '@deepseek-ai/dsh-subagent'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import NovelAnalysis from '../src/index.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

const review = (score: number) => ({
  sampleLevel: 'strong',
  overallScore: score,
  verdict: score > 80 ? '章节推进清楚，钩子有效。' : '核心行动偏弱，需要收紧。',
  dimensions: [
    { id: 'plot', score, summary: '核心事件保持单一。' },
    { id: 'hook', score, summary: '章尾留下有效行动问题。' },
  ],
  findings: [{
    severity: 'medium', category: 'pacing', quote: '白港下雨了',
    diagnosis: '进入冲突前的动作还可以更具体。', suggestion: '补一个会改变人物选择的现场阻力。',
  }],
  priorities: ['先强化触发人物行动的阻力。'],
})

class ReviewProvider implements SubagentProvider {
  readonly name = 'review-test'
  readonly capabilities = { outputSchema: true, depthLimit: true, toolFilter: true, persona: true }
  readonly inheritsParentContext = false
  readonly requests: ResolvedSubagentStartRequest[] = []
  readonly disposals: Array<ReturnType<typeof vi.fn>> = []
  structured: unknown = review(72)

  async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
    this.requests.push(request)
    const dispose = vi.fn(() => Promise.resolve())
    this.disposals.push(dispose)
    return {
      id: SessionId(`review-worker-${this.requests.length}`),
      localAgent: undefined,
      result: Promise.resolve({ output: [], structured: this.structured, stopReason: 'completed' }),
      dispose,
    }
  }
}

async function harness(): Promise<{
  ctx: Context
  agent: Agent
  revisionId: RevisionId
  provider: ReviewProvider
}> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-novel-analysis-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'manuscript'))
  await writeFile(join(dir, 'novel.yaml'), [
    'kind: novel-project',
    'schema: 1',
    'id: project-analysis',
    'title: Analysis Project',
    'contentRoots:',
    '  manuscript: manuscript',
    '',
  ].join('\n'))
  await writeFile(join(dir, 'manuscript', 'chapter.md'), [
    '---',
    'novel:',
    '  schema: 1',
    '  id: chapter-analysis',
    '  type: manuscript.chapter',
    '  title: 第一章',
    '---',
    '白港下雨了。林澈停在路口，没有立刻进门。',
    '',
  ].join('\n'))
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SubagentRuntime)
  const provider = new ReviewProvider()
  ctx.subagents.registerProvider(provider)
  await ctx.plugin(NovelAnalysis, { subagentProvider: provider.name })
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (project === undefined) throw new Error('expected Novel Project')
  const [chapter] = await ctx.novelRepository.listAssets(project)
  if (chapter === undefined) throw new Error('expected chapter')
  const id = SessionId('analysis-parent')
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: dir })
  return { ctx, agent: { id, session, ctx } as Agent, revisionId: chapter.revisionId, provider }
}

describe('NovelAnalysis', () => {
  it('runs a deterministic exact-Revision scan without starting a Subagent', async () => {
    const { ctx, agent, revisionId, provider } = await harness()
    const report = await ctx.novelAnalysis.scanChapter(agent, AssetId('chapter-analysis'), revisionId)
    expect(report).toMatchObject({
      kind: 'noai-scan', revisionId, analyzerVersion: 'noai-rules/1',
      sourceSessionId: agent.id, data: { version: 1, sampleLevel: 'insufficient', riskScore: 0 },
    })
    expect(provider.requests).toEqual([])
  })

  it('runs a fixed read-only reviewer and only replaces a valid report for the same Revision', async () => {
    const { ctx, agent, revisionId, provider } = await harness()
    const signal = new AbortController().signal
    const first = await ctx.novelAnalysis.reviewChapter(agent, AssetId('chapter-analysis'), revisionId, signal)
    expect(first).toMatchObject({
      kind: 'chapter-review', revisionId, analyzerVersion: 'chapter-review/1',
      sourceSessionId: agent.id, workerSessionId: 'review-worker-1', data: { version: 1, overallScore: 72 },
    })
    expect(provider.requests[0]).toMatchObject({
      maxDepth: 1,
      toolFilter: { allow: ['skill'] },
      descriptor: { mode: 'one-shot', provider: provider.name },
    })
    expect(provider.requests[0]?.persona).toContain('只读')
    const promptItem = provider.requests[0]?.prompt[0]
    if (promptItem?.type !== 'text') throw new Error('expected text review prompt')
    expect(promptItem.text).toContain('project-analysis/chapter-analysis@')

    provider.structured = review(91)
    const second = await ctx.novelAnalysis.reviewChapter(agent, AssetId('chapter-analysis'), revisionId, signal)
    expect(second.data).toMatchObject({ overallScore: 91 })
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    expect(await ctx.novelRepository.listAnalysisReports(project, AssetId('chapter-analysis'), revisionId))
      .toMatchObject([{ kind: 'chapter-review', data: { overallScore: 91 } }])

    provider.structured = {}
    await expect(ctx.novelAnalysis.reviewChapter(agent, AssetId('chapter-analysis'), revisionId, signal))
      .rejects.toThrow(/malformed report/u)
    expect(await ctx.novelRepository.listAnalysisReports(project, AssetId('chapter-analysis'), revisionId))
      .toMatchObject([{ kind: 'chapter-review', data: { overallScore: 91 } }])
    expect(provider.disposals).toHaveLength(3)
    for (const dispose of provider.disposals) expect(dispose).toHaveBeenCalledOnce()
  })
})
