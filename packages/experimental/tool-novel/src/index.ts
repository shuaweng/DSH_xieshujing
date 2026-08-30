/** Safe Novel tools: discovery, typed creation, exact reads, and proposal-only mutations. */

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
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
generation lineage from the Session. Ordinary scenes go straight to the final Novel
tool. For a key or genuinely uncertain scene, first call
\`novel_choose_scene_action\` with 2–3 short, materially different actions. Let that
tool obtain the author's choice when requested, or durably record the Agent's own
selection; then pass its successful call id as \`scene_decision_call_id\` to the final
\`novel_create\` or \`novel_propose_changes\` call. Never invent selection coordinates.`

const SCENE_WRITING_SKILLS = new Set(['chapter-execution', 'scene-drive'])
const SCENE_QUESTION_ID = 'scene-action'

const SCENE_DECISION_PARAMETER = {
  scene_decision_call_id: {
    type: 'string' as const,
    description: 'Successful same-turn novel_choose_scene_action call id. Omit for ordinary direct writing.',
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
      description: { type: 'string', description: 'Optional concise author-visible synopsis for the project manifest.' },
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
        {
          title: args.title,
          ...(args.description === undefined ? {} : { description: args.description }),
        },
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
    name: 'novel_choose_scene_action',
    description: 'Record one bounded 2–3-option decision for a key or genuinely uncertain scene. User mode asks through the native DSH question surface; Agent mode records the Agent-selected option. Ordinary scenes should skip this tool.',
    parameters: {
      selection_mode: {
        type: 'string', required: true, enum: ['user', 'agent'],
        description: 'Ask the author through DSH, or record an Agent-owned comparison.',
      },
      goal: {
        type: 'string', required: true,
        description: 'Short statement of the scene decision being made; not a prose prompt.',
      },
      target_asset_id: {
        type: 'string',
        description: 'Existing target Asset id. Supply together with base_revision_id; omit for a new Asset.',
      },
      base_revision_id: {
        type: 'string',
        description: 'Exact retained target Revision. Supply together with target_asset_id.',
      },
      options: {
        type: 'array', required: true,
        description: 'Exactly 2–3 materially different dramatic actions, kept short.',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            id: { type: 'string', required: true, description: 'Short stable id unique inside this decision.' },
            title: { type: 'string', required: true, description: 'Concise author-visible option name.' },
            action: { type: 'string', required: true, description: 'What the character does, how resistance answers, and what changes.' },
            tradeoff: { type: 'string', required: true, description: 'Main gain and cost of this dramatic path.' },
          },
        },
      },
      selected_option_id: {
        type: 'string',
        description: 'Required only in Agent mode; must name one supplied option. User mode must omit it.',
      },
    },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          decisionCallId: { type: 'string', required: true },
          projectId: { type: 'string', required: true },
          selectionMode: { type: 'string', required: true, enum: ['user', 'agent'] },
          optionCount: { type: 'integer', required: true },
          selectedOptionId: { type: 'string', required: true },
          selectedOptionIndex: { type: 'integer', required: true },
          selectedTitle: { type: 'string', required: true },
          targetAssetId: { type: 'string' },
          baseRevisionId: { type: 'string' },
          contextManifestId: { type: 'string', required: true },
          writingSkill: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: `已选择场景行动 ${value.selectedOptionIndex}/${value.optionCount}：${value.selectedTitle}。后续落稿须引用决策 ${value.decisionCallId}。`,
      }],
      presentationMeta: (_args, value) => ({
        kind: 'novel-scene-action-decision',
        decisionCallId: value.decisionCallId,
        projectId: value.projectId,
        selectionMode: value.selectionMode,
        optionCount: value.optionCount,
        selectedOptionId: value.selectedOptionId,
        selectedOptionIndex: value.selectedOptionIndex,
        selectedTitle: value.selectedTitle,
        ...(value.targetAssetId === undefined ? {} : { targetAssetId: value.targetAssetId }),
        ...(value.baseRevisionId === undefined ? {} : { baseRevisionId: value.baseRevisionId }),
        contextManifestId: value.contextManifestId,
        writingSkill: value.writingSkill,
      }),
    },
    async execute(args, exec) {
      const { agent, project } = await requireProject(ctx, exec)
      const options = normalizeSceneOptions(args.options)
      const goal = boundedSceneText(args.goal, 'goal', 300)
      if ((args.target_asset_id === undefined) !== (args.base_revision_id === undefined)) {
        throw new Error('scene action target_asset_id and base_revision_id must be supplied together')
      }
      let resolvedTarget: Awaited<ReturnType<typeof ctx.novelContextResolver.resolveReferences>>['references'][number] | undefined
      if (args.target_asset_id !== undefined && args.base_revision_id !== undefined) {
        const resolved = await ctx.novelContextResolver.resolveReferences(agent, [{
          projectId: project.id,
          assetId: AssetId(args.target_asset_id),
          revisionId: RevisionId(args.base_revision_id),
        }], exec.signal)
        resolvedTarget = resolved.references[0]
        if (resolvedTarget === undefined) throw new Error('scene action choice lost its exact target Revision')
      }
      const decisionContext = await prepareSceneDecisionContext(
        ctx, agent, exec, project.id, resolvedTarget,
      )
      let selectedOptionId: string
      if (args.selection_mode === 'agent') {
        if (args.selected_option_id === undefined) {
          throw new Error('Agent scene-action selection requires selected_option_id')
        }
        selectedOptionId = args.selected_option_id
      } else {
        if (args.selected_option_id !== undefined) {
          throw new Error('User scene-action selection must not preselect selected_option_id')
        }
        const interaction = ctx.get('userQuestions')
        if (interaction === undefined) {
          throw new Error('No DSH user-question surface is available for the scene-action choice')
        }
        const labels = new Map(options.map((option, index) => [`${index + 1}. ${option.title}`, option.id]))
        const answer = await interaction.ask({
          questions: [{
            id: SCENE_QUESTION_ID,
            header: '场景行动选择',
            question: goal,
            detail: '请选择本次正文实际采用的一条戏剧行动。若要补充或推翻方案，请使用“其他”；Agent 会据此重拟，而不会把它冒充成已授权选择。',
            options: options.map((option, index) => ({
              label: `${index + 1}. ${option.title}`,
              description: `${option.action}\n取舍：${option.tradeoff}`,
            })),
          }],
          agent,
          signal: exec.signal,
        })
        const entries = answer.answers.filter(item => item.id === SCENE_QUESTION_ID)
        const entry = entries.length === 1 ? entries[0] : undefined
        if (entry?.custom !== undefined || entry?.selected.length !== 1) {
          const feedback = entry?.custom?.trim()
          throw new Error(feedback === undefined || feedback === ''
            ? 'The author did not select exactly one scene action; stop and wait for direction.'
            : `The author supplied scene feedback instead of authorizing an option: ${feedback}. Revise the actions before asking again.`)
        }
        const selectedLabel = entry.selected.at(0)
        if (selectedLabel === undefined) throw new Error('The author did not select a scene action')
        const resolved = labels.get(selectedLabel)
        if (resolved === undefined) throw new Error('The author response does not match any offered scene action')
        selectedOptionId = resolved
      }
      const selectedIndex = options.findIndex(option => option.id === selectedOptionId)
      if (selectedIndex < 0) throw new Error('selected_option_id must name one supplied scene action')
      const selected = options.at(selectedIndex)
      if (selected === undefined) throw new Error('selected scene action is unavailable')
      return {
        decisionCallId: exec.callId,
        projectId: project.id,
        selectionMode: args.selection_mode,
        optionCount: options.length,
        selectedOptionId: selected.id,
        selectedOptionIndex: selectedIndex + 1,
        selectedTitle: selected.title,
        ...(args.target_asset_id === undefined ? {} : { targetAssetId: args.target_asset_id }),
        ...(args.base_revision_id === undefined ? {} : { baseRevisionId: args.base_revision_id }),
        contextManifestId: decisionContext.manifestId,
        writingSkill: decisionContext.skillName,
      }
    },
    presentCall: args => ({
      card: 'generic',
      title: args.selection_mode === 'user' ? '请作者选择场景行动' : '记录场景行动选择',
      kind: 'read',
      rawInput: args.goal,
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
      ...SCENE_DECISION_PARAMETER,
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
        ...(args.scene_decision_call_id === undefined ? {} : {
          sceneDecisionCallId: args.scene_decision_call_id,
          target: { kind: 'new-asset' as const, projectId: project.id },
        }),
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
      ...SCENE_DECISION_PARAMETER,
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
        ...(args.scene_decision_call_id === undefined ? {} : {
          sceneDecisionCallId: args.scene_decision_call_id,
          target: {
            kind: 'existing-asset' as const,
            projectId: reference.projectId,
            assetId: reference.assetId,
            revisionId: reference.revisionId,
          },
        }),
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

interface GenerationRequest {
  readonly sceneDecisionCallId?: string
  readonly target?: SceneDecisionTarget
}

type SceneDecisionTarget =
  | { readonly kind: 'new-asset'; readonly projectId: ProjectId }
  | {
    readonly kind: 'existing-asset'
    readonly projectId: ProjectId
    readonly assetId: AssetId
    readonly revisionId: RevisionId
  }

interface SceneActionOption {
  readonly id: string
  readonly title: string
  readonly action: string
  readonly tradeoff: string
}

interface SceneDecisionMeta {
  readonly callId: string
  readonly projectId: ProjectId
  readonly selectionMode: 'user' | 'agent'
  readonly optionCount: number
  readonly selectedOptionIndex: number
  readonly targetAssetId?: AssetId
  readonly baseRevisionId?: RevisionId
  readonly contextManifestId: `sha256:${string}`
  readonly writingSkill: string
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
  request: GenerationRequest,
): Promise<NovelGenerationLineage> {
  const events = agent.session.events
  const turn = events.findLast(event => event.type === 'turn/start')?.data.turn
  const requestHeader = agent.session.requestHeader()
  const presetId = currentPreset(agent.session.header.agentPreset, events)
  const context = currentNovelManifest(events, turn)
  const sceneDecision = request.sceneDecisionCallId === undefined
    ? undefined
    : resolveSceneDecision(events, request.sceneDecisionCallId, request.target)
  const skillName = sceneDecision?.writingSkill ?? currentWritingSkill(events, turn)
  const skillVersion = skillName === undefined
    ? undefined
    : await currentSkillVersion(ctx, agent, skillName, signal)
  const strategy = sceneDecision === undefined
    ? 'direct' as const
    : sceneDecision.selectionMode === 'user'
      ? 'action-options-user-selected' as const
      : 'action-options-agent-selected' as const
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
    ...(sceneDecision === undefined ? {} : {
      sceneDecisionCallId: sceneDecision.callId,
      actionPlanCount: sceneDecision.optionCount,
      selectedActionPlan: sceneDecision.selectedOptionIndex,
    }),
  }
}

function normalizeSceneOptions(value: readonly unknown[]): readonly SceneActionOption[] {
  if (value.length < 2 || value.length > 3) throw new Error('scene action choice requires exactly 2–3 options')
  const ids = new Set<string>()
  return value.map((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
      throw new Error(`scene action option ${index + 1} must be an object`)
    }
    const record = candidate as Record<string, unknown>
    const id = boundedSceneText(record['id'], `option ${index + 1} id`, 80)
    if (!/^[a-z0-9][a-z0-9_-]*$/u.test(id)) {
      throw new Error(`scene action option ${index + 1} id must use lowercase letters, digits, hyphen, or underscore`)
    }
    if (ids.has(id)) throw new Error(`scene action option id ${JSON.stringify(id)} is duplicated`)
    ids.add(id)
    return {
      id,
      title: boundedSceneText(record['title'], `option ${index + 1} title`, 80),
      action: boundedSceneText(record['action'], `option ${index + 1} action`, 600),
      tradeoff: boundedSceneText(record['tradeoff'], `option ${index + 1} tradeoff`, 300),
    }
  })
}

