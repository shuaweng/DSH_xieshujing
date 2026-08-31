import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  exportPluginRepository,
  inspectStagedPackage,
  INTERNAL_PACKAGE_DIRS,
  stagePluginPackage,
} from './package-xieshujing-plugin.ts'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function stage() {
  const directory = mkdtempSync(join(tmpdir(), 'xieshujing-plugin-test-'))
  temporaryDirectories.push(directory)
  return stagePluginPackage(repositoryRoot, directory)
}

describe('WriteBookWhale one-package artifact', () => {
  it('stages one branded facade with a publishable dependency graph', () => {
    const staged = stage()
    const serialized = JSON.stringify(staged.manifest)

    expect(staged.manifest.name).toBe('@xieshujing/dsh-plugin')
    expect(staged.manifest.private).toBeUndefined()
    expect(staged.manifest.bundledDependencies).toHaveLength(INTERNAL_PACKAGE_DIRS.length)
    expect(staged.manifest.dependencies).not.toHaveProperty('@deepseek-ai/cordis')
    expect(staged.manifest.peerDependencies).toHaveProperty('@deepseek-ai/cordis')
    expect(serialized).not.toContain('workspace:')

    for (const packageName of staged.internalPackageNames) {
      const manifestPath = join(staged.directory, 'node_modules', ...packageName.split('/'), 'package.json')
      const internalSerialized = readFileSync(manifestPath, 'utf8')
      expect(internalSerialized).not.toContain('workspace:')
      expect(JSON.parse(internalSerialized)).not.toHaveProperty('private')
    }
  })

  it('carries the complete private runtime and rewrites the Bundle owner', () => {
    const staged = stage()
    const patch = readFileSync(join(staged.directory, 'cordis.patch.yml'), 'utf8')
    const dedicatedPatch = readFileSync(join(staged.directory, 'dedicated-profile.patch.yml'), 'utf8')
    const files = inspectStagedPackage(staged.directory).map(file => file.path)

    expect(patch).toContain("name: '@xieshujing/dsh-plugin'")
    expect(patch).not.toContain("name: '@deepseek-ai/dsh-experimental-novel-studio'")
    expect(dedicatedPatch).toContain(".resolve('@xieshujing/dsh-plugin/package.json')")
    expect(dedicatedPatch).not.toContain('@deepseek-ai/dsh-experimental-novel-studio')
    expect(files).toEqual(expect.arrayContaining([
      'cordis.patch.yml',
      'presets/novel-workbench/agent.cordis.yml',
      'node_modules/@deepseek-ai/dsh-experimental-novel-workbench/lib/client.js',
      'node_modules/@deepseek-ai/dsh-experimental-novel-repository-remote/lib/typert.host.js',
    ]))
  })

  it('exports a prebuilt public repository without install-time code execution', () => {
    const directory = mkdtempSync(join(tmpdir(), 'xieshujing-repository-test-'))
    temporaryDirectories.push(directory)
    const exported = exportPluginRepository(repositoryRoot, directory)
    const readme = readFileSync(join(directory, 'README.md'), 'utf8')

    expect(exported.manifest.repository).toEqual({
      type: 'git',
      url: 'git+https://github.com/shuaweng/DSH_xieshujing.git',
    })
    expect(exported.manifest.engines).toEqual({ node: '^22.19.0 || >=24.0.0' })
    expect(exported.manifest).not.toHaveProperty('scripts')
    expect(readme).toContain('dsh plugin --profile web add')
    expect(readme).not.toContain('{{PLUGIN_VERSION}}')
    expect(existsSync(join(directory, 'LICENSE'))).toBe(true)
    expect(existsSync(join(directory, 'assets/xieshujing-logo.png'))).toBe(true)
    expect(existsSync(join(directory, '.github/workflows/verify.yml'))).toBe(true)
    expect(existsSync(join(directory, 'scripts/verify-distribution.mjs'))).toBe(true)
  })
})
