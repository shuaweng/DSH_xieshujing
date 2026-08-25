import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSessionSnapshot } from '@deepseek-ai/dsh-acp-snapshot'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

const configPath = fileURLToPath(new URL('../novel-skill.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('./fixtures/headless-driver.ts', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const presetRoot = fileURLToPath(new URL('./fixtures', import.meta.url))
const packageSkillRoot = fileURLToPath(new URL(
  '../../../packages/experimental/novel-studio/presets/novel-workbench/skills',
  import.meta.url,
))
const expectedPath = fileURLToPath(new URL('./novel-skill-snapshots/session.expected.jsonl', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('Novel Workbench Skill model snapshot', () => {
  it('mounts the package provider and progressively loads one exact method', async () => {
    let normalized = ''
    const result = await runLoaderSmoke({
      label: 'novel workbench Skill snapshot',
      tempDirPrefix: 'dsh-novel-skill-snapshot-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'Rewrite the selected prose without changing its plot.'],
      tsconfigPath,
      env: { DSH_NOVEL_SKILL_PRESET_ROOT: presetRoot },
      inspect: async (cwd) => {
        const files = (await readdir(join(cwd, '.sessions'), { recursive: true }))
          .filter(file => file.endsWith('.jsonl'))
        expect(files).toHaveLength(1)
        const source = await readFile(join(cwd, '.sessions', files[0]!), 'utf8')
        const header = JSON.parse(source.split('\n')[0]!) as { id: string }
        normalized = normalizeSessionSnapshot(source, {
          cwd,
          sessionIds: [SessionId(header.id)],
        }).replaceAll(packageSkillRoot, '{{novelSkillRoot}}')
        if (refreshing) await writeFile(expectedPath, normalized)
        expect(normalized).toBe(await readFile(expectedPath, 'utf8'))
      },
    })

    expect(result.stderr).toBe('')
    expect(normalized).toContain('rewrite-to-style')
    expect(normalized).toContain('这是窄权限表达改写')
    expect(normalized).toContain('book.style-profile')
    expect(normalized).toContain('NOVEL_WORKBENCH_SKILL_OK')
    const records = result.stdout.trimEnd().split('\n').map(line => JSON.parse(line) as Record<string, unknown>)
    expect(records.at(-1)).toMatchObject({ type: 'result', output: 'NOVEL_WORKBENCH_SKILL_OK' })
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
