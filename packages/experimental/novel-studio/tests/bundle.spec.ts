import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import * as yaml from 'js-yaml'
import { entryListSchema } from '@deepseek-ai/cordis-plugin-include'
import {
  composeEntries,
  initProfile,
  loadProfile,
  PROFILE_TEMPLATES,
} from '@deepseek-ai/dsh-app-boot'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const installAnchor = resolve(packageRoot, 'package.json')
const temporaryHomes: string[] = []

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
  it('declares one parseable Profile patch and carries its complete provider closure', () => {
    const manifest = JSON.parse(readFileSync(resolve(packageRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh?: { bundle?: { patch?: string } }
    }
    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    const parsed = yaml.load(
      readFileSync(resolve(packageRoot, manifest.dsh!.bundle!.patch!), 'utf8'),
      { schema: entryListSchema },
    ) as { insert?: { id?: string; name?: string }[] }[]
    expect(parsed).toEqual([{
      insert: [
        {
          id: 'novel-repository-local',
          name: '@deepseek-ai/dsh-experimental-novel-repository-local',
        },
        {
          id: 'novel-repository-remote',
          name: '@deepseek-ai/dsh-experimental-novel-repository-remote',
        },
        {
          id: 'novel-repository-client',
          name: '@deepseek-ai/dsh-experimental-novel-repository-client',
        },
      ],
    }])
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository-client')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository-local')
    expect(manifest.dependencies).toHaveProperty('@deepseek-ai/dsh-experimental-novel-repository-remote')
  })

  it('adds Novel services only to the explicit base + web-app + Novel composition', () => {
    const webBundles = PROFILE_TEMPLATES['web']!
    const headlessBundles = PROFILE_TEMPLATES['headless']!
    const novelBundles = [...webBundles, '@deepseek-ai/dsh-experimental-novel-studio']

    const web = profileRows('web-test', webBundles)
    const headless = profileRows('headless-test', headlessBundles)
    const novel = profileRows('novel-studio-test', novelBundles)

    expect(web.some(row => row.id === 'novel-repository-local')).toBe(false)
    expect(web.some(row => row.id === 'novel-repository-remote')).toBe(false)
    expect(web.some(row => row.id === 'novel-repository-client')).toBe(false)
    expect(headless.some(row => row.id === 'novel-repository-local')).toBe(false)
    expect(headless.some(row => row.id === 'novel-repository-remote')).toBe(false)
    expect(headless.some(row => row.id === 'novel-repository-client')).toBe(false)
    expect(novel.filter(row => row.id === 'novel-repository-local')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-repository-remote')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'novel-repository-client')).toHaveLength(1)
    expect(novel.filter(row => row.id === 'ui-layout')).toHaveLength(1)
    expect(novel.find(row => row.id === 'ui-layout'))
      .toEqual(web.find(row => row.id === 'ui-layout'))
    expect(PROFILE_TEMPLATES).not.toHaveProperty('novel-studio')
  })
})
