/** Safe Novel tools: discovery, typed creation, exact reads, and proposal-only mutations. */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-approval'
import {
  AssetId,
  ProjectId,
  RevisionId,
  type NovelAssetContent,
  type NovelAnalysisReportKind,
  type NovelAssetType,
  type NovelGenerationLineage,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type {} from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import type {} from '@deepseek-ai/dsh-experimental-novel-analysis'
import {
  decodeNovelReferenceUri,
  encodeNovelReferenceUri,
  type NovelReferenceInput,
} from '@deepseek-ai/dsh-experimental-novel-context'

export const name = 'tool-novel'
export const inject = ['tools', 'systemPrompt', 'novelContextResolver', 'novelRepository', 'novelAssetTypes', 'novelAnalysis', 'fs', 'sandboxPolicy']

const PROMPT = `## Novel workbench tools

Novel Assets are versioned authored material. When the user names an Asset but no
canonical reference is available, use \`novel_list\` to discover the current Project
and the exact creation formats, or \`novel_search\` when a title or content clue is known.
When the user explicitly asks to start a new book and the Session directory is not yet
a Novel Project, use \`novel_initialize_project\`; it requests approval before writing.
Search only discovers exact current references; read chosen results with \`novel_get\`.
Use \`novel_get_analysis\` when the author asks about a persisted chapter review or
NOAI report; reports are read explicitly and are not hidden prompt context.
Use \`novel_create\` for new typed Assets; never invent a file path. A newly requested
chapter is created directly as \`manuscript.chapter\` with its complete prose body in
the same call; never ask the author to create an empty chapter container first. Use
\`novel_get\` for exact retained Revisions and proposal instructions.
Use \`novel_propose_changes\` for existing Asset changes; it only creates a ChangeSet
for user review and never means the file changed. Use \`novel_present\` only to open or
close the Novel workbench when that presentation helps the current task. Do not claim
a proposal was applied. Agent-created Assets and ChangeSets automatically retain bounded
generation lineage from the Session. Writing Skills should identify whether they used a
direct path or selected one of 2–3 short action options; omit action-option coordinates
for ordinary direct writing.`

const GENERATION_STRATEGIES = [
  'direct',
  'action-options-agent-selected',
  'action-options-user-selected',
] as const

type GenerationStrategy = typeof GENERATION_STRATEGIES[number]

const GENERATION_PARAMETERS = {
  generation_strategy: {
    type: 'string' as const,
    enum: [...GENERATION_STRATEGIES],
    description: 'How the writing path was chosen. Defaults to direct.',
  },
  action_plan_count: {
    type: 'integer' as const,
    enum: [2, 3],
    description: 'Number of short action options considered; required only for an action-options strategy.',
  },
  selected_action_plan: {
    type: 'integer' as const,
    enum: [1, 2, 3],
    description: 'One-based selected action option; required only for an action-options strategy.',
  },
}

/** Register creation, exact-read, and proposal-only Novel tools. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({ name: 'tool:novel', order: 111, text: PROMPT })

  ctx.tools.register(defineTool({
    name: 'novel_initialize_project',
    description: 'Initialize the current Session working directory as a Novel Project after explicit user approval. Preserves existing files and creates only repository-owned project metadata and empty content roots.',
    parameters: {
      title: { type: 'string', required: true, description: 'Author-visible title of the book.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, enum: ['created', 'already-initialized'] },
          projectId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          manifestPath: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.status === 'created'
          ? `已初始化小说项目《${value.title}》。`
          : `当前目录已经是小说项目《${value.title}》。`,
      }],
      presentationMeta: (_args, value) => ({
        kind: 'novel-project-initialized',
        status: value.status,
        projectId: value.projectId,
        title: value.title,
      }),
    },
    async execute(args, exec) {
      const { agent, root } = await requireNovelRoot(ctx, exec)
      const existing = await ctx.novelRepository.discoverProject(root, exec.signal)
      if (existing !== undefined) {
        return {
          status: 'already-initialized' as const,
          projectId: existing.id,
          title: existing.title,
          manifestPath: existing.manifest.displayPath,
        }
      }
      const approval = ctx.get('approval')
      if (approval === undefined) throw new Error('Novel Project initialization requires an available approval service')
      const outcome = await approval.request({
        agent,
        toolName: 'novel_initialize_project',
        callId: exec.callId,
        reason: `Initialize the current working directory as Novel Project “${args.title.trim()}”; existing files will be preserved.`,
        signal: exec.signal,
      })
      if (outcome !== 'allowed-once') {
        throw new Error(`Novel Project initialization was not approved (${outcome})`)
      }
      const project = await ctx.novelRepository.initializeProject(
        root,
        { title: args.title },
        exec.signal,
        ctx.sandboxPolicy.resolve({ session: agent.session }),
      )
      return {
        status: 'created' as const,
        projectId: project.id,
        title: project.title,
        manifestPath: project.manifest.displayPath,
      }
    },
    presentCall: args => ({ card: 'generic', title: '初始化小说项目', kind: 'edit', rawInput: args.title }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_present',
    description: 'Open or close the Novel workbench for the current Novel Agent Session. This changes presentation only and never mutates an Asset.',
    parameters: {
      intent: {
        type: 'string', required: true, enum: ['open-workbench', 'close-workbench'],
        description: 'The exact workbench presentation action.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          intent: { type: 'string', required: true, enum: ['open-workbench', 'close-workbench'] },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: value.intent === 'open-workbench' ? 'Novel workbench opened.' : 'Novel workbench closed.',
      }],
      presentationMeta: (_args, value) => ({ kind: 'novel-presentation', intent: value.intent }),
    },
    execute(args) {
      return Promise.resolve({ intent: args.intent })
    },
    presentCall: args => ({
      card: 'generic',
      title: args.intent === 'open-workbench' ? '打开小说工作台' : '收起小说工作台',
      kind: 'read',
    }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_list',
    description: 'List the current Session Novel Project, typed Assets, exact references, and registered creation formats.',
    parameters: {},
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          projectId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          assets: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                assetId: { type: 'string', required: true },
                revisionId: { type: 'string', required: true },
                type: { type: 'string', required: true },
                parentAssetId: { type: 'string' },
                title: { type: 'string', required: true },
                path: { type: 'string', required: true },
                reference: { type: 'string', required: true },
              },
            },
          },
          creatableTypes: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                type: { type: 'string', required: true },
                description: { type: 'string', required: true },
                creationInstructions: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      const { agent, project } = await requireProject(ctx, exec)
      const assets = await ctx.novelRepository.listAssets(
        project, exec.signal, ctx.sandboxPolicy.resolve({ session: agent.session }),
      )
      return {
        projectId: project.id,
        title: project.title,
        assets: assets.map(asset => ({
          assetId: asset.asset.id,
          revisionId: asset.revisionId,
          type: asset.asset.type,
          ...(asset.asset.parentId === undefined ? {} : { parentAssetId: asset.asset.parentId }),
          title: asset.title,
          path: asset.asset.projectRelativePath,
          reference: encodeNovelReferenceUri({
            projectId: project.id, assetId: asset.asset.id, revisionId: asset.revisionId, label: asset.title,
          }),
        })),
        creatableTypes: ctx.novelAssetTypes.list()
          .filter((definition): definition is typeof definition & {
            readonly model: typeof definition.model & { readonly creationInstructions: string }
          } => definition.create !== undefined && definition.model.creationInstructions !== undefined)
          .map(definition => ({
            type: definition.type,
            description: definition.model.description,
            creationInstructions: definition.model.creationInstructions,
          })),
      }
    },
    presentCall: () => ({ card: 'generic', title: '浏览小说资产', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_get',
    description: 'Read exact retained Novel Asset references. Pass canonical dsh-novel: URIs from novel_list or the current context.',
    parameters: {
      references: { type: 'array', required: true, items: { type: 'string' }, description: 'Canonical dsh-novel: URIs to read.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          assets: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                projectId: { type: 'string', required: true },
                assetId: { type: 'string', required: true },
                revisionId: { type: 'string', required: true },
                type: { type: 'string', required: true },
                parentAssetId: { type: 'string' },
                path: { type: 'string', required: true },
                text: { type: 'string', required: true },
                utf16Length: { type: 'integer', required: true },
                proposalInstructions: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value.assets) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('novel_get requires an owning agent Session')
      if (args.references.length === 0) throw new Error('novel_get requires at least one reference')
      const resolved = await ctx.novelContextResolver.resolveReferences(
        exec.agent, args.references.map(value => decodeNovelReferenceUri(value)), exec.signal,
      )
      return {
        assets: resolved.references.map(reference => ({
          projectId: reference.input.projectId,
          assetId: reference.input.assetId,
          revisionId: reference.input.revisionId,
          type: reference.snapshot.asset.type,
          ...(reference.snapshot.asset.parentId === undefined ? {} : { parentAssetId: reference.snapshot.asset.parentId }),
          path: reference.snapshot.asset.projectRelativePath,
          text: reference.text,
          utf16Length: reference.text.length,
          proposalInstructions: ctx.novelAssetTypes.get(reference.snapshot.asset.type).model.proposalInstructions,
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '读取小说资产', kind: 'read', rawInput: args.references }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_get_analysis',
    description: 'Read persisted chapter-review or NOAI reports for exact retained chapter Revision references. Reports are derived analysis, not authored Assets or automatic prompt context.',
    parameters: {
      references: { type: 'array', required: true, items: { type: 'string' }, description: 'Canonical dsh-novel: chapter Revision URIs from novel_list, novel_search, or the current context.' },
      kinds: { type: 'array', items: { type: 'string', enum: ['chapter-review', 'noai-scan'] }, description: 'Optional report-kind allowlist.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          reports: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                projectId: { type: 'string', required: true },
                assetId: { type: 'string', required: true },
                revisionId: { type: 'string', required: true },
                title: { type: 'string', required: true },
                kind: { type: 'string', required: true, enum: ['chapter-review', 'noai-scan'] },
                analyzerVersion: { type: 'string', required: true },
                generatedAt: { type: 'string', required: true },
                dataJson: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value.reports) }],
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('novel_get_analysis requires an owning agent Session')
      if (args.references.length === 0) throw new Error('novel_get_analysis requires at least one reference')
      const resolved = await ctx.novelContextResolver.resolveReferences(
        exec.agent, args.references.map(value => decodeNovelReferenceUri(value)), exec.signal,
      )
      const catalog = await ctx.novelRepository.listAssets(
        resolved.project, exec.signal, ctx.sandboxPolicy.resolve({ session: exec.agent.session }),
      )
      const titles = new Map(catalog.map(summary => [summary.asset.id, summary.title]))
      const kinds = args.kinds === undefined
        ? undefined
        : new Set(args.kinds as NovelAnalysisReportKind[])
      const groups = await Promise.all(resolved.references.map(async (reference) => {
        const reports = await ctx.novelRepository.listAnalysisReports(
          resolved.project, reference.input.assetId, reference.input.revisionId, exec.signal,
        )
        return reports.filter(report => kinds?.has(report.kind) ?? true).map(report => ({
          projectId: report.projectId,
          assetId: report.assetId,
          revisionId: report.revisionId,
          title: titles.get(reference.input.assetId) ?? reference.input.assetId,
          kind: report.kind,
          analyzerVersion: report.analyzerVersion,
          generatedAt: report.generatedAt,
          dataJson: JSON.stringify(report.data),
        }))
      }))
      return { reports: groups.flat() }
    },
    presentCall: args => ({ card: 'generic', title: '读取小说分析报告', kind: 'read', rawInput: args.references }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_search',
    description: 'Search current Novel Assets by bounded lexical title/content match and return exact current Revision references. Results are discovery only and are not automatically added to context.',
    parameters: {
      query: { type: 'string', required: true, description: 'Non-empty title or authored-content clue.' },
      types: { type: 'array', items: { type: 'string' }, description: 'Optional exact Asset-type allowlist.' },
      limit: { type: 'integer', description: 'Optional result count from 1 to 50.' },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          results: {
            type: 'array', required: true,
            items: {
              type: 'object', additionalProperties: false,
              properties: {
                assetId: { type: 'string', required: true },
                revisionId: { type: 'string', required: true },
                type: { type: 'string', required: true },
                title: { type: 'string', required: true },
                excerpt: { type: 'string', required: true },
                reference: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value.results) }],
    },
    async execute(args, exec) {
      const { agent, project } = await requireProject(ctx, exec)
      const results = await ctx.novelRepository.searchAssets(project, {
        query: args.query,
        ...(args.types === undefined ? {} : { types: args.types as NovelAssetType[] }),
        ...(args.limit === undefined ? {} : { limit: args.limit }),
      }, exec.signal, ctx.sandboxPolicy.resolve({ session: agent.session }))
      return {
        results: results.map(({ summary, excerpt }) => ({
          assetId: summary.asset.id,
          revisionId: summary.revisionId,
          type: summary.asset.type,
          title: summary.title,
          excerpt,
          reference: encodeNovelReferenceUri({
            projectId: project.id,
            assetId: summary.asset.id,
            revisionId: summary.revisionId,
            label: summary.title,
          }),
        })),
      }
    },
    presentCall: args => ({ card: 'generic', title: '检索小说资产', kind: 'read', rawInput: args.query }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_create',
    description: 'Create one new typed Novel Asset at a repository-owned safe path. Use novel_list for the exact content shape and parent rules.',
    parameters: {
      type: { type: 'string', required: true },
      title: { type: 'string', required: true },
      parent_asset_id: { type: 'string' },
      content: {
        type: 'object', required: true, additionalProperties: true,
        properties: { kind: { type: 'string', required: true } },
      },
      ...GENERATION_PARAMETERS,
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          projectId: { type: 'string', required: true },
          assetId: { type: 'string', required: true },
          revisionId: { type: 'string', required: true },
          type: { type: 'string', required: true },
          parentAssetId: { type: 'string' },
          title: { type: 'string', required: true },
          path: { type: 'string', required: true },
          reference: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `已创建 ${value.title}（${value.type}），Revision ${value.revisionId}。` }],
      presentationMeta: (_args, value) => ({
        kind: 'novel-asset-created', projectId: value.projectId, assetId: value.assetId,
        revisionId: value.revisionId, assetType: value.type, title: value.title,
      }),
    },
    async execute(args, exec) {
      const { agent, project } = await requireProject(ctx, exec)
      const type = args.type as NovelAssetType
      ctx.novelAssetTypes.get(type)
      const generation = await generationLineage(ctx, agent, exec.signal, {
        ...(args.generation_strategy === undefined ? {} : { strategy: args.generation_strategy }),
        ...(args.action_plan_count === undefined ? {} : { actionPlanCount: args.action_plan_count }),
        ...(args.selected_action_plan === undefined ? {} : { selectedActionPlan: args.selected_action_plan }),
      })
      const snapshot = await ctx.novelRepository.createAsset(project, {
        type,
        title: args.title,
        ...(args.parent_asset_id === undefined ? {} : { parentId: AssetId(args.parent_asset_id) }),
        content: args.content as unknown as NovelAssetContent,
        actor: { kind: 'agent', sessionId: agent.id },
        generation,
      }, exec.signal, ctx.sandboxPolicy.resolve({ session: agent.session }))
      return {
        projectId: project.id,
        assetId: snapshot.asset.id,
        revisionId: snapshot.revisionId,
        type: snapshot.asset.type,
        ...(snapshot.asset.parentId === undefined ? {} : { parentAssetId: snapshot.asset.parentId }),
        title: args.title,
        path: snapshot.asset.projectRelativePath,
        reference: encodeNovelReferenceUri({
          projectId: project.id, assetId: snapshot.asset.id, revisionId: snapshot.revisionId, label: args.title,
        }),
      }
    },
    presentCall: args => ({ card: 'generic', title: '创建小说资产', kind: 'edit', rawInput: args.title }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_propose_changes',
    description: 'Create one reviewable typed ChangeSet against an exact retained Novel Asset Revision. This never applies the change.',
    parameters: {
      project_id: { type: 'string', required: true },
      asset_id: { type: 'string', required: true },
      base_revision_id: { type: 'string', required: true },
      operations: {
        type: 'array', required: true,
        items: { type: 'object', additionalProperties: true, properties: { kind: { type: 'string', required: true } } },
      },
      summary: { type: 'string', required: true },
      ...GENERATION_PARAMETERS,
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          changeSetId: { type: 'string', required: true },
          projectId: { type: 'string', required: true },
          assetId: { type: 'string', required: true },
          assetType: { type: 'string', required: true },
          baseRevisionId: { type: 'string', required: true },
          summary: { type: 'string', required: true },
          status: { type: 'string', required: true, enum: ['proposed'] },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `已创建修改提案 ${value.changeSetId}：${value.summary}。等待用户审阅，尚未修改资产。` }],
      presentationMeta: (_args, value) => ({
        kind: 'novel-change-set', changeSetId: value.changeSetId, projectId: value.projectId,
        assetId: value.assetId, baseRevisionId: value.baseRevisionId, summary: value.summary,
      }),
    },
    async execute(args, exec) {
      if (!exec.agent) throw new Error('novel_propose_changes requires an owning agent Session')
      const reference: NovelReferenceInput = {
        projectId: ProjectId(args.project_id),
        assetId: AssetId(args.asset_id),
        revisionId: RevisionId(args.base_revision_id),
      }
      const resolved = await ctx.novelContextResolver.resolveReferences(exec.agent, [reference], exec.signal)
      const [resolvedReference] = resolved.references
      if (resolvedReference === undefined) throw new Error('novel_propose_changes lost its exact resolved Asset')
      const assetType = resolvedReference.snapshot.asset.type
      const operations = ctx.novelAssetTypes.get(assetType).prepareOperations(resolvedReference.snapshot, args.operations)
      const generation = await generationLineage(ctx, exec.agent, exec.signal, {
        ...(args.generation_strategy === undefined ? {} : { strategy: args.generation_strategy }),
        ...(args.action_plan_count === undefined ? {} : { actionPlanCount: args.action_plan_count }),
        ...(args.selected_action_plan === undefined ? {} : { selectedActionPlan: args.selected_action_plan }),
      })
      const changeSet = await ctx.novelRepository.proposeChangeSet(resolved.project, {
        assetId: reference.assetId,
        baseRevisionId: reference.revisionId,
        operations,
        actor: { kind: 'agent', sessionId: exec.agent.id },
        summary: args.summary,
        generation,
      }, exec.signal)
      const warning = ctx.novelAnalysis.candidateWarning(resolvedReference.snapshot, operations)
      if (warning !== undefined) {
        exec.deferContext(createUserMessage({
          content: [{ type: 'text', text: warning.text }],
          source: {
            kind: 'plugin',
            plugin: 'novel-analysis',
            form: 'notice',
            summary: `NOAI candidate risk ${warning.report.riskScore}/100`,
          },
        }))
      }
      return {
        changeSetId: changeSet.id,
        projectId: changeSet.projectId,
        assetId: changeSet.assetId,
        assetType: changeSet.assetType,
        baseRevisionId: changeSet.baseRevisionId,
        summary: changeSet.summary,
        status: 'proposed' as const,
      }
    },
    presentCall: args => ({ card: 'generic', title: '提出小说修改', kind: 'edit', rawInput: args.summary }),
  }))
}

interface GenerationCoordinates {
  readonly strategy?: GenerationStrategy
  readonly actionPlanCount?: number
  readonly selectedActionPlan?: number
}

interface OptionalSkillRegistry {
  get(
    name: string,
    options: { readonly cwd?: string; readonly signal: AbortSignal; readonly scope: unknown },
  ): Promise<{ readonly metadata?: Readonly<Record<string, unknown>> } | undefined>
}

/** Build small, host-derived provenance without retaining prompts or generated prose. */
async function generationLineage(
  ctx: Context,
  agent: NonNullable<ToolRunContext['agent']>,
  signal: AbortSignal,
  coordinates: GenerationCoordinates,
): Promise<NovelGenerationLineage> {
  const strategy = coordinates.strategy ?? 'direct'
  validateGenerationCoordinates(strategy, coordinates.actionPlanCount, coordinates.selectedActionPlan)
  const events = agent.session.events
  const turn = events.findLast(event => event.type === 'turn/start')?.data.turn
  const requestHeader = agent.session.requestHeader()
  const presetId = currentPreset(agent.session.header.agentPreset, events)
  const context = currentNovelManifest(events, turn)
  const skillName = currentWritingSkill(events, turn)
  const skillVersion = skillName === undefined
    ? undefined
    : await currentSkillVersion(ctx, agent, skillName, signal)
  return {
    sessionId: agent.id,
    ...(turn === undefined ? {} : { turn }),
    ...(requestHeader?.config.provider === undefined ? {} : { provider: requestHeader.config.provider }),
    ...(requestHeader?.config.model === undefined ? {} : { model: requestHeader.config.model }),
    ...(presetId === undefined ? {} : { presetId }),
    ...(skillName === undefined ? {} : { skillName }),
    ...(skillVersion === undefined ? {} : { skillVersion }),
    ...(context === undefined ? {} : {
      contextManifestId: context.manifestId,
      contextPolicies: [...context.policies],
    }),
    strategy,
    ...(coordinates.actionPlanCount === undefined ? {} : { actionPlanCount: coordinates.actionPlanCount }),
    ...(coordinates.selectedActionPlan === undefined ? {} : { selectedActionPlan: coordinates.selectedActionPlan }),
  }
}

function validateGenerationCoordinates(
  strategy: GenerationStrategy,
  actionPlanCount: number | undefined,
  selectedActionPlan: number | undefined,
): void {
  if (strategy === 'direct') {
    if (actionPlanCount !== undefined || selectedActionPlan !== undefined) {
      throw new Error('direct generation must not include action-plan coordinates')
    }
    return
  }
  if (actionPlanCount === undefined || selectedActionPlan === undefined
    || !Number.isSafeInteger(actionPlanCount) || actionPlanCount < 2 || actionPlanCount > 3
    || !Number.isSafeInteger(selectedActionPlan) || selectedActionPlan < 1 || selectedActionPlan > actionPlanCount) {
    throw new Error('action-option generation requires 2–3 plans and one valid one-based selection')
  }
}

function currentPreset(
  initial: string | undefined,
  events: readonly { readonly type: string; readonly data: unknown }[],
): string | undefined {
  let preset = initial
  for (const event of events) {
    if (event.type !== 'agent-preset/selected') continue
    const value = (event.data as { agentPreset?: unknown }).agentPreset
    if (typeof value === 'string') preset = value
  }
  return preset
}

function currentNovelManifest(
  events: readonly { readonly type: string; readonly data: unknown }[],
  turn: number | undefined,
): { readonly manifestId: `sha256:${string}`; readonly policies: readonly string[] } | undefined {
  if (turn === undefined) return undefined
  let inTurn = false
  let latest: { readonly manifestId: `sha256:${string}`; readonly policies: readonly string[] } | undefined
  for (const event of events) {
    if (event.type === 'turn/start') {
      inTurn = (event.data as { turn?: unknown }).turn === turn
      continue
    }
    if (!inTurn || event.type !== 'user/message') continue
    const source = (event.data as { source?: unknown }).source
    if (typeof source !== 'object' || source === null) continue
    const record = source as Record<string, unknown>
    if (record['kind'] !== 'novel-context' || record['version'] !== 3
      || typeof record['manifestId'] !== 'string' || !Array.isArray(record['policies'])
      || record['policies'].some(value => typeof value !== 'string')) continue
    latest = {
      manifestId: record['manifestId'] as `sha256:${string}`,
      policies: record['policies'] as string[],
    }
  }
  return latest
}

function currentWritingSkill(
  events: readonly { readonly type: string; readonly data: unknown }[],
  turn: number | undefined,
): string | undefined {
  if (turn === undefined) return undefined
  let inTurn = false
  let latest: string | undefined
  const successfulCalls = new Set<string>()
  for (const event of events) {
    if (event.type !== 'tool/result') continue
    const data = event.data as {
      error?: unknown
      message?: { content?: Array<{ toolCallId?: unknown; isError?: unknown }> }
    }
    const block = data.message?.content?.[0]
    if (data.error === undefined && block?.isError === false && typeof block.toolCallId === 'string') {
      successfulCalls.add(block.toolCallId)
    }
  }
  for (const event of events) {
    if (event.type === 'turn/start') {
      inTurn = (event.data as { turn?: unknown }).turn === turn
      continue
    }
    if (!inTurn) continue
    if (event.type === 'user/message') {
      const source = (event.data as { source?: unknown }).source
      if (typeof source === 'object' && source !== null) {
        const record = source as Record<string, unknown>
        if (record['kind'] === 'skill-invocation' && typeof record['name'] === 'string') latest = record['name']
      }
      continue
    }
    if (event.type !== 'tool/call') continue
    const data = event.data as { callId?: unknown; name?: unknown; arguments?: unknown }
    if (data.name !== 'skill' || typeof data.callId !== 'string' || !successfulCalls.has(data.callId)
      || typeof data.arguments !== 'string') continue
    try {
      const value: unknown = JSON.parse(data.arguments)
      if (typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>)['name'] === 'string') {
        latest = (value as Record<string, string>)['name']
      }
    } catch {
      // Invalid tool arguments cannot be a successfully loaded Skill.
    }
  }
  return latest
}

