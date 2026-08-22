import { execFile } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

/** Built-artifact smoke for the generated Host and Client Novel Remote handoff. */

const packageDir = fileURLToPath(new URL('..', import.meta.url))
const rootDir = resolve(packageDir, '../../..')
const artifact = (path: string): string => join(rootDir, path)
const artifactUrl = (path: string): string => pathToFileURL(artifact(path)).href
const clientDeclaration = 'packages/experimental/novel-repository-client/lib/types/client/index.d.ts'
const requiredArtifacts = [
  'packages/core/agent/lib/index.js',
  'packages/api/gateway/lib/client.js',
  'packages/api/gateway/lib/index.js',
  'packages/fs/fs-local/lib/index.js',
  'packages/typert/registry/lib/client.js',
  'packages/typert/registry/lib/index.js',
  'packages/experimental/novel-repository/lib/index.js',
  'packages/experimental/novel-repository-local/lib/index.js',
  'packages/experimental/novel-repository-remote/lib/index.js',
  'packages/experimental/novel-repository-remote/lib/typert.host.js',
  'packages/experimental/novel-repository-client/lib/client.js',
  clientDeclaration,
].every(path => existsSync(artifact(path)))

describe.skipIf(!requiredArtifacts)('Novel Repository built Remote chain', () => {
  it('discovers through the generated Client namespace and withdraws that namespace', async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), 'dsh-novel-built-'))
    try {
      await mkdir(join(projectRoot, 'manuscript'))
      await writeFile(join(projectRoot, 'novel.yaml'), [
        'kind: novel-project',
        'schema: 1',
        'id: project-built',
        'title: Built Project',
        'contentRoots:',
        '  manuscript: manuscript',
        '',
      ].join('\n'))

      const urls = Object.fromEntries(Object.entries({
        agent: 'packages/core/agent/lib/index.js',
        apiGatewayClient: 'packages/api/gateway/lib/client.js',
        apiGatewayHost: 'packages/api/gateway/lib/index.js',
        fsLocal: 'packages/fs/fs-local/lib/index.js',
        novelClient: 'packages/experimental/novel-repository-client/lib/client.js',
        novelLocal: 'packages/experimental/novel-repository-local/lib/index.js',
        novelRemote: 'packages/experimental/novel-repository-remote/lib/index.js',
        novelTypert: 'packages/experimental/novel-repository-remote/lib/typert.host.js',
        registryClient: 'packages/typert/registry/lib/client.js',
        registryHost: 'packages/typert/registry/lib/index.js',
      }).map(([key, path]) => [key, artifactUrl(path)]))
      const script = `
        import * as cordis from '@deepseek-ai/cordis'

        const urls = ${JSON.stringify(urls)}
        const projectRoot = ${JSON.stringify(projectRoot)}
        const { Context } = cordis
        const { default: AgentRegistry } = await import(urls.agent)
        const { default: TypertGatewayService } = await import(urls.apiGatewayHost)
        const { default: LocalFileSystem } = await import(urls.fsLocal)
        const { default: LocalNovelRepository } = await import(urls.novelLocal)
        const { default: NovelRepositoryRemote } = await import(urls.novelRemote)
        const { TYPERT } = await import(urls.novelTypert)
        const { default: TypertRegistry } = await import(urls.registryHost)

        const host = new Context()
        await host.plugin(LocalFileSystem, { cwd: projectRoot })
        await host.plugin(LocalNovelRepository)
        await host.plugin(TypertRegistry)
        await host.plugin(AgentRegistry)
        await host.plugin(TypertGatewayService)
        await host.plugin(NovelRepositoryRemote)
        host.typert.register(TYPERT)
        const agentId = 'agent-built'
        const agent = { id: agentId, session: { id: agentId, header: { cwd: projectRoot } }, ctx: host }
        host.agents.register(agent)

        const handoffs = new Map()
        globalThis.window = { __ModuleLoader__: { load(handoff) { handoffs.set(handoff.id, handoff) } } }
        await import(urls.registryClient)
        await import(urls.apiGatewayClient)
        await import(urls.novelClient)
        const instantiate = id => {
          const handoff = handoffs.get(id)
          if (handoff === undefined) throw new Error('missing Client bundle handoff ' + id)
          return handoff.factory(specifier => {
            if (specifier === '@deepseek-ai/cordis') return cordis
            throw new Error('unexpected Client external ' + specifier)
          })
        }

        const client = new Context()
        await client.plugin(instantiate('@deepseek-ai/dsh-typert-registry'))
        client.provide('connection', {
          rpc: {
            async call(path, endpoint, payload, signal) {
              if (path !== '/api') throw new Error('unexpected path ' + path)
              const [namespace, method] = endpoint.split('/')
              const value = await host.typertGateway.invoke({ namespace, method, args: payload.args, signal })
              return { ok: true, value }
            },
          },
        })
        await client.plugin(instantiate('@deepseek-ai/dsh-api-gateway'))
        const novelFiber = client.plugin(instantiate('@deepseek-ai/dsh-experimental-novel-repository-client'))
        await novelFiber
        const retained = client.remote.novelRepository.discover
        const response = await retained(agentId)
        await novelFiber.dispose()
        const withdrawn = client.remote.novelRepository === undefined
        const retainedAfterDispose = await retained(agentId)

        console.log(JSON.stringify({ response, withdrawn, retainedAfterDispose }))
        await client.fiber.dispose()
        await host.fiber.dispose()
      `

      const result = await runPlainNode(script)
      expect(result.exitCode, `stderr:\n${result.stderr}`).toBe(0)
      const output = JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as {
        response: { ok: boolean; value?: { id?: string; title?: string } }
        withdrawn: boolean
        retainedAfterDispose: { ok: boolean; error?: { message?: string } }
      }
      expect(output).toMatchObject({
        response: { ok: true, value: { id: 'project-built', title: 'Built Project' } },
        withdrawn: true,
        retainedAfterDispose: { ok: false },
      })
      expect(output.retainedAfterDispose.error?.message).toContain('is no longer mounted')
      expect(readFileSync(artifact(clientDeclaration), 'utf8')).toContain(
        "export type {} from '@deepseek-ai/dsh-experimental-novel-repository-remote/remote';",
      )
    } finally {
      await rm(projectRoot, { recursive: true, force: true })
    }
  }, 60_000)
})

/** Execute one ESM script without a TypeScript loader. */
function runPlainNode(script: string): Promise<{
  readonly exitCode: number | null
  readonly stdout: string
  readonly stderr: string
}> {
  return new Promise((resolveRun) => {
    execFile(process.execPath, ['--input-type=module', '-e', script], {
      cwd: packageDir,
      encoding: 'utf8',
      timeout: 55_000,
    }, (error, stdout, stderr) => {
      resolveRun({
        exitCode: error === null ? 0 : typeof error.code === 'number' ? error.code : null,
        stdout,
        stderr,
      })
    })
  })
}
