import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { normalizeSessionSnapshot } from '@deepseek-ai/dsh-acp-snapshot'
import { LOADER_SMOKE_TEST_TIMEOUT_MS, runLoaderSmoke } from '@deepseek-ai/dsh-loader-smoke'
import { SessionId } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'

const configPath = fileURLToPath(new URL('../novel-project-init.cordis.snapshot.yml', import.meta.url))
const binScript = fileURLToPath(new URL('./fixtures/headless-driver.ts', import.meta.url))
const tsconfigPath = fileURLToPath(new URL('../../../tsconfig.json', import.meta.url))
const expectedPath = fileURLToPath(new URL('./novel-project-init-snapshots/session.expected.jsonl', import.meta.url))
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

describe('Novel Project initialization model snapshot', () => {
  it('exposes the eight-tool roster and proposes prose for a blank chapter after initialization', async () => {
    let normalized = ''
    const result = await runLoaderSmoke({
      label: 'novel project initialization snapshot',
      tempDirPrefix: 'dsh-novel-project-init-snapshot-',
      binScript,
      libBinScript: binScript,
      configPath,
      binArgs: [configPath, 'Initialize this existing Novel Project.'],
      tsconfigPath,
      prepare: async (cwd) => {
        await mkdir(join(cwd, 'manuscript'))
        await mkdir(join(cwd, 'planning'))
        await writeFile(join(cwd, 'novel.yaml'), [
          'kind: novel-project', 'schema: 1', 'id: project-white-harbor', 'title: White Harbor',
          'contentRoots:', '  manuscript: manuscript', '  planning: planning', '',
        ].join('\n'))
      },
      inspect: async (cwd) => {
        const manuscriptFiles = (await readdir(join(cwd, 'manuscript'))).filter(file => file.endsWith('.md'))
        expect(manuscriptFiles).toHaveLength(1)
        const manuscript = await readFile(join(cwd, 'manuscript', manuscriptFiles[0]!), 'utf8')
        expect(manuscript).toContain('type: manuscript.chapter')
        expect(manuscript).not.toContain('The harbor bell rang once.')
        const files = (await readdir(join(cwd, '.sessions'), { recursive: true })).filter(file => file.endsWith('.jsonl'))
        expect(files).toHaveLength(1)
        const source = await readFile(join(cwd, '.sessions', files[0]!), 'utf8')
        const header = JSON.parse(source.split('\n')[0]!) as { id: string }
        normalized = normalizeSessionSnapshot(source, { cwd, sessionIds: [SessionId(header.id)] })
          .replace(/dsh-novel:[A-Za-z0-9_-]+/gu, 'dsh-novel:{{reference}}')
        if (refreshing) await writeFile(expectedPath, normalized)
        expect(normalized).toBe(await readFile(expectedPath, 'utf8'))
      },
    })
    expect(result.stderr.replace(/^\(node:\d+\) ExperimentalWarning: SQLite is an experimental feature and might change at any time\n\(Use `node --trace-warnings \.\.\.` to show where the warning was created\)\n$/u, '')).toBe('')
    expect(normalized).toContain('novel_initialize_project')
    expect(normalized).toContain('novel_create')
    expect(normalized).toContain('novel_search')
    expect(normalized).toContain('novel_get_analysis')
    expect(normalized).toContain('novel_propose_changes')
    expect(normalized).toContain('insert-text')
    expect(normalized).toContain('update-title')
    expect(normalized).toContain('already-initialized')
    expect(normalized).toContain('NOVEL_PROJECT_INITIALIZE_CREATE_AND_INSERT_PROPOSE_OK')
  }, LOADER_SMOKE_TEST_TIMEOUT_MS)
})
