/** Revision-bound deterministic scans and fixed chapter-review orchestration. */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { JsonValue } from '@deepseek-ai/dsh-session'
import type { SubagentResult, SubagentRun } from '@deepseek-ai/dsh-subagent'
import type { ObjectJsonSchema } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import {
  AssetId,
  PreferenceCandidateId,
  RevisionId,
  StoryStateCandidateId,
  type AssetSnapshot,
  type NovelAnalysisReport,
  type NovelPreferenceCandidate,
  type NovelStoryStateCandidate,
  type NovelOperation,
  type NovelProjectSnapshot,
  type RevisionFinalization,
  type ChangeSet,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type {} from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import type {} from '@deepseek-ai/dsh-experimental-novel-context'
import { scanNoAi, type NoAiScanOptions, type NoAiScanReport } from './noai.ts'

export * from './noai.ts'

const NOAI_ANALYZER_VERSION = 'noai-rules/2'
const REVIEW_ANALYZER_VERSION = 'chapter-review/1'
const PREFERENCE_EXTRACTOR_VERSION = 'final-preference/1'
const STORY_STATE_EXTRACTOR_VERSION = 'story-state/1'
const DEFAULT_MIN_CHARACTERS = 300
const DEFAULT_STRONG_SAMPLE_CHARACTERS = 1_200
const DEFAULT_MAX_FINDINGS = 80
const DEFAULT_WARN_RISK_SCORE = 50
const DEFAULT_WARN_HIGH_FINDINGS = 3

/** One scored chapter-review dimension returned by the fixed worker. */
export interface ChapterReviewDimension {
  readonly id: 'plot' | 'causality' | 'character' | 'pacing' | 'hook' | 'style'
  readonly score: number
  readonly summary: string
}

/** One evidence-bound chapter-review problem. */
export interface ChapterReviewFinding {
  readonly severity: 'high' | 'medium' | 'low'
  readonly category: string
  readonly quote: string
  readonly diagnosis: string
  readonly suggestion: string
}

/** Strict JSON result persisted for one exact chapter Revision. */
export interface ChapterReviewReport {
  readonly version: 1
  readonly sampleLevel: 'insufficient' | 'usable' | 'strong'
  readonly overallScore: number
  readonly verdict: string
  readonly dimensions: readonly ChapterReviewDimension[]
  readonly findings: readonly ChapterReviewFinding[]
  readonly priorities: readonly string[]
}

/** Provider-owned analyzer bounds and fixed worker route. */
export interface Config {
  /** Fresh in-process Subagent provider; defaults to `spawn`. */
  subagentProvider?: string
  /** Minimum visible characters before a NOAI risk score is meaningful. */
  noAiMinCharacters?: number
  /** Visible characters considered a strong scan sample. */
  noAiStrongSampleCharacters?: number
  /** Maximum deterministic findings retained in one report. */
  noAiMaxFindings?: number
  /** Candidate risk score that triggers model-visible feedback. */
  noAiWarnRiskScore?: number
  /** Candidate high-severity finding count that triggers feedback. */
  noAiWarnHighFindings?: number
}

interface ResolvedConfig extends NoAiScanOptions {
  readonly subagentProvider: string
  readonly warnRiskScore: number
  readonly warnHighFindings: number
}

/** Model-visible advisory generated for one materialized chapter candidate. */
export interface NovelCandidateAnalysisWarning {
  readonly report: NoAiScanReport
  readonly text: string
}

/** Result of explicit finalization and optional draft/final preference extraction. */
export interface FinalizeChapterResult {
  readonly finalization: RevisionFinalization
  readonly candidate?: NovelPreferenceCandidate
  readonly noCandidateReason?: 'no-agent-source' | 'no-author-diff' | 'missing-style-profile'
  readonly storyCandidate?: NovelStoryStateCandidate
  readonly noStoryCandidateReason?: 'missing-story-state'
  readonly storyCandidateError?: 'extraction-failed'
}

interface PreferenceExtraction {
  readonly summary: string
  readonly guidanceMarkdown: string
  readonly evidence: readonly {
    readonly before: string
    readonly after: string
    readonly inference: string
  }[]
}

interface StoryStateExtraction {
  readonly summary: string
  readonly replacementMarkdown: string
  readonly evidence: readonly { readonly quote: string; readonly update: string }[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelAnalysis: NovelAnalysis
  }
}

/** Host coordinator for exact-Revision scans and read-only chapter review. */
export class NovelAnalysis extends Service {
  static inject = ['fs', 'novelRepository', 'novelAssetTypes', 'novelContextResolver', 'sandboxPolicy', 'subagents']
  static Config: z<Config> = z.object({
    subagentProvider: z.string().default('spawn'),
    noAiMinCharacters: z.number().step(1).min(1).default(DEFAULT_MIN_CHARACTERS),
    noAiStrongSampleCharacters: z.number().step(1).min(1).default(DEFAULT_STRONG_SAMPLE_CHARACTERS),
    noAiMaxFindings: z.number().step(1).min(1).default(DEFAULT_MAX_FINDINGS),
    noAiWarnRiskScore: z.number().step(1).min(1).max(100).default(DEFAULT_WARN_RISK_SCORE),
    noAiWarnHighFindings: z.number().step(1).min(1).default(DEFAULT_WARN_HIGH_FINDINGS),
  })

  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'novelAnalysis')
    this.config = resolveConfig(config)
  }

  /**
   * Deterministically scan and persist one exact chapter Revision.
   * @param agent - owning Session used to locate and authorize the Novel Project.
   * @param assetId - exact manuscript chapter identity.
   * @param revisionId - retained Revision to scan.
   * @param signal - optional caller cancellation before persistence.
   * @returns the upserted exact-Revision report.
   */
  async scanChapter(
    agent: Agent,
    assetId: AssetId,
    revisionId: RevisionId,
    signal?: AbortSignal,
  ): Promise<NovelAnalysisReport> {
    const project = await this.resolveProject(agent, signal)
    const snapshot = await this.ctx.novelRepository.readAsset(project, assetId, revisionId, signal)
    assertChapter(snapshot)
    const report = scanNoAi(
      this.ctx.novelAssetTypes.get(snapshot.asset.type).modelText(snapshot),
      noAiOptions(this.config),
    )
    return await this.ctx.novelRepository.putAnalysisReport(project, {
      assetId,
      revisionId,
      kind: 'noai-scan',
      analyzerVersion: NOAI_ANALYZER_VERSION,
      generatedAt: new Date().toISOString(),
      data: report as unknown as JsonValue,
      sourceSessionId: agent.id,
    }, signal)
  }

  /**
   * Run the fixed read-only chapter reviewer and persist valid structured output.
   * @param agent - owning root Agent and review provenance.
   * @param assetId - exact manuscript chapter identity.
   * @param revisionId - retained Revision to review.
   * @param signal - canonical cancellation for worker startup and execution.
   * @returns the upserted exact-Revision review.
   */
  async reviewChapter(
    agent: Agent,
    assetId: AssetId,
    revisionId: RevisionId,
    signal: AbortSignal,
  ): Promise<NovelAnalysisReport> {
    const project = await this.resolveProject(agent, signal)
    const assets = await this.ctx.novelRepository.listAssets(
      project, signal, this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    const chapter = await this.ctx.novelRepository.readAsset(project, assetId, revisionId, signal)
    assertChapter(chapter)
    const title = assets.find(value => value.asset.id === assetId)?.title ?? '未命名章节'
    const compiled = await this.ctx.novelContextResolver.compile(agent, {
      policies: ['chapter-review'],
      targets: [{
        projectId: project.id,
        assetId: chapter.asset.id,
        revisionId: chapter.revisionId,
        label: title,
        origin: 'active-asset',
        mode: 'explicit',
        projection: 'full',
        reason: 'target-asset',
        required: true,
      }],
      includeWorkset: true,
    }, signal)
    const prompt = `先调用 skill 加载 chapter-review 方法，然后审查下面由 Novel Context Compiler 冻结的材料。必须提交结构化报告。各维度 id 只能使用 plot、causality、character、pacing、hook、style；评分为 0 到 100 的整数。finding 必须给准确短引文、诊断和可执行修法。不得修改任何资产。\n\n${compiled.text}`
    const run = await this.ctx.subagents.start(this.config.subagentProvider, {
      label: `章节审稿 · ${title}`,
      parent: agent,
      signal,
      prompt: [{ type: 'text', text: prompt }],
      maxDepth: 1,
      toolFilter: { allow: ['skill'] },
      persona: '你是只读的网络小说章节审稿人。只根据给定冻结材料找出会伤害追读、连贯性和人物可信度的问题；不得改稿或声称资产已修改。',
      outputSchema: REVIEW_SCHEMA,
    })
    const result = await settleRun(run)
    if (result.stopReason !== 'completed' || result.structured === undefined) {
      throw new Error(`novel analysis: chapter reviewer ended with ${result.stopReason}`)
    }
    const review = decodeReview(result.structured)
    return await this.ctx.novelRepository.putAnalysisReport(project, {
      assetId,
      revisionId,
      kind: 'chapter-review',
      analyzerVersion: REVIEW_ANALYZER_VERSION,
      generatedAt: new Date().toISOString(),
      data: review as unknown as JsonValue,
      sourceSessionId: agent.id,
      workerSessionId: run.id,
    }, signal)
  }

  /**
   * Retain explicit finalization, then infer one inert preference candidate when evidence exists.
   */
  async finalizeChapter(
    agent: Agent,
    assetId: AssetId,
    revisionId: RevisionId,
    signal: AbortSignal,
  ): Promise<FinalizeChapterResult> {
    const project = await this.resolveProject(agent, signal)
    const finalization = await this.ctx.novelRepository.finalizeRevision(
      project, assetId, revisionId, agent.id, signal,
    )
    let story: Pick<FinalizeChapterResult,
      'storyCandidate' | 'noStoryCandidateReason' | 'storyCandidateError'>
    try {
      story = await this.extractStoryStateCandidate(agent, project, assetId, revisionId, signal)
    } catch {
      signal.throwIfAborted()
      story = { storyCandidateError: 'extraction-failed' }
    }
    if (finalization.sourceRevisionId === undefined) {
      return { finalization, ...story, noCandidateReason: 'no-agent-source' }
    }
    if (finalization.sourceRevisionId === revisionId) {
      return { finalization, ...story, noCandidateReason: 'no-author-diff' }
    }
    const existing = await this.ctx.novelRepository.listPreferenceCandidates(project, assetId, revisionId, signal)
    if (existing[0] !== undefined) return { finalization, ...story, candidate: existing[0] }

    const assets = await this.ctx.novelRepository.listAssets(
      project, signal, this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    const styleSummary = assets.find(value => sameRuntimeType(value.asset.type, 'book.style-profile'))
    if (styleSummary === undefined) return { finalization, ...story, noCandidateReason: 'missing-style-profile' }
    const source = await this.ctx.novelRepository.readAsset(
      project, assetId, finalization.sourceRevisionId, signal,
    )
    const final = await this.ctx.novelRepository.readAsset(project, assetId, revisionId, signal)
    assertChapter(source)
    assertChapter(final)
    const sourceText = this.ctx.novelAssetTypes.get(source.asset.type).modelText(source)
    const finalText = this.ctx.novelAssetTypes.get(final.asset.type).modelText(final)
    if (sourceText === finalText) return { finalization, ...story, noCandidateReason: 'no-author-diff' }
    const style = await this.ctx.novelRepository.readAsset(
      project, styleSummary.asset.id, styleSummary.revisionId, signal,
    )
    const compiled = await this.ctx.novelContextResolver.compile(agent, {
      policies: ['preference-learning'],
      targets: [{
        projectId: project.id, assetId: source.asset.id, revisionId: source.revisionId,
        label: 'Agent 草稿', origin: 'search', mode: 'explicit', projection: 'full',
        reason: 'draft-source', required: true,
      }, {
        projectId: project.id, assetId: final.asset.id, revisionId: final.revisionId,
        label: '作者定稿', origin: 'active-asset', mode: 'explicit', projection: 'full',
        reason: 'final-source', required: true,
      }, {
        projectId: project.id, assetId: style.asset.id, revisionId: style.revisionId,
        label: styleSummary.title, origin: 'search', mode: 'explicit', projection: 'full',
        reason: 'book-style', required: true,
      }],
    }, signal)
    const material = `先调用 skill 加载 preference-learning 方法。只提炼作者从 Agent 草稿改到定稿时反复可迁移的表达、节奏、对白或信息释放偏好；剧情事实、人名、地点和本章偶然事件不得写入长期偏好。输出严格结构化结果。guidanceMarkdown 必须是可以追加到本书风格中的简洁 Markdown，不重复已有规则；evidence 提供 1 到 8 组准确短证据。\n\n${compiled.text}`
    const run = await this.ctx.subagents.start(this.config.subagentProvider, {
      label: `定稿偏好提取 · ${assetId}`,
      parent: agent,
      signal,
      prompt: [{ type: 'text', text: material }],
      maxDepth: 1,
      toolFilter: { allow: ['skill'] },
      persona: '你是只读的作者偏好分析员。只比较给定 Agent 草稿与作者显式定稿，提炼可迁移且有证据的文风、节奏或表达偏好；不得把剧情事实当风格，不得修改资产。',
      outputSchema: PREFERENCE_SCHEMA,
    })
    const result = await settleRun(run)
    if (result.stopReason !== 'completed' || result.structured === undefined) {
      throw new Error(`novel analysis: preference extractor ended with ${result.stopReason}`)
    }
    const extracted = decodePreference(result.structured)
    const candidate = await this.ctx.novelRepository.putPreferenceCandidate(project, {
      assetId,
      sourceRevisionId: source.revisionId,
      finalRevisionId: final.revisionId,
      ...(finalization.sourceChangeSetId === undefined ? {} : { sourceChangeSetId: finalization.sourceChangeSetId }),
      ...(finalization.sourceSessionId === undefined ? {} : { sourceSessionId: finalization.sourceSessionId }),
      targetStyleAssetId: style.asset.id,
      targetStyleRevisionId: style.revisionId,
      extractorVersion: PREFERENCE_EXTRACTOR_VERSION,
      generatedAt: new Date().toISOString(),
      ...extracted,
    }, signal)
    return { finalization, ...story, candidate }
  }

  private async extractStoryStateCandidate(
    agent: Agent,
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId: RevisionId,
    signal: AbortSignal,
  ): Promise<Pick<FinalizeChapterResult,
    'storyCandidate' | 'noStoryCandidateReason' | 'storyCandidateError'>> {
    const existing = await this.ctx.novelRepository.listStoryStateCandidates(
      project, assetId, revisionId, signal,
    )
    if (existing[0] !== undefined) return { storyCandidate: existing[0] }
    const assets = await this.ctx.novelRepository.listAssets(
      project, signal, this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    const storySummary = assets.find(value => sameRuntimeType(value.asset.type, 'book.story-state'))
    if (storySummary === undefined) return { noStoryCandidateReason: 'missing-story-state' }
    const chapter = await this.ctx.novelRepository.readAsset(project, assetId, revisionId, signal)
    assertChapter(chapter)
    const storyState = await this.ctx.novelRepository.readAsset(
      project, storySummary.asset.id, storySummary.revisionId, signal,
    )
    const compiled = await this.ctx.novelContextResolver.compile(agent, {
      policies: ['story-state-learning'],
      targets: [{
        projectId: project.id, assetId: chapter.asset.id, revisionId: chapter.revisionId,
        label: assets.find(value => value.asset.id === chapter.asset.id)?.title ?? '定稿章节',
        origin: 'active-asset', mode: 'explicit', projection: 'full',
        reason: 'final-source', required: true,
      }, {
        projectId: project.id, assetId: storyState.asset.id, revisionId: storyState.revisionId,
        label: storySummary.title, origin: 'search', mode: 'explicit', projection: 'full',
        reason: 'story-state', required: true,
      }],
    }, signal)
    const prompt = `先调用 skill 加载 story-state-extraction 方法。根据定稿正文更新当前 Story State。只记录正文已经确立的事实，不把大纲计划、推测或修辞当成事实；保留与本章无关的现有状态，更新已改变的状态。replacementMarkdown 必须是可直接替换整个 Story State 的完整、简洁 Markdown。evidence 提供 1 到 12 条定稿正文中的准确短引文及其支持的状态变化。不得修改任何资产。\n\n${compiled.text}`
    const run = await this.ctx.subagents.start(this.config.subagentProvider, {
      label: `故事状态提取 · ${assetId}`,
      parent: agent,
      signal,
      prompt: [{ type: 'text', text: prompt }],
      maxDepth: 1,
      toolFilter: { allow: ['skill'] },
      persona: '你是只读的长篇小说 Story State 管理员。只从给定定稿正文中提取已发生、已确认且对后续创作有用的状态变化；不得把未来计划写成现实，不得修改资产。',
      outputSchema: STORY_STATE_SCHEMA,
    })
    const result = await settleRun(run)
    if (result.stopReason !== 'completed' || result.structured === undefined) {
      throw new Error(`novel analysis: Story State extractor ended with ${result.stopReason}`)
    }
    const extracted = decodeStoryState(result.structured)
    const candidate = await this.ctx.novelRepository.putStoryStateCandidate(project, {
      assetId,
      finalRevisionId: revisionId,
      targetStoryStateAssetId: storyState.asset.id,
      targetStoryStateRevisionId: storyState.revisionId,
      extractorVersion: STORY_STATE_EXTRACTOR_VERSION,
      generatedAt: new Date().toISOString(),
      workerSessionId: run.id,
      ...extracted,
    }, signal)
    return { storyCandidate: candidate }
  }

  /** Apply one reviewed candidate to the exact style Revision through ChangeSet publication. */
  async acceptPreference(
    agent: Agent,
    candidateId: PreferenceCandidateId,
    signal: AbortSignal,
  ): Promise<{ readonly candidate: NovelPreferenceCandidate; readonly changeSet: ChangeSet }> {
    const project = await this.resolveProject(agent, signal)
    const candidate = await this.ctx.novelRepository.readPreferenceCandidate(project, candidateId, signal)
    if (candidate.status !== 'pending') throw new Error('novel analysis: preference candidate is already terminal')
    const style = await this.ctx.novelRepository.readAsset(
      project, candidate.targetStyleAssetId, candidate.targetStyleRevisionId, signal,
    )
    const definition = this.ctx.novelAssetTypes.get(style.asset.type)
    const body = definition.modelText(style)
    const heading = '\n\n## 从定稿中确认的写作偏好\n\n'
    const operations = definition.prepareOperations(style, [{
      kind: 'replace-text', startUtf16: body.length, endUtf16: body.length,
      replacement: `${heading}${candidate.guidanceMarkdown.trim()}\n`,
    }])
    const proposed = await this.ctx.novelRepository.proposeChangeSet(project, {
      assetId: style.asset.id,
      baseRevisionId: style.revisionId,
      operations,
      actor: { kind: 'user', sessionId: agent.id },
      summary: `采纳定稿偏好：${candidate.summary}`,
    }, signal)
    const applied = await this.ctx.novelRepository.applyChangeSet(
      project, proposed.id, { sessionId: agent.id }, signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    if (applied.status !== 'applied' || applied.resultRevisionId === undefined) {
      return { candidate, changeSet: applied }
    }
    const accepted = await this.ctx.novelRepository.decidePreferenceCandidate(
      project, candidate.id, 'accepted', agent.id,
      { changeSetId: applied.id, revisionId: applied.resultRevisionId }, signal,
    )
    return { candidate: accepted, changeSet: applied }
  }

  /** Retain explicit rejection without changing authored assets. */
  async rejectPreference(
    agent: Agent,
    candidateId: PreferenceCandidateId,
    signal: AbortSignal,
  ): Promise<NovelPreferenceCandidate> {
    const project = await this.resolveProject(agent, signal)
    return await this.ctx.novelRepository.decidePreferenceCandidate(
      project, candidateId, 'rejected', agent.id, undefined, signal,
    )
  }

  /** Apply one reviewed complete Story State replacement through ChangeSet publication. */
  async acceptStoryState(
    agent: Agent,
    candidateId: StoryStateCandidateId,
    signal: AbortSignal,
  ): Promise<{ readonly candidate: NovelStoryStateCandidate; readonly changeSet: ChangeSet }> {
    const project = await this.resolveProject(agent, signal)
    const candidate = await this.ctx.novelRepository.readStoryStateCandidate(project, candidateId, signal)
    if (candidate.status !== 'pending') throw new Error('novel analysis: Story State candidate is already terminal')
    const storyState = await this.ctx.novelRepository.readAsset(
      project, candidate.targetStoryStateAssetId, candidate.targetStoryStateRevisionId, signal,
    )
    const definition = this.ctx.novelAssetTypes.get(storyState.asset.type)
    const body = definition.modelText(storyState)
    const operations = definition.prepareOperations(storyState, [{
      kind: 'replace-text', startUtf16: 0, endUtf16: body.length,
      replacement: `${candidate.replacementMarkdown.trim()}\n`,
    }])
    const proposed = await this.ctx.novelRepository.proposeChangeSet(project, {
      assetId: storyState.asset.id,
      baseRevisionId: storyState.revisionId,
      operations,
      actor: { kind: 'user', sessionId: agent.id },
      summary: `采纳定稿故事状态：${candidate.summary}`,
    }, signal)
    const applied = await this.ctx.novelRepository.applyChangeSet(
      project, proposed.id, { sessionId: agent.id }, signal,
      this.ctx.sandboxPolicy.resolve({ session: agent.session }),
    )
    if (applied.status !== 'applied' || applied.resultRevisionId === undefined) {
      return { candidate, changeSet: applied }
    }
    const accepted = await this.ctx.novelRepository.decideStoryStateCandidate(
      project, candidate.id, 'accepted', agent.id,
      { changeSetId: applied.id, revisionId: applied.resultRevisionId }, signal,
    )
    return { candidate: accepted, changeSet: applied }
  }

  /** Retain explicit Story State rejection without changing authored assets. */
  async rejectStoryState(
    agent: Agent,
    candidateId: StoryStateCandidateId,
    signal: AbortSignal,
  ): Promise<NovelStoryStateCandidate> {
    const project = await this.resolveProject(agent, signal)
    return await this.ctx.novelRepository.decideStoryStateCandidate(
      project, candidateId, 'rejected', agent.id, undefined, signal,
    )
  }

  /**
   * Scan one proposal candidate and render bounded deferred model feedback.
   * @param base - exact ChangeSet base snapshot.
   * @param operations - type-validated operations already accepted for proposal.
   * @returns material warning, or `undefined` for non-chapters, small samples, or low risk.
   */
  candidateWarning(
    base: AssetSnapshot,
    operations: readonly NovelOperation[],
  ): NovelCandidateAnalysisWarning | undefined {
    const baseType: string = base.asset.type
    if (baseType !== 'manuscript.chapter') return undefined
    const definition = this.ctx.novelAssetTypes.get(base.asset.type)
    const materialized = definition.materializeOperations(base, operations)
    const candidate: AssetSnapshot = {
      ...base,
      serializedUtf8: materialized.serializedUtf8,
      frontmatter: materialized.parsed.frontmatter,
      content: materialized.parsed.content,
    }
    const report = scanNoAi(definition.modelText(candidate), noAiOptions(this.config))
    if (report.sampleLevel === 'insufficient') return undefined
    if (report.riskScore < this.config.warnRiskScore
      && report.counts.high < this.config.warnHighFindings) return undefined
    const top = report.findings.slice(0, 5)
      .map(item => `- ${item.label}（${item.severity}）${JSON.stringify(item.evidence)}：${item.advice}`)
      .join('\n')
    return {
      report,
      text: `<novel-noai-candidate-warning>\n这份正文 ChangeSet 候选已创建，但确定性 NOAI 扫描发现较高模板化风险（risk ${report.riskScore}/100，高风险 ${report.counts.high} 处）。\n${top}\n请在回复用户前说明这些风险；不要声称提案已应用，也不要自动另建提案。\n</novel-noai-candidate-warning>`,
    }
  }

  private async resolveProject(agent: Agent, signal?: AbortSignal): Promise<NovelProjectSnapshot> {
    const cwd = agent.session.header.cwd
    if (cwd === undefined) throw new Error('novel analysis: Session has no Novel Project working directory')
    const root = await this.ctx.fs.resolve(cwd, { cwd, ...(signal === undefined ? {} : { signal }) })
    const project = await this.ctx.novelRepository.discoverProject(root, signal)
    if (project === undefined) throw new Error('novel analysis: Session working directory is not a Novel Project')
    return project
  }

}

const REVIEW_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    sampleLevel: { type: 'string', enum: ['insufficient', 'usable', 'strong'] },
    overallScore: { type: 'integer' },
    verdict: { type: 'string' },
    dimensions: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string', enum: ['plot', 'causality', 'character', 'pacing', 'hook', 'style'] },
          score: { type: 'integer' },
          summary: { type: 'string' },
        },
        required: ['id', 'score', 'summary'],
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          category: { type: 'string' }, quote: { type: 'string' },
          diagnosis: { type: 'string' }, suggestion: { type: 'string' },
        },
        required: ['severity', 'category', 'quote', 'diagnosis', 'suggestion'],
      },
    },
    priorities: { type: 'array', items: { type: 'string' } },
  },
  required: ['sampleLevel', 'overallScore', 'verdict', 'dimensions', 'findings', 'priorities'],
}

