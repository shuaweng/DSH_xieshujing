import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import { Context } from '@deepseek-ai/cordis'
import {
  composeEntries,
  initProfile,
  loadProfile,
  PROFILE_TEMPLATES,
} from '@deepseek-ai/dsh-app-boot'
import NovelStudioPaths from '../src/index.ts'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const workbenchPackageRoot = fileURLToPath(new URL('../../novel-workbench', import.meta.url))
const installAnchor = resolve(packageRoot, 'package.json')
const temporaryHomes: string[] = []
const workbenchSkillNames = [
  'chapter-execution',
  'chapter-review',
  'dialogue-diagnostics',
  'new-book-bootstrap',
  'outline-beat-design',
  'preference-learning',
  'rewrite-to-style',
  'scene-drive',
  'story-state-extraction',
  'style-audit',
] as const
const contextPolicies = {
  'chapter-execution': 'chapter-write',
  'chapter-review': 'chapter-review',
  'dialogue-diagnostics': 'selection-review',
  'new-book-bootstrap': 'outline-edit',
  'outline-beat-design': 'outline-edit',
  'preference-learning': 'preference-learning',
  'story-state-extraction': 'story-state-learning',
  'rewrite-to-style': 'selection-rewrite',
  'scene-drive': 'chapter-write',
  'style-audit': 'selection-review',
} as const

afterEach(() => {
  while (temporaryHomes.length > 0) rmSync(temporaryHomes.pop()!, { recursive: true, force: true })
})