function boundedSceneText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`scene action ${label} must be a string`)
  const text = value.trim()
  if (text.length === 0 || text.length > maxLength) {
    throw new Error(`scene action ${label} must contain 1–${maxLength} characters`)
  }
  return text
}

async function prepareSceneDecisionContext(
  ctx: Context,
  agent: NonNullable<ToolRunContext['agent']>,
  exec: ToolRunContext,
  projectId: ProjectId,
  target: Awaited<ReturnType<typeof ctx.novelContextResolver.resolveReferences>>['references'][number] | undefined,
): Promise<{ readonly manifestId: `sha256:${string}`; readonly skillName: string }> {
  const events = agent.session.events
  const turn = events.findLast(event => event.type === 'turn/start')?.data.turn
  const skillName = latestLoadedSkill(events, turn)
  if (skillName === undefined || !SCENE_WRITING_SKILLS.has(skillName)) {
    throw new Error('Load chapter-execution or scene-drive with the skill tool, then retry the scene action choice.')
  }
  const current = currentNovelManifest(events, turn)
  if (current !== undefined && current.policies.includes('chapter-write')
    && (target === undefined || current.references.some(reference =>
      reference.assetId === target.snapshot.asset.id
      && reference.revisionId === target.snapshot.revisionId))) {
    return { manifestId: current.manifestId, skillName }
  }
  if (target === undefined) {
    throw new Error('scene action choices for a new chapter require a current chapter-write Novel Context Manifest')
  }
  const compiled = await ctx.novelContextResolver.compile(agent, {
    policies: ['chapter-write'],
    targets: [{
      projectId,
      assetId: target.snapshot.asset.id,
      revisionId: target.snapshot.revisionId,
      label: target.input.label,
      origin: 'message',
      mode: 'explicit',
      projection: 'full',
      reason: 'target-asset',
      required: true,
    }],
    includeWorkset: true,
  }, exec.signal)
  exec.deferContext(compiled.additionalContext)
  return { manifestId: compiled.source.manifestId, skillName }
}

