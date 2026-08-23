// Keyless browser MVP: the real Novel Studio overlay binds authored files to
// a Session, renders a durable proposal, applies it only on author approval,
// and flushes a later draft before placing its exact SelectionRef in Composer.

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import {
  CallId,
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import {
  SESSION_FORMAT_VERSION,
  Session,
  SessionId,
} from '@deepseek-ai/dsh-session'
import {
  assertFixtureInventory,
  captureStableAria,
  compareOrRefreshGolden,
  launchWebScaffold,
  seedSession,
  watchConsole,
  webSnapshotMode,
  type WebScaffold,
} from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./snapshots/novel-workbench', import.meta.url))
const PROPOSED_EXPECTED = join(SNAPSHOT_DIR, 'proposed.expected.md')
const APPLIED_EXPECTED = join(SNAPSHOT_DIR, 'applied-and-context.expected.md')
const NOVEL_OVERLAY = fileURLToPath(new URL('../../../packages/experimental/novel-studio/cordis.patch.yml', import.meta.url))
const NOVEL_PRESETS = fileURLToPath(new URL('../../../packages/experimental/novel-studio/presets', import.meta.url))
const NOVEL_INSTALL_ANCHOR = fileURLToPath(new URL('../../../packages/experimental/novel-studio/package.json', import.meta.url))
const MODE = webSnapshotMode()
const SESSION_ID = SessionId('novel-workbench-web-e2e')
const CALL_ID = CallId('novel-proposal-call')

interface ProposalFixture {
  readonly id: string
  readonly projectId: string
  readonly assetId: string
  readonly baseRevisionId: string
  readonly summary: string
  readonly operations: readonly {
    readonly selector: { readonly startUtf16: number; readonly endUtf16: number; readonly quoteHash: string }
    readonly replacement: string
  }[]
}

/** Capture the semantic workbench while masking the opaque revision-bearing URI payload. */
async function captureNovelWorkbench(page: Page, workspaceCwd: string): Promise<string> {
  const snapshot = await captureStableAria(page, '[data-novel-workbench]', workspaceCwd)
  return snapshot.replace(/dsh-novel:[A-Za-z0-9_-]+/gu, 'dsh-novel:{{reference}}')
}

/** Closed, keyless Session log carrying the real proposal's durable presentation metadata. */
function proposalFixture(changeSet: ProposalFixture): string {
  const operation = changeSet.operations[0]
  if (operation === undefined) throw new Error('proposal fixture requires one operation')
  const session = Session.create(SESSION_ID)
  session.append('turn/start', { turn: 1 })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: '把开头改得更克制。' }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  const args = JSON.stringify({
    project_id: changeSet.projectId,
    asset_id: changeSet.assetId,
    base_revision_id: changeSet.baseRevisionId,
    start_utf16: operation.selector.startUtf16,
    end_utf16: operation.selector.endUtf16,
    replacement: operation.replacement,
    summary: changeSet.summary,
  })
  session.append('assistant/message', {
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'tool-call', id: CALL_ID, name: 'novel_propose_changes', arguments: args }],
      source: { provider: 'snapshot', model: 'keyless' },
    }),
  }, { surfaceOp: 'append' })
  const call = session.append('tool/call', {
    turn: 1, step: 1, callId: CALL_ID, name: 'novel_propose_changes', arguments: args,
  })
  session.append('tool/result', {
    turn: 1,
    step: 1,
    message: createToolResultMessage({
      callId: CALL_ID,
      content: [{ type: 'text', text: `已创建修改提案：${changeSet.summary}。等待用户审阅，尚未修改正文。` }],
      isError: false,
    }),
    meta: {
      kind: 'novel-change-set',
      changeSetId: changeSet.id,
      projectId: changeSet.projectId,
      assetId: changeSet.assetId,
      baseRevisionId: changeSet.baseRevisionId,
      summary: changeSet.summary,
    },
  }, { surfaceOp: 'append', sourceEventSeqs: [call.seq] })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  return [
    JSON.stringify({
      type: 'session', version: SESSION_FORMAT_VERSION, id: '{{sessionId}}', createdAt: 0, cwd: '{{cwd}}',
    }),
    ...session.events.map(event => JSON.stringify(event)),
    '',
  ].join('\n')
}

