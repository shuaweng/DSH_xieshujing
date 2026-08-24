/** Safe Novel tools: discovery, typed creation, exact reads, and proposal-only mutations. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import {
  AssetId,
  ProjectId,
  RevisionId,
  type NovelAssetContent,
  type NovelAssetType,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import type {} from '@deepseek-ai/dsh-experimental-novel-repository/asset-types'
import {
  decodeNovelReferenceUri,
  encodeNovelReferenceUri,
  type NovelReferenceInput,
} from '@deepseek-ai/dsh-experimental-novel-context'

export const name = 'tool-novel'
export const inject = ['tools', 'systemPrompt', 'novelContextResolver', 'novelRepository', 'novelAssetTypes', 'fs', 'sandboxPolicy']

const PROMPT = `## Novel workbench tools

Novel Assets are versioned authored material. When the user names an Asset but no
canonical reference is available, use \`novel_list\` to discover the current Project
and the exact creation formats, or \`novel_search\` when a title or content clue is known.
Search only discovers exact current references; read chosen results with \`novel_get\`.
Use \`novel_create\` for new typed Assets; never invent
a file path. Use \`novel_get\` for exact retained Revisions and proposal instructions.
Use \`novel_propose_changes\` for existing Asset changes; it only creates a ChangeSet
for user review and never means the file changed. Use \`novel_present\` only to open or
close the Novel workbench when that presentation helps the current task. Do not claim
a proposal was applied.`

/** Register creation, exact-read, and proposal-only Novel tools. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({ name: 'tool:novel', order: 111, text: PROMPT })

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
      const snapshot = await ctx.novelRepository.createAsset(project, {
        type,
        title: args.title,
        ...(args.parent_asset_id === undefined ? {} : { parentId: AssetId(args.parent_asset_id) }),
        content: args.content as unknown as NovelAssetContent,
        actor: { kind: 'agent', sessionId: agent.id },
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
      const changeSet = await ctx.novelRepository.proposeChangeSet(resolved.project, {
        assetId: reference.assetId,
        baseRevisionId: reference.revisionId,
        operations,
        actor: { kind: 'agent', sessionId: exec.agent.id },
        summary: args.summary,
      }, exec.signal)
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

async function requireProject(ctx: Context, exec: ToolRunContext) {
  const agent = exec.agent
  if (agent === undefined) throw new Error('Novel tools require an owning agent Session')
  const cwd = agent.session.header.cwd
  if (cwd === undefined) throw new Error('Novel tools require a Novel Project working directory')
  const root = await ctx.fs.resolve(cwd, { cwd, signal: exec.signal })
  const project = await ctx.novelRepository.discoverProject(root, exec.signal)
  if (project === undefined) throw new Error('Novel tools require the Session working directory to be a Novel Project')
  return { agent, project }
}