function requireSceneDecisionContext(
  events: readonly { readonly type: string; readonly data: unknown }[],
): { readonly manifestId: `sha256:${string}`; readonly skillName: string } {
  const turnEvent = events.findLast(event => event.type === 'turn/start')
  const turn = turnEvent === undefined
    ? undefined
    : (turnEvent.data as { turn?: number }).turn
  const context = currentNovelManifest(events, turn)
  if (context === undefined || !context.policies.includes('chapter-write')) {
    throw new Error('scene action choices require the current chapter-write Novel Context Manifest')
  }
  const skillName = latestLoadedSkill(events, turn)
  if (skillName === undefined || !SCENE_WRITING_SKILLS.has(skillName)) {
    throw new Error('scene action choices require chapter-execution or scene-drive to remain the active Session Skill')
  }
  return { manifestId: context.manifestId, skillName }
}

function resolveSceneDecision(
  events: readonly { readonly type: string; readonly data: unknown }[],
  callId: string,
  target: SceneDecisionTarget | undefined,
): SceneDecisionMeta {
  if (callId.length === 0 || callId.length > 300 || callId !== callId.trim()) {
    throw new Error('scene_decision_call_id is invalid')
  }
  if (target === undefined) throw new Error('scene decision target binding is missing')
  const turnEvent = events.findLast(event => event.type === 'turn/start')
  const turn = turnEvent === undefined
    ? undefined
    : (turnEvent.data as { turn?: number }).turn
  if (turn === undefined) throw new Error('scene decision requires an active Session turn')
  const call = events.find((event) => {
    if (event.type !== 'tool/call') return false
    const data = event.data as { callId?: unknown; name?: unknown; turn?: unknown }
    return data.callId === callId && data.name === 'novel_choose_scene_action' && data.turn === turn
  })
  if (call === undefined) {
    throw new Error('scene_decision_call_id must reference a novel_choose_scene_action call in the current turn')
  }
  const result = events.find((event) => {
    if (event.type !== 'tool/result') return false
    const data = event.data as {
      turn?: unknown
      error?: unknown
      message?: { content?: Array<{ toolCallId?: unknown; isError?: unknown }> }
    }
    const block = data.message?.content?.[0]
    return data.turn === turn && data.error === undefined && block?.toolCallId === callId && block.isError === false
  })
  if (result === undefined || result.type !== 'tool/result') {
    throw new Error('scene_decision_call_id must reference a successful completed decision')
  }
  const meta = (result.data as { meta?: unknown }).meta
  if (typeof meta !== 'object' || meta === null || Array.isArray(meta)) {
    throw new Error('scene decision result is missing durable metadata')
  }
  const record = meta as Record<string, unknown>
  if (record['kind'] !== 'novel-scene-action-decision' || record['decisionCallId'] !== callId) {
    throw new Error('scene decision metadata does not match the referenced call')
  }
  const selectionMode = record['selectionMode']
  const optionCount = record['optionCount']
  const selectedOptionIndex = record['selectedOptionIndex']
  const contextManifestId = record['contextManifestId']
  const writingSkill = record['writingSkill']
  const targetAssetId = record['targetAssetId']
  const baseRevisionId = record['baseRevisionId']
  if ((selectionMode !== 'user' && selectionMode !== 'agent')
    || !Number.isSafeInteger(optionCount) || Number(optionCount) < 2 || Number(optionCount) > 3
    || !Number.isSafeInteger(selectedOptionIndex) || Number(selectedOptionIndex) < 1
    || Number(selectedOptionIndex) > Number(optionCount)
    || typeof contextManifestId !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(contextManifestId)
    || typeof writingSkill !== 'string' || !SCENE_WRITING_SKILLS.has(writingSkill)
    || (targetAssetId !== undefined && typeof targetAssetId !== 'string')
    || (baseRevisionId !== undefined && typeof baseRevisionId !== 'string')) {
    throw new Error('scene decision metadata is invalid')
  }
  if (record['projectId'] !== target.projectId) throw new Error('scene decision belongs to a different Novel Project')
  if (target.kind === 'new-asset') {
    if (targetAssetId !== undefined || baseRevisionId !== undefined) {
      throw new Error('scene decision for new Asset creation must not target an existing Revision')
    }
  } else if (targetAssetId !== target.assetId || baseRevisionId !== target.revisionId) {
    throw new Error('scene decision target does not match the exact Asset Revision being changed')
  }
  const current = requireSceneDecisionContext(events)
  if (current.manifestId !== contextManifestId || current.skillName !== writingSkill) {
    throw new Error('scene decision is stale because the Novel context or writing Skill changed')
  }
  return {
    callId,
    projectId: target.projectId,
    selectionMode,
    optionCount: Number(optionCount),
    selectedOptionIndex: Number(selectedOptionIndex),
    ...(target.kind === 'new-asset' ? {} : {
      targetAssetId: target.assetId,
      baseRevisionId: target.revisionId,
    }),
    contextManifestId: current.manifestId,
    writingSkill,
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
): {
  readonly manifestId: `sha256:${string}`
  readonly policies: readonly string[]
  readonly references: readonly { readonly assetId: string; readonly revisionId: string }[]
} | undefined {
  if (turn === undefined) return undefined
  let inTurn = false
  let latest: {
    readonly manifestId: `sha256:${string}`
    readonly policies: readonly string[]
    readonly references: readonly { readonly assetId: string; readonly revisionId: string }[]
  } | undefined
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
      || record['policies'].some(value => typeof value !== 'string') || !Array.isArray(record['references'])) continue
    const references = record['references'].flatMap((reference): Array<{ assetId: string; revisionId: string }> => {
      if (typeof reference !== 'object' || reference === null || Array.isArray(reference)) return []
      const item = reference as Record<string, unknown>
      return typeof item['assetId'] === 'string' && typeof item['revisionId'] === 'string'
        ? [{ assetId: item['assetId'], revisionId: item['revisionId'] }]
        : []
    })
    latest = {
      manifestId: record['manifestId'] as `sha256:${string}`,
      policies: record['policies'] as string[],
      references,
    }
  }
  return latest
}

function currentWritingSkill(
  events: readonly { readonly type: string; readonly data: unknown }[],
  turn: number | undefined,
): string | undefined {
  return loadedSkill(events, turn, true)
}

/** Most recently loaded Skill in the Session up through the active turn. */
function latestLoadedSkill(
  events: readonly { readonly type: string; readonly data: unknown }[],
  turn: number | undefined,
): string | undefined {
  return loadedSkill(events, turn, false)
}

function loadedSkill(
  events: readonly { readonly type: string; readonly data: unknown }[],
  turn: number | undefined,
  currentTurnOnly: boolean,
): string | undefined {
  if (turn === undefined) return undefined
  let activeTurn: number | undefined
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
      const candidate = (event.data as { turn?: unknown }).turn
      activeTurn = typeof candidate === 'number' ? candidate : undefined
      if (activeTurn !== undefined && activeTurn > turn) break
      continue
    }
    if (activeTurn === undefined || activeTurn > turn || (currentTurnOnly && activeTurn !== turn)) continue
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