const PREFERENCE_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    guidanceMarkdown: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          before: { type: 'string' },
          after: { type: 'string' },
          inference: { type: 'string' },
        },
        required: ['before', 'after', 'inference'],
      },
    },
  },
  required: ['summary', 'guidanceMarkdown', 'evidence'],
}

const STORY_STATE_SCHEMA: ObjectJsonSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    replacementMarkdown: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: { quote: { type: 'string' }, update: { type: 'string' } },
        required: ['quote', 'update'],
      },
    },
  },
  required: ['summary', 'replacementMarkdown', 'evidence'],
}

function resolveConfig(config: Config): ResolvedConfig {
  const resolved: ResolvedConfig = {
    subagentProvider: config.subagentProvider ?? 'spawn',
    minCharacters: config.noAiMinCharacters ?? DEFAULT_MIN_CHARACTERS,
    strongSampleCharacters: config.noAiStrongSampleCharacters ?? DEFAULT_STRONG_SAMPLE_CHARACTERS,
    maxFindings: config.noAiMaxFindings ?? DEFAULT_MAX_FINDINGS,
    warnRiskScore: config.noAiWarnRiskScore ?? DEFAULT_WARN_RISK_SCORE,
    warnHighFindings: config.noAiWarnHighFindings ?? DEFAULT_WARN_HIGH_FINDINGS,
  }
  if (resolved.subagentProvider.length === 0 || resolved.subagentProvider !== resolved.subagentProvider.trim()) {
    throw new TypeError('novel-analysis: subagentProvider must be a normalized non-empty string')
  }
  for (const [name, value] of Object.entries(resolved).filter(([, value]) => typeof value === 'number')) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`novel-analysis: ${name} must be a positive integer`)
  }
  if (resolved.strongSampleCharacters < resolved.minCharacters) {
    throw new TypeError('novel-analysis: strong sample threshold must not be smaller than minimum sample')
  }
  if (resolved.warnRiskScore > 100) throw new TypeError('novel-analysis: warnRiskScore must not exceed 100')
  return resolved
}

