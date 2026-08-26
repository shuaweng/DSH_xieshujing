import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import {
  AssetId,
  type NovelProjectSnapshot,
  type RevisionId,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { apply as applyOutlineAssetTypes } from '@deepseek-ai/dsh-experimental-novel-asset-outline'
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
  await mkdir(join(dir, 'planning'))
  await writeFile(join(dir, 'novel.yaml'), [
    'kind: novel-project',
    'schema: 1',
    'id: project-analysis',
    'title: Analysis Project',
    'contentRoots:',
    '  manuscript: manuscript',
    '  planning: planning',
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
  await writeFile(join(dir, 'planning', 'style.md'), [
    '---',
    'novel:',
    '  schema: 1',
    '  id: style-analysis',
    '  type: book.style-profile',
    '  title: 本书风格',
    '---',
    '保持克制，避免替人物总结情绪。',
    '',
  ].join('\n'))
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  applyOutlineAssetTypes(ctx)
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

async function authorFinalAfterAgent(
  ctx: Context,
  agent: Agent,
  revisionId: RevisionId,
): Promise<{ readonly project: NovelProjectSnapshot; readonly finalRevisionId: RevisionId }> {
  const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (project === undefined) throw new Error('expected Novel Project')
  const selection = await ctx.novelRepository.captureSelection(project, {
    assetId: AssetId('chapter-analysis'), revisionId,
    selector: { kind: 'text-range', startUtf16: 0, endUtf16: 5 },
  })
  const proposed = await ctx.novelRepository.proposeChangeSet(project, {
    assetId: AssetId('chapter-analysis'),
    baseRevisionId: revisionId,
    operations: [{ kind: 'replace-text', selector: selection.selector, replacement: '白港落着雨' }],
    actor: { kind: 'agent', sessionId: agent.id },
    summary: 'Agent 初稿',
  })
  const applied = await ctx.novelRepository.applyChangeSet(project, proposed.id, { sessionId: agent.id })
  if (applied.resultRevisionId === undefined) throw new Error('expected applied Agent Revision')
  const final = await ctx.novelRepository.saveAssetContent(project, {
    assetId: AssetId('chapter-analysis'),
    baseRevisionId: applied.resultRevisionId,
    content: { kind: 'manuscript', body: '雨线压低了白港的天。林澈停在路口，没有立刻进门。' },
  })
  return { project, finalRevisionId: final.revisionId }
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

  it('learns only from an explicit author-final Revision and applies reviewed guidance through a ChangeSet', async () => {
    const { ctx, agent, revisionId, provider } = await harness()
    const signal = new AbortController().signal
    const { project, finalRevisionId } = await authorFinalAfterAgent(ctx, agent, revisionId)
    provider.structured = {
      summary: '作者更偏好用可见环境建立情绪，不直接概括天气。',
      guidanceMarkdown: '- 用具体可见的环境细节承载氛围，少用概括性天气句。',
      evidence: [{
        before: '白港落着雨。',
        after: '雨线压低了白港的天。',
        inference: '用画面替代概括。',
      }],
    }

    const learned = await ctx.novelAnalysis.finalizeChapter(
      agent, AssetId('chapter-analysis'), finalRevisionId, signal,
    )
    expect(learned.finalization).toMatchObject({
      revisionId: finalRevisionId,
      sourceSessionId: agent.id,
    })
    expect(learned.candidate).toMatchObject({
      status: 'pending',
      finalRevisionId,
      targetStyleAssetId: 'style-analysis',
      summary: '作者更偏好用可见环境建立情绪，不直接概括天气。',
    })
    expect(provider.requests.at(-1)).toMatchObject({
      maxDepth: 1,
      toolFilter: { allow: ['skill'] },
      descriptor: { mode: 'one-shot', provider: provider.name },
    })
    const preferencePrompt = provider.requests.at(-1)?.prompt[0]
    if (preferencePrompt?.type !== 'text') throw new Error('expected text preference prompt')
    expect(preferencePrompt.text).toContain(String(learned.finalization.sourceRevisionId))
    expect(preferencePrompt.text).toContain(String(finalRevisionId))
    expect(preferencePrompt.text).toContain('保持克制')

    if (learned.candidate === undefined) throw new Error('expected preference candidate')
    const accepted = await ctx.novelAnalysis.acceptPreference(agent, learned.candidate.id, signal)
    expect(accepted.candidate).toMatchObject({
      status: 'accepted',
      resultChangeSetId: accepted.changeSet.id,
      resultRevisionId: accepted.changeSet.resultRevisionId,
    })
    const style = await ctx.novelRepository.readAsset(project, AssetId('style-analysis'))
    expect(ctx.novelAssetTypes.get(style.asset.type).modelText(style)).toContain('用具体可见的环境细节承载氛围')

    const replay = await ctx.novelAnalysis.finalizeChapter(
      agent, AssetId('chapter-analysis'), finalRevisionId, signal,
    )
    expect(replay.candidate).toEqual(accepted.candidate)
    expect(provider.requests).toHaveLength(1)
  })

  it('does not fabricate learning without an Agent ancestor and preserves a pending candidate on style conflict', async () => {
    const noSource = await harness()
    const signal = new AbortController().signal
    await expect(noSource.ctx.novelAnalysis.finalizeChapter(
      noSource.agent, AssetId('chapter-analysis'), noSource.revisionId, signal,
    )).resolves.toMatchObject({ noCandidateReason: 'no-agent-source' })
    expect(noSource.provider.requests).toEqual([])

    const { ctx, agent, revisionId, provider } = await harness()
    const { project, finalRevisionId } = await authorFinalAfterAgent(ctx, agent, revisionId)
    provider.structured = {
      summary: '作者偏好更具体的环境动作。',
      guidanceMarkdown: '- 让环境细节参与人物处境。',
      evidence: [{ before: '白港落着雨。', after: '雨线压低了白港的天。', inference: '环境更具体。' }],
    }
    const learned = await ctx.novelAnalysis.finalizeChapter(
      agent, AssetId('chapter-analysis'), finalRevisionId, signal,
    )
    if (learned.candidate === undefined) throw new Error('expected preference candidate')
    const style = await ctx.novelRepository.readAsset(project, AssetId('style-analysis'))
    await ctx.novelRepository.saveAssetContent(project, {
      assetId: style.asset.id,
      baseRevisionId: style.revisionId,
      content: { kind: 'book-style-profile', body: '作者同时补充了更新的风格规则。' },
    })

    const conflicted = await ctx.novelAnalysis.acceptPreference(agent, learned.candidate.id, signal)
    expect(conflicted.changeSet).toMatchObject({ status: 'conflicted' })
    expect(conflicted.candidate).toMatchObject({ status: 'pending' })
    const rejected = await ctx.novelAnalysis.rejectPreference(agent, learned.candidate.id, signal)
    expect(rejected).toMatchObject({ status: 'rejected', decidedBySessionId: agent.id })
    const currentStyle = await ctx.novelRepository.readAsset(project, AssetId('style-analysis'))
    expect(ctx.novelAssetTypes.get(currentStyle.asset.type).modelText(currentStyle))
      .toBe('作者同时补充了更新的风格规则。')
  })
})
