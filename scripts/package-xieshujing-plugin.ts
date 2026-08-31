/** Build the one-install WriteBookWhale (写书鲸) DSH bundle artifact. */

import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const PRODUCT_NAME = '@xieshujing/dsh-plugin'
const SOURCE_FACADE = 'packages/experimental/novel-studio'
const SOURCE_PACKAGE_NAME = '@deepseek-ai/dsh-experimental-novel-studio'
const DISTRIBUTION_FILES = `${SOURCE_FACADE}/distribution`
const PUBLIC_REPOSITORY = 'https://github.com/shuaweng/DSH_xieshujing'
const COMPATIBLE_DSH_VERSION = '0.1.2-alpha.2'
const PUBLIC_ASSETS = [
  ['packages/experimental/novel-workbench/src/client/assets/brand/xieshujing-logo-horizontal-web.png', 'assets/xieshujing-logo.png'],
  ['packages/experimental/novel-workbench/src/client/assets/brand/xieshujing-app-icon-256.png', 'assets/xieshujing-app-icon.png'],
] as const

/** Private implementation packages carried inside the public-facing facade. */
export const INTERNAL_PACKAGE_DIRS = [
  'packages/experimental/novel-analysis',
  'packages/experimental/novel-asset-outline',
  'packages/experimental/novel-context',
  'packages/experimental/novel-repository',
  'packages/experimental/novel-repository-client',
  'packages/experimental/novel-repository-local',
  'packages/experimental/novel-repository-remote',
  'packages/experimental/novel-workbench',
  'packages/experimental/tool-novel',
] as const

const HOST_PACKAGE_NAMES = [
  '@deepseek-ai/dsh-persona',
  '@deepseek-ai/dsh-skill-filesystem',
  '@deepseek-ai/dsh-tool-skill',
] as const

interface PackageManifest {
  name: string
  version: string
  description?: string
  private?: boolean
  type?: string
  main?: string
  types?: string
  exports?: Record<string, unknown>
  files?: string[]
  license?: string
  repository?: unknown
  homepage?: string
  bugs?: { url: string }
  keywords?: string[]
  engines?: Record<string, string>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  dsh?: { bundle?: { patch?: string } }
  bundledDependencies?: string[]
}

/** A staged facade ready for `npm pack`. */
export interface StagedPluginPackage {
  readonly directory: string
  readonly manifest: PackageManifest
  readonly internalPackageNames: readonly string[]
}

/** Result of writing the installable tarball. */
export interface PackedPluginPackage extends StagedPluginPackage {
  readonly tarball: string
}

/** One file reported by npm's pack inspection. */
export interface NpmPackFile {
  readonly path: string
  readonly size: number
}

function readManifest(path: string): PackageManifest {
  return JSON.parse(readFileSync(path, 'utf8')) as PackageManifest
}

function writeManifest(path: string, manifest: PackageManifest): void {
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function packageDirectories(root: string): string[] {
  return ['vendor', 'packages', 'apps'].flatMap((group) => {
    const groupRoot = join(root, group)
    if (!existsSync(groupRoot)) return []
    const direct = readdirSync(groupRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => join(groupRoot, entry.name))
    return direct.flatMap((directory) => {
      if (existsSync(join(directory, 'package.json'))) return [directory]
      return readdirSync(directory, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => join(directory, entry.name))
        .filter(candidate => existsSync(join(candidate, 'package.json')))
    })
  })
}

function workspaceVersions(root: string): ReadonlyMap<string, string> {
  const versions = new Map<string, string>()
  for (const directory of packageDirectories(root)) {
    const manifest = readManifest(join(directory, 'package.json'))
    if (manifest.name && manifest.version) versions.set(manifest.name, manifest.version)
  }
  return versions
}

function publishedRange(name: string, range: string, versions: ReadonlyMap<string, string>): string {
  if (!range.startsWith('workspace:')) return range
  const version = versions.get(name)
  if (version === undefined) throw new Error(`package-xieshujing-plugin: workspace package ${name} is unknown`)
  const selector = range.slice('workspace:'.length)
  if (selector === '*') return version
  if (selector === '^') return `^${version}`
  if (selector === '~') return `~${version}`
  throw new Error(`package-xieshujing-plugin: unsupported workspace range ${range} for ${name}`)
}

function rewriteRanges(
  values: Record<string, string> | undefined,
  versions: ReadonlyMap<string, string>,
): Record<string, string> | undefined {
  if (values === undefined) return undefined
  return Object.fromEntries(Object.entries(values).map(([name, range]) => [
    name,
    publishedRange(name, range, versions),
  ]))
}

function walkFiles(directory: string, root = directory): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === '.git') return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? walkFiles(path, root) : [relative(root, path).split(sep).join('/')]
  })
}

