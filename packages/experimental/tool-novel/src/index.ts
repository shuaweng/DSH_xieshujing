/** Safe Novel tools: exact reads and proposal-only authored mutations. */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-sandbox-policy'
import {
  AssetId,
  ProjectId,
  RevisionId,
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
canonical reference is available, use \`novel_list\` to discover the current Project.
Use \`novel_get\` for exact retained Revisions and the Asset type's proposal
instructions. Use \`novel_propose_changes\` for typed Asset changes; it only creates
a ChangeSet for user review and never means the file changed. Do not claim a proposal
was applied.`

/** Register exact-read and proposal-only Novel tools. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.section({ name: 'tool:novel', order: 111, text: PROMPT })

  ctx.tools.register(defineTool({
    name: 'novel_list',
    description: 'List the current Session Novel Project and its typed Assets with canonical exact-Revision references.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          projectId: { type: 'string', required: true },
          title: { type: 'string', required: true },
          assets: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                assetId: { type: 'string', required: true },
                revisionId: { type: 'string', required: true },
                type: { type: 'string', required: true },
                title: { type: 'string', required: true },
                path: { type: 'string', required: true },
                reference: { type: 'string', required: true },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
    },
    async execute(_args, exec) {
      const agent = exec.agent
      if (agent === undefined) throw new Error('novel_list requires an owning agent Session')
      const cwd = agent.session.header.cwd
      if (cwd === undefined) throw new Error('novel_list requires a Novel Project working directory')
      const root = await ctx.fs.resolve(cwd, { cwd, signal: exec.signal })
      const project = await ctx.novelRepository.discoverProject(root, exec.signal)
      if (project === undefined) throw new Error('novel_list requires the Session working directory to be a Novel Project')
      const assets = await ctx.novelRepository.listAssets(
        project,
        exec.signal,
        ctx.sandboxPolicy.resolve({ session: agent.session }),
      )
      return {
        projectId: project.id,
        title: project.title,
        assets: assets.map(asset => ({
          assetId: asset.asset.id,
          revisionId: asset.revisionId,
          type: asset.asset.type,
          title: asset.title,
          path: asset.asset.projectRelativePath,
          reference: encodeNovelReferenceUri({
            projectId: project.id,
            assetId: asset.asset.id,
            revisionId: asset.revisionId,
            label: asset.title,
          }),
        })),
      }
    },
    presentCall: () => ({ card: 'generic', title: '浏览小说资产', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'novel_get',
    description: 'Read exact retained Novel Asset references. Pass canonical dsh-novel: URIs from the current context.',
    parameters: {
      references: {
        type: 'array',
        required: true,
        items: { type: 'string' },
        description: 'Canonical dsh-novel: URIs to read.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          assets: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                projectId: { type: 'string', required: true },
                assetId: { type: 'string', required: true },
                revisionId: { type: 'string', required: true },
                type: { type: 'string', required: true },
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
      const references = args.references.map(value => decodeNovelReferenceUri(value))
      const resolved = await ctx.novelContextResolver.resolveReferences(exec.agent, references, exec.signal)
      return {
        assets: resolved.references.map(reference => ({
          projectId: reference.input.projectId,
          assetId: reference.input.assetId,
          revisionId: reference.input.revisionId,
          type: reference.snapshot.asset.type,
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
    name: 'novel_propose_changes',
    description: 'Create one reviewable typed ChangeSet against an exact retained Novel Asset Revision. Pass operations in the format returned by novel_get. The Host type adapter validates and adds integrity metadata. This never applies the change.',
    parameters: {
      project_id: { type: 'string', required: true },
      asset_id: { type: 'string', required: true },
      base_revision_id: { type: 'string', required: true },
      operations: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: true,
          properties: { kind: { type: 'string', required: true } },
        },
      },
      summary: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
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
      render: (_args, value) => [{
        type: 'text',
        text: `已创建修改提案 ${value.changeSetId}：${value.summary}。等待用户审阅，尚未修改资产。`,
      }],
      presentationMeta: (_args, value) => ({
        kind: 'novel-change-set',
        changeSetId: value.changeSetId,
        projectId: value.projectId,
        assetId: value.assetId,
        baseRevisionId: value.baseRevisionId,
        summary: value.summary,
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
      const operations = ctx.novelAssetTypes.get(assetType)
        .prepareOperations(resolvedReference.snapshot, args.operations)
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
