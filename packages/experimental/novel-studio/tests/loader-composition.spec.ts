/** Real Loader, Agent registry, and repository composition. */

import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelRepositoryRemote from '../../novel-repository-remote/src/index.ts'

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
    await mkdir(join(root, 'manuscript'))
    await writeFile(join(root, 'novel.yaml'), [
      'kind: novel-project',
      'schema: 1',
      'id: project-loader',
      'title: Loader Project',
      'contentRoots:',
      '  manuscript: manuscript',
      '',
    ].join('\n'))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: fs',
      "  name: '@deepseek-ai/dsh-fs-local'",
      '  config:',
      `    cwd: ${JSON.stringify(root)}`,
      '- id: repository',
      "  name: '@deepseek-ai/dsh-experimental-novel-repository-local'",
      '- id: repository-remote',
      `  name: '${remotePackageName}'`,
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(configPath).href
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
      ['@deepseek-ai/dsh-experimental-novel-repository-local', LocalNovelRepository],
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

    const agentId = 'agent-loader' as Agent['id']
    const agent = {
      id: agentId,
      session: { id: agentId, header: { cwd: root } },
      ctx,
    } as unknown as Agent
    const disposeAgent = ctx.agents.register(agent)
    const abort = new AbortController()
    const canonicalRoot = await realpath(root)

    await expect(ctx.novelRepositoryRemote.discover(agent, abort.signal)).resolves.toEqual({
      schema: 1,
      id: 'project-loader',
      title: 'Loader Project',
      rootDisplayPath: root,
      manifestDisplayPath: join(canonicalRoot, 'novel.yaml'),
      contentRootDisplayPaths: { manuscript: join(canonicalRoot, 'manuscript') },
    })

    disposeAgent()
    expect(ctx.agents.get(agentId)).toBeUndefined()
  }, 60_000)
})