function globExpression(pattern: string): RegExp {
  // Replace glob tokens while scanning the source pattern. Replacing them in
  // several string passes is unsafe because later `*` replacements also
  // rewrite the regex fragments inserted by an earlier pass. That bug made
  // `presets/**/*` match only shallow preset files and silently omitted the
  // packaged preset's nested `plugins/` and `skills/` directories.
  let expression = ''
  for (let index = 0; index < pattern.length;) {
    if (pattern.startsWith('**/*', index)) {
      expression += '(?:.*/)?[^/]*'
      index += 4
      continue
    }
    if (pattern.startsWith('**', index)) {
      expression += '.*'
      index += 2
      continue
    }
    if (pattern[index] === '*') {
      expression += '[^/]*'
      index += 1
      continue
    }
    const character = pattern.charAt(index)
    expression += /[.+^${}()|[\]\\]/.test(character) ? `\\${character}` : character
    index += 1
  }
  return new RegExp(`^${expression}$`)
}

function copyPath(sourceRoot: string, destinationRoot: string, path: string): void {
  const source = join(sourceRoot, ...path.split('/'))
  const destination = join(destinationRoot, ...path.split('/'))
  mkdirSync(dirname(destination), { recursive: true })
  copyFileSync(source, destination)
}

function copyDeclaredPayload(sourceRoot: string, destinationRoot: string, patterns: readonly string[]): void {
  const files = walkFiles(sourceRoot)
  for (const pattern of patterns) {
    const matcher = globExpression(pattern)
    const matches = files.filter(file => matcher.test(file))
    if (matches.length === 0) {
      throw new Error(
        `package-xieshujing-plugin: ${relative(process.cwd(), sourceRoot)}/${pattern} has no built payload; run the Host and Client library builds before packing`,
      )
    }
    for (const file of matches) copyPath(sourceRoot, destinationRoot, file)
  }
}

function copyDocumentation(sourceRoot: string, destinationRoot: string): void {
  for (const name of ['README.md', 'README.zh.md', 'README.i18n.yaml', 'LICENSE', 'LICENSE.md']) {
    if (existsSync(join(sourceRoot, name))) copyPath(sourceRoot, destinationRoot, name)
  }
}

function copyDistributionFiles(root: string, destinationRoot: string, version: string): void {
  const sourceRoot = resolve(root, DISTRIBUTION_FILES)
  for (const file of walkFiles(sourceRoot)) {
    const source = join(sourceRoot, ...file.split('/'))
    const rendered = readFileSync(source, 'utf8')
      .replaceAll('{{PLUGIN_VERSION}}', version)
      .replaceAll('{{DSH_VERSION}}', COMPATIBLE_DSH_VERSION)
    if (file === 'README.md') {
      const destination = join(destinationRoot, 'README.en.md')
      mkdirSync(dirname(destination), { recursive: true })
      writeFileSync(destination, rendered.replace('[中文](README.zh.md)', '[中文](README.md)'))
      continue
    }
    if (file === 'README.zh.md') {
      const publicChinese = rendered.replace('[English](README.md) | 中文', '[English](README.en.md)')
      for (const destinationName of ['README.md', 'README.zh.md']) {
        const destination = join(destinationRoot, destinationName)
        mkdirSync(dirname(destination), { recursive: true })
        writeFileSync(destination, publicChinese)
      }
      continue
    }
    if (file === 'README.i18n.yaml') continue
    const destination = join(destinationRoot, ...file.split('/'))
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, rendered)
  }
  for (const [source, destination] of PUBLIC_ASSETS) {
    const publicPath = join(destinationRoot, ...destination.split('/'))
    mkdirSync(dirname(publicPath), { recursive: true })
    copyFileSync(resolve(root, source), publicPath)
  }
}