function profileRows(name: string, bundles: readonly string[]): ReturnType<typeof composeEntries> {
  const home = mkdtempSync(join(tmpdir(), `dsh-${name}-profile-`))
  temporaryHomes.push(home)
  const profileDir = join(home, 'profiles', name)
  mkdirSync(dirname(profileDir), { recursive: true })
  initProfile(profileDir, bundles)
  if (bundles.includes('@deepseek-ai/dsh-experimental-novel-studio')) {
    const scopeDir = join(profileDir, 'node_modules', '@deepseek-ai')
    mkdirSync(scopeDir, { recursive: true })
    symlinkSync(
      packageRoot,
      join(scopeDir, 'dsh-experimental-novel-studio'),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
  }
  const profile = loadProfile('dsh', name, installAnchor, home)
  return composeEntries(profile.layers.map(layer => layer.patches))
}

describe('experimental Novel Studio bundle', () => {
  it('keeps the Novel persona aligned with freeform planning operations', () => {
    const parsed = yaml.load(
      readFileSync(resolve(packageRoot, 'presets/novel-workbench/agent.cordis.yml'), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{ id?: string; config?: { text?: string } }>
    const prompt = parsed.find(row => row.id === 'persona')?.config?.text ?? ''

    expect(prompt).toContain('正文、大纲和设定都是版本化小说资产')
    expect(prompt).toContain('正文可以用 insert-text 在精确 Revision')
    expect(prompt).toContain('先调用 skill 加载最匹配的精确方法')
    for (const name of workbenchSkillNames) expect(prompt).toContain(name)
    expect(prompt).not.toContain('稳定 node id')
  })

  it('ships a safe on-demand writing Skill catalog in the Workbench Preset', () => {
    const presetPath = resolve(packageRoot, 'presets/novel-workbench/agent.cordis.yml')
    const parsed = yaml.load(readFileSync(presetPath, 'utf8'), {
      schema: entryListSchema,
    }) as Array<{ id?: string; name?: string }>
    const rows = parsed.map(row => [row.id, row.name])

    expect(rows).toEqual([
      ['persona', '@deepseek-ai/dsh-persona'],
      ['novel-skills', './plugins/dsh-novel-workbench-skills/index.js'],
      ['tool-skill', '@deepseek-ai/dsh-tool-skill'],
      ['tool-novel', '@deepseek-ai/dsh-experimental-tool-novel'],
    ])
    expect(rows.map(([, name]) => name)).not.toEqual(expect.arrayContaining([
      '@deepseek-ai/dsh-tool-bash',
      '@deepseek-ai/dsh-tool-fs',
      '@deepseek-ai/dsh-tool-str-replace-editor',
    ]))

    const skillRoot = resolve(packageRoot, 'presets/novel-workbench/skills')
    expect(readdirSync(skillRoot).sort()).toEqual(workbenchSkillNames)
    for (const name of workbenchSkillNames) {
      const body = readFileSync(resolve(skillRoot, name, 'SKILL.md'), 'utf8')
      expect(body).toMatch(new RegExp(`^---\\nname: ${name}\\n`))
      expect(body).toContain(`user-invocable: ${name === 'story-state-extraction' ? 'false' : 'true'}`)
      expect(body).toContain(`novelContextPolicy: ${contextPolicies[name]}`)
      if (name !== 'story-state-extraction') expect(body).toContain('novel_get')
      expect(body).not.toMatch(/PROJECT\.md|STYLE\.md|\.lingtai|references\//)
      expect(body).not.toMatch(/`(?:read|write|edit|grep|glob|bash)`/)
    }
    for (const name of ['style-audit', 'dialogue-diagnostics', 'chapter-review']) {
      const body = readFileSync(resolve(skillRoot, name, 'SKILL.md'), 'utf8')
      expect(body).toContain('不创建 ChangeSet')
    }
    for (const name of ['new-book-bootstrap', 'outline-beat-design', 'chapter-execution', 'rewrite-to-style', 'scene-drive']) {
      const body = readFileSync(resolve(skillRoot, name, 'SKILL.md'), 'utf8')
      expect(body).toContain('novel_propose_changes')
      expect(body).toMatch(/未 applied|未明确返回 applied|没有 applied 结果/)
    }
  })

  it('waits for the shipped layout and contributes no cross-package runtime import', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(workbenchPackageRoot, 'package.json'), 'utf8'),
    ) as { dsh?: { client?: { inject?: string[]; external?: string[] } } }
    const inject = manifest.dsh?.client?.inject ?? []
    const external = manifest.dsh?.client?.external ?? []

    expect(inject).not.toContain('@deepseek-ai/dsh-client-ui-conversation')
    expect(inject).toContain('@deepseek-ai/dsh-client-ui-layout')
    expect(inject).toContain('@deepseek-ai/dsh-client-ui-slots')
    expect(external).toEqual([])
  })

  it('provides the package-owned preset root as a scoped runtime service', async () => {
    const ctx = new Context()
    ctx.provide('novelWorkbenchReady', {} as never)
    const fiber = ctx.plugin(NovelStudioPaths)
    await fiber.await()
    expect(ctx.novelStudioPaths.presetRoot).toBe(resolve(packageRoot, 'presets'))
    await fiber.dispose()
    expect(ctx.get('novelStudioPaths')).toBeUndefined()
  })

  it('declares one parseable Profile patch and carries its complete provider closure', () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(packageRoot, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as Array<{
      id?: string
      disabled?: boolean
      inject?: string[]
      config?: { default?: string; roots?: Array<{ trust?: string }> }
      insert?: { id?: string; name?: string }[]
    }>
    expect(parsed.find(row => row.id === 'ui-layout')).toBeUndefined()
    expect(parsed.find(row => row.id === 'web-runtime')).toMatchObject({
      inject: ['webStartup', 'novelStudioPaths'],
    })
    expect(parsed.find(row => row.id === 'modules')).toMatchObject({
      inject: ['novelStudioPaths'],
    })
    expect(parsed.find(row => row.id === 'agent-presets')).toMatchObject({
      inject: ['novelStudioPaths'],
      config: { default: 'novel-workbench', roots: [{ trust: 'system' }] },
    })
    expect(parsed.flatMap(row => row.insert ?? [])).toEqual([
      { id: 'novel-asset-types', name: '@deepseek-ai/dsh-experimental-novel-repository/asset-types' },
      { id: 'novel-asset-outline', name: '@deepseek-ai/dsh-experimental-novel-asset-outline' },
      { id: 'novel-repository-local', name: '@deepseek-ai/dsh-experimental-novel-repository-local' },
      { id: 'novel-context', name: '@deepseek-ai/dsh-experimental-novel-context' },
      { id: 'novel-analysis', name: '@deepseek-ai/dsh-experimental-novel-analysis' },
      { id: 'novel-repository-remote', name: '@deepseek-ai/dsh-experimental-novel-repository-remote' },
      { id: 'novel-repository-client', name: '@deepseek-ai/dsh-experimental-novel-repository-client' },
      { id: 'novel-workbench', name: '@deepseek-ai/dsh-experimental-novel-workbench' },
      { id: 'novel-studio-paths', name: '@deepseek-ai/dsh-experimental-novel-studio' },
    ])
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-context')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-analysis')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-asset-outline')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository-client')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository-local')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository-remote')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-workbench')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-tool-novel')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-skill-filesystem')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-tool-skill')
  })

  it('adds Novel services only to the explicit base + web-app + Novel composition', () => {
    const webBundles = PROFILE_TEMPLATES['web']!
    const headlessBundles = PROFILE_TEMPLATES['headless']!
    const novelBundles = [...webBundles, '@deepseek-ai/dsh-experimental-novel-studio']

    const web = profileRows('web-test', webBundles)
    const headless = profileRows('headless-test', headlessBundles)
    const novel = profileRows('novel-studio-test', novelBundles)

    expect(web.some(row => row.id === 'novel-repository-local')).toBe(false)
    expect(web.some(row => row.id === 'novel-analysis')).toBe(false)
    expect(web.some(row => row.id === 'novel-asset-outline')).toBe(false)
    expect(web.some(row => row.id === 'novel-repository-remote')).toBe(false)
    expect(web.some(row => row.id === 'novel-repository-client')).toBe(false)
    expect(web.some(row => row.id === 'novel-workbench')).toBe(false)
    expect(headless.some(row => row.id === 'novel-repository-local')).toBe(false)
    expect(headless.some(row => row.id === 'novel-analysis')).toBe(false)
    expect(headless.some(row => row.id === 'novel-asset-outline')).toBe(false)
    expect(headless.some(row => row.id === 'novel-repository-remote')).toBe(false)
    expect(headless.some(row => row.id === 'novel-repository-client')).toBe(false)
    expect(headless.some(row => row.id === 'novel-workbench')).toBe(false)
    expect(novel.filter(row => row.id === 'novel-repository-local')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-asset-outline')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-repository-remote')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-repository-client')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-context')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-analysis')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-workbench')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'ui-layout')).toHaveLength(1)
    expect(novel.find(row => row.id === 'web-runtime')?.inject).toEqual(['webStartup', 'novelStudioPaths'])
    expect(novel.find(row => row.id === 'modules')?.inject).toEqual(['novelStudioPaths'])
    expect(novel.find(row => row.id === 'ui-layout')?.config).toEqual(web.find(row => row.id === 'ui-layout')?.config)
    const presets = novel.find(row => row.id === 'agent-presets')
    expect(presets?.inject).toContain('novelStudioPaths')
    expect(presets?.config).toMatchObject({ default: 'novel-workbench' })
    expect(PROFILE_TEMPLATES).not.toHaveProperty('novel-studio')
  })
})
