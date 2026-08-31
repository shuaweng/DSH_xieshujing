/** Real Loader, Agent registry, and repository composition. */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { AssetId, type TextRangeSelector } from '@deepseek-ai/dsh-experimental-novel-repository'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import SandboxedFileSystem from '@deepseek-ai/dsh-fs-sandbox'
import SandboxPolicyService from '@deepseek-ai/dsh-sandbox-policy'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelRepositoryRemote from '../../novel-repository-remote/src/index.ts'
import NovelContextResolver from '../../novel-context/src/index.ts'
import NovelAssetTypeRegistry from '../../novel-repository/src/asset-types.ts'
import * as NovelAssetOutline from '../../novel-asset-outline/src/index.ts'
import * as ToolNovel from '../../tool-novel/src/index.ts'

const remotePackageName = '@deepseek-ai/dsh-experimental-novel-repository-remote'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

describe('Novel Studio real composition', () => {
  it('loads the provider and Host Consumer, then discovers through a registered Agent', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-novel-loader-'))
    const projectRoot = join(root, 'project')
    const fallbackRoot = join(root, 'deployment-fallback')
    await mkdir(join(projectRoot, 'manuscript'), { recursive: true })
    await mkdir(join(projectRoot, 'planning'), { recursive: true })
    await mkdir(fallbackRoot)
    await writeFile(join(projectRoot, 'novel.yaml'), [
      'kind: novel-project',
      'schema: 1',
      'id: project-loader',
      'title: Loader Project',
      'contentRoots:',
      '  manuscript: manuscript',
      '  planning: planning',
      '',
    ].join('\n'))
    await writeFile(join(projectRoot, 'manuscript', 'chapter.md'), [
      '---',
      'novel:',
      '  schema: 1',
      '  id: chapter-loader',
      '  type: manuscript.chapter',
      '  title: Loader Chapter',
      '---',
      '白港下雨。',
    ].join('\n'))
    await writeFile(join(projectRoot, 'planning', 'main-outline.md'), [
      '---',
      'novel:',
      '  schema: 1',
      '  id: outline-loader',
      '  type: planning.outline',
      '  title: Main Outline',
      '  level: book',
      '---',
      '',
      '# Opening',
      '',
      'The harbor goes dark.',
      '',
    ].join('\n'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: session-projections',
      "  name: '@deepseek-ai/dsh-session-projection'",
      '- id: sandbox-policy',
      "  name: '@deepseek-ai/dsh-sandbox-policy'",
      '  config:',
      '    mode: workspace-write',
      `    workspaceRoot: ${JSON.stringify(fallbackRoot)}`,
      '- id: fs',
      "  name: '@deepseek-ai/dsh-fs-sandbox'",
      '  config:',
      `    cwd: ${JSON.stringify(fallbackRoot)}`,
      '- id: asset-types',
      "  name: '@deepseek-ai/dsh-experimental-novel-repository/asset-types'",
      '- id: asset-outline',
      "  name: '@deepseek-ai/dsh-experimental-novel-asset-outline'",
      '- id: repository',
      "  name: '@deepseek-ai/dsh-experimental-novel-repository-local'",
      '- id: novel-context',
      "  name: '@deepseek-ai/dsh-experimental-novel-context'",
      '- id: system-prompt',
      "  name: '@deepseek-ai/dsh-system-prompt'",
      '- id: tools',
      "  name: '@deepseek-ai/dsh-tools'",
      '- id: user-questions',
      "  name: '@deepseek-ai/dsh-user-questions'",
      '- id: tool-novel',
      "  name: '@deepseek-ai/dsh-experimental-tool-novel'",
      '- id: repository-remote',
      `  name: '${remotePackageName}'`,
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.provide('novelAnalysis', {} as never)
    ctx.baseUrl = pathToFileURL(configPath).href
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-session-projection', SessionProjectionRegistry],
      ['@deepseek-ai/dsh-sandbox-policy', SandboxPolicyService],
      ['@deepseek-ai/dsh-fs-sandbox', SandboxedFileSystem],
      ['@deepseek-ai/dsh-experimental-novel-repository/asset-types', NovelAssetTypeRegistry],
      ['@deepseek-ai/dsh-experimental-novel-asset-outline', NovelAssetOutline],
      ['@deepseek-ai/dsh-experimental-novel-repository-local', LocalNovelRepository],
      ['@deepseek-ai/dsh-experimental-novel-context', NovelContextResolver],
      ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
      ['@deepseek-ai/dsh-tools', ToolRuntime],
      ['@deepseek-ai/dsh-user-questions', UserQuestionService],
      ['@deepseek-ai/dsh-experimental-tool-novel', ToolNovel],
      [remotePackageName, NovelRepositoryRemote],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>

    await ctx.plugin(AgentRegistry)
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await ctx.loader.await()

    expect(ctx.tools.schemas().map(schema => schema.name)).toContain('novel_choose_scene_action')
    expect(ctx.get('userQuestions')).toBeDefined()

    const agentId = 'agent-loader' as Agent['id']
    const agent = {
      id: agentId,
      session: { id: agentId, header: { cwd: projectRoot }, events: [] },
      ctx,
    } as unknown as Agent
    const disposeAgent = ctx.agents.register(agent)
    const abort = new AbortController()
    const canonicalRoot = await realpath(projectRoot)

    await expect(ctx.novelRepositoryRemote.discover(agent, abort.signal)).resolves.toEqual({
      schema: 1,
      id: 'project-loader',
      title: 'Loader Project',
      rootDisplayPath: projectRoot,
      manifestDisplayPath: join(canonicalRoot, 'novel.yaml'),
      contentRootDisplayPaths: {
        manuscript: join(canonicalRoot, 'manuscript'),
        planning: join(canonicalRoot, 'planning'),
      },
    })
    const assets = await ctx.novelRepositoryRemote.assets(agent, abort.signal)
    const asset = assets.find(candidate => candidate.id === 'chapter-loader')
    expect(assets.map(candidate => candidate.type)).toEqual(['manuscript.chapter', 'planning.outline'])
    if (asset === undefined) throw new Error('loader composition lost its manuscript fixture')
    const chapter = await ctx.novelRepositoryRemote.asset(agent, AssetId('chapter-loader'), null, abort.signal)
    const saved = await ctx.novelRepositoryRemote.saveAsset(agent, {
      assetId: AssetId('chapter-loader'),
      baseRevisionId: chapter.revisionId,
      content: { kind: 'manuscript', body: '白港的灯光越来越暗了。' },
    }, abort.signal)
    expect(saved.content).toEqual({ kind: 'manuscript', body: '白港的灯光越来越暗了。' })
    await expect(readFile(join(projectRoot, 'manuscript', 'chapter.md'), 'utf8'))
      .resolves.toContain('白港的灯光越来越暗了。')
    const selection = await ctx.novelRepositoryRemote.captureSelection(agent, {
      assetId: AssetId('chapter-loader'),
      revisionId: saved.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 2 },
    }, abort.signal)
    expect(selection.mention).toContain('dsh-novel:')
    await expect(ctx.novelContextResolver.resolveReferences(agent, [{
      projectId: asset.projectId,
      assetId: asset.id,
      revisionId: saved.revisionId,
      selector: selection.selector as unknown as TextRangeSelector,
    }], abort.signal)).resolves.toMatchObject({ references: [{ text: '白港' }] })

    disposeAgent()
    expect(ctx.agents.get(agentId)).toBeUndefined()
  }, 60_000)
})