function stagedInternalManifest(
  manifest: PackageManifest,
  versions: ReadonlyMap<string, string>,
): PackageManifest {
  const staged = { ...manifest }
  const dependencies = rewriteRanges(manifest.dependencies, versions)
  const peers = rewriteRanges(manifest.peerDependencies, versions)
  const optional = rewriteRanges(manifest.optionalDependencies, versions)
  if (dependencies === undefined) delete staged.dependencies
  else staged.dependencies = dependencies
  if (peers === undefined) delete staged.peerDependencies
  else staged.peerDependencies = peers
  if (optional === undefined) delete staged.optionalDependencies
  else staged.optionalDependencies = optional
  delete staged.private
  delete staged.devDependencies
  return staged
}

function mergeDependencySection(
  destination: Map<string, string>,
  values: Record<string, string> | undefined,
  versions: ReadonlyMap<string, string>,
  excluded: ReadonlySet<string>,
): void {
  for (const [name, range] of Object.entries(values ?? {})) {
    if (excluded.has(name)) continue
    const resolved = publishedRange(name, range, versions)
    const previous = destination.get(name)
    if (previous !== undefined && previous !== resolved) {
      throw new Error(`package-xieshujing-plugin: incompatible ranges for ${name}: ${previous} and ${resolved}`)
    }
    destination.set(name, resolved)
  }
}

function sortedRecord(values: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries([...values].sort(([left], [right]) => left.localeCompare(right)))
}

/**
 * Stage one branded facade plus its private Novel implementation packages.
 * @param root repository root containing the DSH workspace.
 * @param directory empty destination for the staged npm package.
 * @returns staged manifest and carried internal package names.
 */
export function stagePluginPackage(root: string, directory: string): StagedPluginPackage {
  const sourceRoot = resolve(root, SOURCE_FACADE)
  const sourceManifest = readManifest(join(sourceRoot, 'package.json'))
  const versions = workspaceVersions(root)
  const internal = INTERNAL_PACKAGE_DIRS.map(relativeDir => ({
    root: resolve(root, relativeDir),
    manifest: readManifest(resolve(root, relativeDir, 'package.json')),
  }))
  const internalNames = internal.map(entry => entry.manifest.name)
  const internalSet = new Set(internalNames)
  const dependencies = new Map<string, string>()
  const peers = new Map<string, string>()

  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })

  copyDeclaredPayload(sourceRoot, directory, sourceManifest.files ?? [])
  copyDocumentation(sourceRoot, directory)

  for (const entry of internal) {
    const destination = join(directory, 'node_modules', ...entry.manifest.name.split('/'))
    mkdirSync(destination, { recursive: true })
    copyDeclaredPayload(entry.root, destination, entry.manifest.files ?? [])
    copyDocumentation(entry.root, destination)
    writeManifest(join(destination, 'package.json'), stagedInternalManifest(entry.manifest, versions))
    dependencies.set(entry.manifest.name, entry.manifest.version)
    mergeDependencySection(dependencies, entry.manifest.dependencies, versions, internalSet)
    mergeDependencySection(peers, entry.manifest.peerDependencies, versions, internalSet)
  }

  for (const name of HOST_PACKAGE_NAMES) {
    const range = sourceManifest.dependencies?.[name]
    if (range === undefined) throw new Error(`package-xieshujing-plugin: facade dependency ${name} is missing`)
    peers.set(name, publishedRange(name, range, versions))
  }
  mergeDependencySection(peers, sourceManifest.peerDependencies, versions, internalSet)

  const manifest: PackageManifest = {
    name: PRODUCT_NAME,
    version: sourceManifest.version,
    description: '写书鲸：面向 DeepSeek Harness 的原生小说创作工作台',
    files: [
      ...(sourceManifest.files ?? []),
      'README.zh.md',
      'README.en.md',
      'COMPATIBILITY.md',
      'SECURITY.md',
      'NOTICE.md',
      'assets/**/*',
    ],
    dependencies: sortedRecord(dependencies),
    peerDependencies: sortedRecord(peers),
    bundledDependencies: [...internalNames].sort(),
    repository: {
      type: 'git',
      url: `git+${PUBLIC_REPOSITORY}.git`,
    },
    homepage: `${PUBLIC_REPOSITORY}#readme`,
    bugs: { url: `${PUBLIC_REPOSITORY}/issues` },
    keywords: [
      'ai-writing',
      'deepseek-harness',
      'dsh-plugin',
      'novel-writing',
      'writing-assistant',
    ],
    engines: { node: '^22.19.0 || >=24.0.0' },
  }
  if (sourceManifest.type !== undefined) manifest.type = sourceManifest.type
  if (sourceManifest.main !== undefined) manifest.main = sourceManifest.main
  if (sourceManifest.types !== undefined) manifest.types = sourceManifest.types
  if (sourceManifest.exports !== undefined) manifest.exports = sourceManifest.exports
  if (sourceManifest.license !== undefined) manifest.license = sourceManifest.license
  if (sourceManifest.dsh !== undefined) manifest.dsh = sourceManifest.dsh
  writeManifest(join(directory, 'package.json'), manifest)

  const patchNames = [
    sourceManifest.dsh?.bundle?.patch,
    'dedicated-profile.patch.yml',
  ].filter((name): name is string => name !== undefined)
  for (const patchName of patchNames) {
    const patchPath = join(directory, patchName)
    const patch = readFileSync(patchPath, 'utf8')
    if (!patch.includes(SOURCE_PACKAGE_NAME)) {
      throw new Error(`package-xieshujing-plugin: ${patchName} does not reference ${SOURCE_PACKAGE_NAME}`)
    }
    writeFileSync(patchPath, patch.replaceAll(SOURCE_PACKAGE_NAME, PRODUCT_NAME))
  }

  copyDistributionFiles(root, directory, sourceManifest.version)

  return { directory, manifest, internalPackageNames: internalNames }
}

