import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const serialized = JSON.stringify(manifest)

function requireCondition(condition, message) {
  if (!condition) throw new Error(`WriteBookWhale distribution: ${message}`)
}

requireCondition(manifest.name === '@xieshujing/dsh-plugin', 'unexpected package name')
requireCondition(manifest.private !== true, 'package must be public')
requireCondition(manifest.dsh?.bundle?.patch === './cordis.patch.yml', 'missing DSH bundle manifest')
requireCondition(manifest.scripts === undefined, 'distribution must not execute install-time scripts')
requireCondition(!serialized.includes('workspace:'), 'workspace dependency escaped into the distribution')
requireCondition(existsSync(resolve(root, 'cordis.patch.yml')), 'missing bundle patch')
requireCondition(existsSync(resolve(root, 'lib/index.js')), 'missing prebuilt facade')
requireCondition(existsSync(resolve(root, 'presets/novel-workbench/agent.cordis.yml')), 'missing Novel Preset')

for (const packageName of manifest.bundledDependencies ?? []) {
  const packageRoot = resolve(root, 'node_modules', ...packageName.split('/'))
  requireCondition(existsSync(resolve(packageRoot, 'package.json')), `missing bundled package ${packageName}`)
  requireCondition(existsSync(resolve(packageRoot, 'lib/index.js')), `missing runtime for ${packageName}`)
}

process.stdout.write(`verified ${manifest.name}@${manifest.version}\n`)