async function currentSkillVersion(
  ctx: Context,
  agent: NonNullable<ToolRunContext['agent']>,
  skillName: string,
  signal: AbortSignal,
): Promise<number | undefined> {
  const skills = (agent.ctx as Context & { get(name: 'skills'): OptionalSkillRegistry | undefined }).get('skills')
    ?? (ctx as Context & { get(name: 'skills'): OptionalSkillRegistry | undefined }).get('skills')
  const skill = await skills?.get(skillName, {
    ...(agent.session.header.cwd === undefined ? {} : { cwd: agent.session.header.cwd }),
    signal,
    scope: agent,
  })
  const value = skill?.metadata?.['novelSkillVersion']
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

async function requireProject(ctx: Context, exec: ToolRunContext) {
  const { agent, root } = await requireNovelRoot(ctx, exec)
  const project = await ctx.novelRepository.discoverProject(root, exec.signal)
  if (project === undefined) throw new Error('Novel tools require the Session working directory to be a Novel Project')
  return { agent, project }
}

async function requireNovelRoot(ctx: Context, exec: ToolRunContext) {
  const agent = exec.agent
  if (agent === undefined) throw new Error('Novel tools require an owning agent Session')
  const cwd = agent.session.header.cwd
  if (cwd === undefined) throw new Error('Novel tools require a working directory')
  const root = await ctx.fs.resolve(cwd, { cwd, signal: exec.signal })
  return { agent, root }
}