/**
 * Export the exact prebuilt package tree used as the standalone Git repository.
 * @param root repository root containing the DSH workspace.
 * @param output empty destination receiving the distributable repository tree.
 * @returns staged manifest and carried internal package names.
 */
export function exportPluginRepository(root: string, output: string): StagedPluginPackage {
  return stagePluginPackage(root, output)
}

function npmPack(
  directory: string,
  output: string,
  dryRun: boolean,
): { filename: string; files: readonly NpmPackFile[] } {
  mkdirSync(output, { recursive: true })
  const args = ['pack', '--json', '--ignore-scripts', '--pack-destination', output]
  if (dryRun) args.splice(1, 0, '--dry-run')
  const cache = mkdtempSync(join(tmpdir(), 'xieshujing-npm-cache-'))
  try {
    const result = spawnSync('npm', args, {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, npm_config_cache: cache },
    })
    if (result.status !== 0) {
      throw new Error(`package-xieshujing-plugin: npm pack failed\n${result.stdout}\n${result.stderr}`)
    }
    const report = JSON.parse(result.stdout) as Array<{
      filename?: string
      files?: NpmPackFile[]
    }>
    const filename = report[0]?.filename
    if (filename === undefined) throw new Error('package-xieshujing-plugin: npm pack returned no filename')
    return { filename: resolve(output, filename), files: report[0]?.files ?? [] }
  } finally {
    rmSync(cache, { recursive: true, force: true })
  }
}

/** Inspect the exact npm payload without writing or publishing a tarball. */
export function inspectStagedPackage(directory: string): readonly NpmPackFile[] {
  const output = mkdtempSync(join(tmpdir(), 'xieshujing-plugin-dry-run-'))
  try {
    return npmPack(directory, output, true).files
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}

/**
 * Create a local installable tarball without publishing or contacting GitHub.
 * @param root repository root containing the DSH workspace.
 * @param output directory receiving the tarball.
 * @returns staged-package metadata plus the tarball path.
 */
export function packPluginPackage(root: string, output: string): PackedPluginPackage {
  const staging = mkdtempSync(join(tmpdir(), 'xieshujing-plugin-stage-'))
  try {
    const staged = stagePluginPackage(root, staging)
    const tarball = npmPack(staging, output, false).filename
    return { ...staged, directory: output, tarball }
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

function main(): void {
  const root = resolve(import.meta.dirname, '..')
  if (process.argv[2] === '--repository') {
    const output = resolve(root, process.argv[3] ?? '.artifacts/xieshujing-repository')
    exportPluginRepository(root, output)
    process.stdout.write(`${output}\n`)
    return
  }
  const output = resolve(root, process.argv[2] ?? '.artifacts/xieshujing-plugin')
  const packed = packPluginPackage(root, output)
  const bytes = statSync(packed.tarball).size
  process.stdout.write(`${packed.tarball}\n${bytes} bytes\n`)
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main()