describe.skipIf(MODE === 'record')('web e2e: Agent-native Novel Workbench MVP', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: NOVEL_OVERLAY,
      extraModuleFallbackAnchors: [NOVEL_INSTALL_ANCHOR],
      agentPresets: { roots: [{ path: NOVEL_PRESETS, trust: 'system' }], default: 'novel-workbench' },
    })
    await mkdir(join(scaffold.workspaceCwd, 'manuscript'))
    await writeFile(join(scaffold.workspaceCwd, 'novel.yaml'), [
      'kind: novel-project',
      'schema: 1',
      'id: project-white-harbor',
      'title: 白港',
      'contentRoots:',
      '  manuscript: manuscript',
      '',
    ].join('\n'))
    await writeFile(join(scaffold.workspaceCwd, 'manuscript', 'chapter-1.md'), [
      '---',
      'novel:',
      '  schema: 1',
      '  id: chapter-white-harbor-1',
      '  type: manuscript.chapter',
      '  title: 第一章',
      '---',
      '她没有再解释。雨还在下。',
    ].join('\n'))

    const project = await scaffold.ctx.novelRepository.discoverProject(
      await scaffold.ctx.fs.resolve(scaffold.workspaceCwd),
    )
    if (project === undefined) throw new Error('Novel Project fixture was not discovered')
    const chapter = await scaffold.ctx.novelRepository.readAsset(project, 'chapter-white-harbor-1' as never)
    const frozen = await scaffold.ctx.novelRepository.captureSelection(project, {
      assetId: chapter.asset.id,
      revisionId: chapter.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1 },
    })
    const proposal = await scaffold.ctx.novelRepository.proposeChangeSet(project, {
      assetId: chapter.asset.id,
      baseRevisionId: chapter.revisionId,
      operations: [{ kind: 'replace-text', selector: frozen.selector, replacement: '她沉默片刻' }],
      actor: { kind: 'agent', sessionId: SESSION_ID },
      summary: '以动作替代直接解释',
    })
    await seedSession(scaffold, proposalFixture(proposal), SESSION_ID, 'novel-workbench')

    const executablePath = process.env.DSH_PLAYWRIGHT_EXECUTABLE_PATH
    browser = await chromium.launch(executablePath === undefined ? {} : { executablePath })
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.baseUrl, { waitUntil: 'load' })
    try {
      await page.locator('[data-novel-workbench]').waitFor({ timeout: 30_000 })
    } catch (cause) {
      throw new Error(`Novel Workbench did not mount; page errors: ${JSON.stringify(tripwire.pageErrors)}; body: ${JSON.stringify(await page.locator('body').innerText())}`, { cause })
    }
    const searchButton = page.getByRole('button', { name: 'Search sessions' })
    await searchButton.click()
    const search = page.getByRole('textbox', { name: 'Search sessions...', exact: true })
    await search.fill('把开头改得更克制')
    const result = page.getByRole('tree', { name: 'Search results' }).getByRole('treeitem')
    await result.waitFor({ timeout: 30_000 })
    await result.click()
    try {
      await page.getByRole('textbox', { name: '第一章 · Chapter manuscript' }).waitFor({ timeout: 30_000 })
      await page.getByText('以动作替代直接解释', { exact: true }).waitFor({ timeout: 30_000 })
    } catch (cause) {
      throw new Error(`Novel Workbench content did not load; page errors: ${JSON.stringify(tripwire.pageErrors)}; body: ${JSON.stringify(await page.locator('body').innerText())}`, { cause })
    }
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the proposal, applies it explicitly, then freezes a post-save selection into Composer', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-novel-workbench'))
    await compareOrRefreshGolden(
      PROPOSED_EXPECTED,
      await captureNovelWorkbench(page, scaffold.workspaceCwd),
      MODE,
    )

    await page.getByRole('button', { name: 'Accept change' }).click()
    await page.getByText('Applied', { exact: true }).waitFor({ timeout: 15_000 })
    const editor = page.getByRole('textbox', { name: '第一章 · Chapter manuscript' })
    await expect.poll(() => editor.inputValue()).toBe('她沉默片刻没有再解释。雨还在下。')

    await editor.fill('她只看着窗外。雨还在下。')
    await editor.press('Home')
    for (let offset = 0; offset < 7; offset += 1) await editor.press('Shift+ArrowRight')
    await page.getByRole('button', { name: 'Reference selection to Agent' }).click()
    try {
      await page.getByText(/第一章 · 0–7 · 她只看着窗外/u).waitFor({ timeout: 15_000 })
    } catch (cause) {
      throw new Error(`Selection reference was not committed; page errors: ${JSON.stringify(tripwire.pageErrors)}; body: ${JSON.stringify(await page.locator('body').innerText())}`, { cause })
    }
    const composer = page.getByRole('complementary', { name: 'Agent conversation' }).locator('textarea')
    await expect.poll(() => composer.inputValue()).toMatch(/^@\[她只看着窗外。\]\(dsh-novel:/u)

    expect(await readFile(join(scaffold.workspaceCwd, 'manuscript', 'chapter-1.md'), 'utf8'))
      .toContain('她只看着窗外。雨还在下。')
    await compareOrRefreshGolden(
      APPLIED_EXPECTED,
      await captureNovelWorkbench(page, scaffold.workspaceCwd),
      MODE,
    )
    await assertFixtureInventory(SNAPSHOT_DIR, ['applied-and-context.expected.md', 'proposed.expected.md'])
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  }, 60_000)
})
