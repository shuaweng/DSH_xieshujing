import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SandboxPolicy from '@deepseek-ai/dsh-sandbox-policy'
import { CallId } from '@deepseek-ai/dsh-llm'
import {
  AssetId,
  ChangeSetId,
  ProjectId,
  type ContentHash,
  type RevisionId,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelContextResolver, {
  encodeNovelReferenceUri,
} from '../../novel-context/src/index.ts'
import { Session, SessionId } from '@deepseek-ai/dsh-session'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { afterEach, describe, expect, it } from 'vitest'
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
  quoteHash: ContentHash
}> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-tool-novel-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'manuscript'))
  await writeFile(join(dir, 'novel.yaml'), [
    'kind: novel-project',
    'schema: 1',
    'id: project-tool',
    'title: Tool Project',
    'contentRoots:',
    '  manuscript: manuscript',
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
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(SandboxPolicy, { mode: 'workspace-write', workspaceRoot: dir })
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(NovelContextResolver)
  await ctx.plugin(ToolNovel)
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (project === undefined) throw new Error('expected Novel Project')
  const [asset] = await ctx.novelRepository.listAssets(project)
  if (asset === undefined) throw new Error('expected chapter Asset')
  const selection = await ctx.novelRepository.captureSelection(project, {
    assetId: asset.asset.id,
    revisionId: asset.revisionId,
    startUtf16: 2,
    endUtf16: 4,
  })
  const id = SessionId('tool-novel-agent')
  const session = Session.create(id, [], { version: 0, id, createdAt: 0, cwd: dir })
  return {
    ctx,
    agent: { id, session, ctx } as Agent,
    path,
    revisionId: asset.revisionId,
    quoteHash: selection.selector.quoteHash,
  }
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
      .toEqual(['novel_get', 'novel_list', 'novel_propose_changes'])
    const assembly = await ctx.systemPrompt.assemble({ scope: agent.ctx })
    expect(renderPrompt(assembly)).toContain('绝不代表文件已经修改')

    const read = ctx.tools.get('novel_get')!
    expect(read.output.render({}, { assets: [] })).toEqual([{ type: 'text', text: '[]' }])
    expect(read.presentCall?.({ references: ['dsh-novel:ref'] })).toEqual({
      card: 'generic', title: '读取小说资产', kind: 'read', rawInput: ['dsh-novel:ref'],
    })
    const list = ctx.tools.get('novel_list')!
    expect(list.presentCall?.({})).toEqual({ card: 'generic', title: '浏览小说资产', kind: 'read' })
    const propose = ctx.tools.get('novel_propose_changes')!
    const value = {
      changeSetId: 'changeset-1', projectId: 'project-tool', assetId: 'chapter-tool',
      baseRevisionId: 'revision-1', summary: '摘要', status: 'proposed' as const,
    }
    expect(propose.output.render({}, value as never)).toEqual([{
      type: 'text', text: '已创建修改提案 changeset-1：摘要。等待用户审阅，尚未修改正文。',
    }])
    expect(propose.output.presentationMeta?.({}, value as never)).toMatchObject({
      kind: 'novel-change-set', changeSetId: 'changeset-1', summary: '摘要',
    })
    expect(propose.presentCall?.({
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: 'revision-1',
      start_utf16: 0, end_utf16: 1, quote_hash: 'sha256:q', replacement: '新', summary: '摘要',
    })).toEqual({
      card: 'generic', title: '提出小说修改', kind: 'edit', rawInput: '摘要',
    })
  })

  it('discovers the current project and returns canonical exact-Revision references', async () => {
    const { ctx, agent, revisionId } = await harness()
    const result = await execute(ctx, agent, 'novel_list', {})
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected novel_list success')
    expect(result.value).toMatchObject({
      projectId: 'project-tool',
      title: 'Tool Project',
      assets: [{
        assetId: 'chapter-tool', revisionId, title: 'Tool Chapter', path: 'manuscript/chapter.md',
      }],
    })
    const value = result.value as { assets: Array<{ reference: string }> }
    expect(value.assets[0]?.reference).toMatch(/^dsh-novel:[A-Za-z0-9_-]+$/u)
    await expect(execute(ctx, undefined, 'novel_list', {})).resolves.toMatchObject({ isError: true })
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
      assets: [{ projectId: 'project-tool', assetId: 'chapter-tool', text: '白港下雨了。' }],
    })
    await expect(execute(ctx, undefined, 'novel_get', { references: [uri] }))
      .resolves.toMatchObject({ isError: true })
    await expect(execute(ctx, agent, 'novel_get', { references: [] }))
      .resolves.toMatchObject({ isError: true })
  })

  it('creates a durable proposal and presentation card without changing the authored file', async () => {
    const { ctx, agent, path, revisionId, quoteHash } = await harness()
    const before = await readFile(path, 'utf8')
    const result = await execute(ctx, agent, 'novel_propose_changes', {
      project_id: 'project-tool',
      asset_id: 'chapter-tool',
      base_revision_id: revisionId,
      start_utf16: 2,
      end_utf16: 4,
      quote_hash: quoteHash,
      replacement: '放晴',
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
    expect(await readFile(path, 'utf8')).toBe(before)
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    await expect(ctx.novelRepository.readChangeSet(project, ChangeSetId(value.changeSetId)))
      .resolves.toMatchObject({ status: 'proposed', actor: { kind: 'agent', sessionId: agent.id } })

    await expect(execute(ctx, undefined, 'novel_propose_changes', {
      project_id: 'project-tool', asset_id: 'chapter-tool', base_revision_id: revisionId,
      start_utf16: 2, end_utf16: 4, quote_hash: quoteHash, replacement: '放晴', summary: '摘要',
    })).resolves.toMatchObject({ isError: true })
  })
})