function noAiOptions(config: ResolvedConfig): NoAiScanOptions {
  return {
    minCharacters: config.minCharacters,
    strongSampleCharacters: config.strongSampleCharacters,
    maxFindings: config.maxFindings,
  }
}

function assertChapter(snapshot: AssetSnapshot): void {
  const assetType: string = snapshot.asset.type
  if (assetType !== 'manuscript.chapter') throw new Error('novel analysis: target must be manuscript.chapter')
}

function sameRuntimeType(value: unknown, expected: string): boolean {
  return typeof value === 'string' && value === expected
}

async function settleRun(run: SubagentRun): Promise<SubagentResult> {
  let result: SubagentResult | undefined
  let primary: unknown
  try {
    result = await run.result
  } catch (error: unknown) {
    primary = error
  }
  try {
    await run.dispose()
  } catch (error: unknown) {
    if (primary !== undefined) throw new AggregateError([primary, error], 'novel analysis: reviewer and disposal failed')
    throw error
  }
  if (primary instanceof Error) throw primary
  if (primary !== undefined) throw new Error('novel analysis: reviewer failed', { cause: primary })
  if (result === undefined) throw new Error('novel analysis: reviewer produced no terminal result')
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedText(value: unknown, max = 4_000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim()
}

function decodeReview(value: unknown): ChapterReviewReport {
  if (!isRecord(value)
    || !['insufficient', 'usable', 'strong'].includes(String(value['sampleLevel']))
    || !Number.isSafeInteger(value['overallScore']) || Number(value['overallScore']) < 0 || Number(value['overallScore']) > 100
    || !normalizedText(value['verdict'])
    || !Array.isArray(value['dimensions']) || value['dimensions'].length < 1 || value['dimensions'].length > 6
    || !Array.isArray(value['findings']) || value['findings'].length > 50
    || !Array.isArray(value['priorities']) || value['priorities'].length > 12) {
    throw new Error('novel analysis: chapter reviewer returned a malformed report')
  }
  const dimensions = value['dimensions'].map((item): ChapterReviewDimension => {
    if (!isRecord(item) || !['plot', 'causality', 'character', 'pacing', 'hook', 'style'].includes(String(item['id']))
      || !Number.isSafeInteger(item['score']) || Number(item['score']) < 0 || Number(item['score']) > 100
      || !normalizedText(item['summary'], 1_000)) throw new Error('novel analysis: reviewer dimension is invalid')
    return { id: item['id'] as ChapterReviewDimension['id'], score: item['score'] as number, summary: item['summary'] }
  })
  const findings = value['findings'].map((item): ChapterReviewFinding => {
    if (!isRecord(item) || !['high', 'medium', 'low'].includes(String(item['severity']))
      || !normalizedText(item['category'], 200) || !normalizedText(item['quote'], 500)
      || !normalizedText(item['diagnosis'], 1_500) || !normalizedText(item['suggestion'], 1_500)) {
      throw new Error('novel analysis: reviewer finding is invalid')
    }
    return {
      severity: item['severity'] as ChapterReviewFinding['severity'], category: item['category'],
      quote: item['quote'], diagnosis: item['diagnosis'], suggestion: item['suggestion'],
    }
  })
  const priorities = value['priorities'].map((item) => {
    if (!normalizedText(item, 1_000)) throw new Error('novel analysis: reviewer priority is invalid')
    return item
  })
  return {
    version: 1,
    sampleLevel: value['sampleLevel'] as ChapterReviewReport['sampleLevel'],
    overallScore: value['overallScore'] as number,
    verdict: value['verdict'], dimensions, findings, priorities,
  }
}

function decodePreference(value: unknown): PreferenceExtraction {
  if (!isRecord(value) || !normalizedText(value['summary'], 1_000)
    || !normalizedText(value['guidanceMarkdown'], 8_000)
    || !Array.isArray(value['evidence']) || value['evidence'].length < 1 || value['evidence'].length > 8) {
    throw new Error('novel analysis: preference extractor returned malformed output')
  }
  const evidence = value['evidence'].map((item) => {
    if (!isRecord(item) || !normalizedText(item['before'], 1_000)
      || !normalizedText(item['after'], 1_000) || !normalizedText(item['inference'], 1_000)) {
      throw new Error('novel analysis: preference evidence is invalid')
    }
    return { before: item['before'], after: item['after'], inference: item['inference'] }
  })
  return { summary: value['summary'], guidanceMarkdown: value['guidanceMarkdown'], evidence }
}

function decodeStoryState(value: unknown): StoryStateExtraction {
  if (!isRecord(value) || !normalizedText(value['summary'], 1_000)
    || !normalizedText(value['replacementMarkdown'], 64_000)
    || !Array.isArray(value['evidence']) || value['evidence'].length < 1 || value['evidence'].length > 12) {
    throw new Error('novel analysis: Story State extractor returned malformed output')
  }
  const evidence = value['evidence'].map((item) => {
    if (!isRecord(item) || !normalizedText(item['quote'], 1_000) || !normalizedText(item['update'], 1_000)) {
      throw new Error('novel analysis: Story State evidence is invalid')
    }
    return { quote: item['quote'], update: item['update'] }
  })
  return {
    summary: value['summary'], replacementMarkdown: value['replacementMarkdown'], evidence,
  }
}

export default NovelAnalysis
