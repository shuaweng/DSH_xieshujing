import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { AssetId, ProjectId, RevisionId } from '@deepseek-ai/dsh-experimental-novel-repository'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelAssetTypeRegistry from '../../novel-repository/src/asset-types.ts'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import NovelContextResolver, {
  decodeNovelReferenceUri,
  encodeNovelReferenceUri,
  formatNovelReferenceMention,
  parseNovelReferenceText,
  type NovelContextSource,
} from '../src/index.ts'
import type { NovelReferenceInput } from '../src/types.ts'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()!()
})

async function harness(config: ConstructorParameters<typeof NovelContextResolver>[1] = {}, body = '白港下雨了。'): Promise<{
  ctx: Context
  session: Session
  agent: Agent
  revisionId: RevisionId
}> {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-novel-context-'))
  cleanups.push(() => rm(dir, { recursive: true, force: true }))
  await mkdir(join(dir, 'manuscript'))
  await writeFile(join(dir, 'novel.yaml'), [
    'kind: novel-project',
    'schema: 1',
    'id: project-context',
    'title: Context Project',
    'contentRoots:',
    '  manuscript: manuscript',
    '',
  ].join('\n'))
  await writeFile(join(dir, 'manuscript', 'chapter.md'), [
    '---',
    'novel:',
    '  schema: 1',
    '  id: chapter-context',
    '  type: manuscript.chapter',
    '  title: Context Chapter',
    '---',
    body,
  ].join('\n'))
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(NovelContextResolver, config)
  cleanups.push(async () => { await ctx.fiber.dispose() })
  const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
  if (project === undefined) throw new Error('expected Novel Project')
  const [asset] = await ctx.novelRepository.listAssets(project)
  if (asset === undefined) throw new Error('expected chapter Asset')
  const session = ctx.sessions.create(SessionId('novel-context-session'), { meta: { cwd: dir } })
  return {
    ctx,
    session,
    agent: { id: session.id, session, ctx } as Agent,
    revisionId: asset.revisionId,
  }
}

function reference(revisionId: RevisionId) {
  return {
    projectId: ProjectId('project-context'),
    assetId: AssetId('chapter-context'),
    revisionId,
    label: '白港选区',
  }
}

describe('Novel reference encoding', () => {
  it('round-trips canonical URIs and exposes readable inline mentions', () => {
    const value = reference(RevisionId('revision-one'))
    const uri = encodeNovelReferenceUri(value)
    expect(decodeNovelReferenceUri(uri)).toEqual({
      projectId: value.projectId,
      assetId: value.assetId,
      revisionId: value.revisionId,
    })
    const mention = formatNovelReferenceMention({ ...value, label: '白港]\\' })
    expect(parseNovelReferenceText(`请改写 ${mention}`)).toMatchObject({
      text: '请改写 @白港]\\',
      references: [{ ...value, label: '白港]\\' }],
    })
    expect(() => decodeNovelReferenceUri(`${uri}=`)).toThrow(/invalid novel reference URI/u)
  })

  it('round-trips complete selectors, bare references, defaults, and rejects every malformed URI family', () => {
    const selected: NovelReferenceInput = {
      projectId: ProjectId('project-context'),
      assetId: AssetId('chapter-context'),
      revisionId: RevisionId('revision-selected'),
      selector: {
        kind: 'text-range',
        startUtf16: 1,
        endUtf16: 3,
        quoteHash: 'sha256:quote',
        prefix: '前',
        suffix: '后',
      },
    }
    const uri = encodeNovelReferenceUri(selected)
    expect(decodeNovelReferenceUri(uri)).toEqual({
      projectId: selected.projectId,
      assetId: selected.assetId,
      revisionId: selected.revisionId,
      selector: selected.selector,
    })
    expect(formatNovelReferenceMention(selected).startsWith('@[chapter-context](dsh-novel:')).toBe(true)
    expect(parseNovelReferenceText(`读取 ${uri}`)).toMatchObject({
      text: '读取 @chapter-context',
      references: [{ assetId: 'chapter-context', label: 'chapter-context', selector: selected.selector }],
    })
    const compactSelector = encodeNovelReferenceUri({
      ...selected,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1, quoteHash: 'sha256:compact' },
    })
    expect(decodeNovelReferenceUri(compactSelector)).toMatchObject({
      selector: { startUtf16: 0, endUtf16: 1, quoteHash: 'sha256:compact' },
    })

    const encoded = (value: unknown): string => `dsh-novel:${Buffer.from(JSON.stringify(value)).toString('base64url')}`
    const invalid = [
      'not-a-novel-uri',
      'dsh-novel:',
      'dsh-novel:***',
      `dsh-novel:${Buffer.from('not json').toString('base64url')}`,
      encoded([]),
      encoded({ p: 1, a: 'a', r: 'r' }),
      encoded({ p: 'p', a: 1, r: 'r' }),
      encoded({ p: 'p', a: 'a', r: 1 }),
      encoded({ p: 'p', a: 'a', r: 'r', s: null }),
      encoded({ p: 'p', a: 'a', r: 'r', s: { k: 'x', b: 0, e: 1, q: 'q' } }),
      encoded({ p: 'p', a: 'a', r: 'r', s: { k: 't', b: 0.5, e: 1, q: 'q' } }),
      encoded({ p: 'p', a: 'a', r: 'r', s: { k: 't', b: 0, e: 1.5, q: 'q' } }),
      encoded({ p: 'p', a: 'a', r: 'r', s: { k: 't', b: 0, e: 1, q: 1 } }),
      encoded({ p: 'p', a: 'a', r: 'r', s: { k: 't', b: 0, e: 1, q: 'q', p: 1 } }),
      encoded({ p: 'p', a: 'a', r: 'r', s: { k: 't', b: 0, e: 1, q: 'q', x: 1 } }),
      `dsh-novel:${Buffer.from('{"p":"p", "a":"a","r":"r"}').toString('base64url')}`,
    ]
    for (const value of invalid) expect(() => decodeNovelReferenceUri(value)).toThrow(/invalid novel reference URI/u)
  })
})

describe('Novel context preparation', () => {
  it('replaces direct mentions with readable text and adds one durable untrusted context message', async () => {
    const { ctx, agent, revisionId } = await harness()
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const selection = await ctx.novelRepository.captureSelection(project, {
      assetId: AssetId('chapter-context'),
      revisionId,
      selector: { kind: 'text-range', startUtf16: 2, endUtf16: 4 },
    })
    const mention = formatNovelReferenceMention({
      ...reference(revisionId),
      selector: selection.selector,
    })
    const direct = createUserMessage({
      source: { kind: 'user' },
      content: [{ type: 'text', text: `写得更克制 ${mention}` }],
    })
    const signal = new AbortController().signal
    const decision = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [direct], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [direct] }),
    )

    expect(decision.kind).toBe('enter')
    if (decision.kind !== 'enter') throw new Error('expected entered step')
    expect(decision.messages).toHaveLength(2)
    expect(decision.messages[0]).toMatchObject({
      id: direct.id,
      source: { kind: 'user' },
      content: [{ type: 'text', text: '写得更克制 @白港选区' }],
    })
    const source = decision.messages[1]?.source
    expect(source).toMatchObject({
      kind: 'novel-context',
      form: 'manifest',
      version: 2,
      projectId: 'project-context',
      references: [{
        assetId: 'chapter-context', revisionId, origin: 'message', mode: 'explicit',
      }],
    })
    expect(source?.kind === 'novel-context' ? source.manifestId : '').toMatch(/^sha256:[a-f0-9]{64}$/u)
    const modelText = decision.messages[1]?.content[0]
    expect(modelText?.type === 'text' ? modelText.text : '').toContain('"text":"下雨"')
    expect(Object.isFrozen(decision.messages[1])).toBe(true)
  })

  it('retains a whole-value follow and pinned workset, projects it, and freezes it only for a direct turn', async () => {
    const { ctx, agent, session, revisionId } = await harness()
    const workset = {
      version: 1 as const,
      projectId: ProjectId('project-context'),
      items: [{
        ...reference(revisionId),
        mode: 'follow' as const,
        origin: 'active-asset' as const,
      }],
    }
    await expect(ctx.novelContextResolver.replaceWorkset(agent, workset)).resolves.toEqual(workset)
    const eventCount = session.events.filter(event => event.type === 'novel/context-workset').length
    await ctx.novelContextResolver.replaceWorkset(agent, workset)
    expect(session.events.filter(event => event.type === 'novel/context-workset')).toHaveLength(eventCount)
    expect(ctx.sessionProjections.snapshot(session).values.novelContextWorkset).toEqual(workset)

    const direct = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续写。' }] })
    const signal = new AbortController().signal
    const entered = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [direct], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [direct] }),
    )
    expect(entered).toMatchObject({
      kind: 'enter',
      messages: [
        { id: direct.id },
        { source: { kind: 'novel-context', form: 'manifest', references: [{ mode: 'follow', origin: 'active-asset' }] } },
      ],
    })
    const toolContinuation = createUserMessage({
      source: { kind: 'novel-context', form: 'catalog', version: 1, projectId: ProjectId('project-context'), references: [] },
      content: [{ type: 'text', text: 'already frozen' }],
    })
    const continuation = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [toolContinuation], turn: 1, step: 2, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [toolContinuation] }),
    )
    expect(continuation).toMatchObject({ kind: 'enter', messages: [toolContinuation] })
  })

  it('reads retained Revisions exactly, enforces budgets, and locks a Session to one project', async () => {
    const { ctx, agent, session, revisionId } = await harness({ maxReferences: 1, maxContextBytes: 64 })
    await expect(ctx.novelContextResolver.resolveReferences(agent, [reference(revisionId)]))
      .resolves.toMatchObject({ references: [{ text: '白港下雨了。' }] })
    await expect(ctx.novelContextResolver.resolveReferences(agent, [
      reference(revisionId),
      reference(RevisionId('another-revision')),
    ])).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_TOO_MANY' })

    const source: NovelContextSource = {
      kind: 'novel-context',
      form: 'catalog',
      version: 1,
      projectId: ProjectId('another-project'),
      references: [],
    }
    session.append(
      'user/message',
      createUserMessage({ source, content: [{ type: 'text', text: 'bound' }] }),
      { surfaceOp: 'append' },
    )
    await expect(ctx.novelContextResolver.resolveReferences(agent, [reference(revisionId)]))
      .rejects.toMatchObject({ code: 'NOVEL_CONTEXT_SESSION_BOUND' })

    const budget = await harness({ maxContextBytes: 8 })
    await expect(budget.ctx.novelContextResolver.resolveReferences(
      budget.agent,
      [reference(budget.revisionId)],
    )).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_BUDGET_EXCEEDED' })
  })

  it('rejects quote drift and invalid configuration before a model call', async () => {
    const { ctx, agent, revisionId } = await harness()
    await expect(ctx.novelContextResolver.resolveReferences(agent, [{
      ...reference(revisionId),
      selector: {
        kind: 'text-range',
        startUtf16: 0,
        endUtf16: 2,
        quoteHash: 'sha256:wrong',
      },
    }])).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_INVALID_REFERENCE' })

    const invalid = new Context()
    expect(() => new NovelContextResolver(invalid, { maxReferences: 0 }))
      .toThrow(expect.objectContaining({ code: 'NOVEL_CONTEXT_INVALID_CONFIG' }))
    await invalid.fiber.dispose()

  })

  it('rejects invalid reference sets, project drift, missing roots, and cancelled reads', async () => {
    const { ctx, agent, revisionId } = await harness()
    const resolver = ctx.novelContextResolver
    await expect(resolver.resolveReferences(agent, [])).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_INVALID_REFERENCE' })
    const invalidReferences: unknown[] = [
      null,
      {},
      { projectId: 1, assetId: 'a', revisionId: 'r' },
      { projectId: 'p', assetId: 1, revisionId: 'r' },
      { projectId: 'p', assetId: 'a', revisionId: 1 },
      { projectId: 'p', assetId: 'a', revisionId: 'r', label: 1 },
      { projectId: 'p', assetId: 'a', revisionId: 'r', selector: null },
      { projectId: 'p', assetId: 'a', revisionId: 'r', selector: {} },
      { projectId: 'p', assetId: 'a', revisionId: 'r', selector: { kind: 'x', value: Number.NaN } },
      { projectId: 'p', assetId: 'a', revisionId: 'r', selector: { kind: 'x', value: undefined } },
    ]
    for (const value of invalidReferences) {
      await expect(resolver.resolveReferences(agent, [value as NovelReferenceInput]))
        .rejects.toMatchObject({ code: 'NOVEL_CONTEXT_INVALID_REFERENCE' })
    }
    await expect(resolver.resolveReferences(agent, [
      reference(revisionId),
      { ...reference(revisionId), projectId: ProjectId('other-project') },
    ])).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_PROJECT_MISMATCH' })

    const noCwdId = SessionId('novel-context-no-cwd')
    const noCwdSession = Session.create(noCwdId, [], { version: 0, id: noCwdId, createdAt: 0 })
    const noCwd = { ...agent, id: noCwdId, session: noCwdSession } as Agent
    await expect(resolver.resolveReferences(noCwd, [reference(revisionId)]))
      .rejects.toMatchObject({ code: 'NOVEL_CONTEXT_PROJECT_NOT_FOUND' })

    const plainDir = await mkdtemp(join(tmpdir(), 'dsh-novel-context-plain-'))
    cleanups.push(() => rm(plainDir, { recursive: true, force: true }))
    const plainId = SessionId('novel-context-plain')
    const plainSession = Session.create(plainId, [], { version: 0, id: plainId, createdAt: 0, cwd: plainDir })
    const plain = { ...agent, id: plainId, session: plainSession } as Agent
    await expect(resolver.resolveReferences(plain, [reference(revisionId)]))
      .rejects.toMatchObject({ code: 'NOVEL_CONTEXT_PROJECT_NOT_FOUND' })
    await expect(resolver.resolveReferences(agent, [{
      ...reference(revisionId), projectId: ProjectId('different-project'),
    }])).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_PROJECT_MISMATCH' })

    const controller = new AbortController()
    controller.abort()
    await expect(resolver.resolveReferences(agent, [reference(revisionId)], controller.signal))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('deduplicates exact references, preserves safe tag text, and covers direct-message pass-throughs', async () => {
    const { ctx, agent, session, revisionId } = await harness()
    const ref = { ...reference(revisionId), label: '<chapter>' }
    const originalContent = [{ type: 'text' as const, text: 'author request' }, { type: 'reasoning' as const, text: 'not a mention' }]
    const prepared = await ctx.novelContextResolver.prepare(
      agent,
      originalContent,
      [ref, ref],
    )
    expect(prepared.content).not.toBe(originalContent)
    expect(prepared.content).toEqual(originalContent)
    const block = prepared.additionalContext?.content[0]
    expect(block?.type === 'text' ? block.text : '').toContain('\\u003cchapter>')
    const unlabeled = reference(revisionId)
    delete (unlabeled as { label?: string }).label
    await expect(ctx.novelContextResolver.resolveReferences(agent, [unlabeled]))
      .resolves.toMatchObject({ references: [{ input: { label: 'chapter-context' } }] })
    await expect(ctx.novelContextResolver.prepare(agent, [{ type: 'text', text: 'plain' }], []))
      .resolves.toEqual({ content: [{ type: 'text', text: 'plain' }] })

    const sameProjectSource: NovelContextSource = {
      kind: 'novel-context', form: 'catalog', version: 1,
      projectId: ProjectId('project-context'), references: [],
    }
    session.append('user/message', createUserMessage({
      source: sameProjectSource, content: [{ type: 'text', text: 'bound' }],
    }), { surfaceOp: 'append' })
    await expect(ctx.novelContextResolver.resolveReferences(agent, [reference(revisionId)]))
      .resolves.toMatchObject({ project: { id: 'project-context' } })

    const untouched = createUserMessage({ source: sameProjectSource, content: [{ type: 'text', text: 'catalog' }] })
    const imageOnly = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'reasoning', text: 'not text' }] })
    const direct = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'plain text' }] })
    const signal = new AbortController().signal
    const entered = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [untouched, imageOnly, direct], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [untouched, imageOnly, direct] }),
    )
    expect(entered).toMatchObject({ kind: 'enter', messages: [untouched, imageOnly, direct] })
    const rejected = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [direct], turn: 1, step: 1, signal },
      () => Promise.resolve({ kind: 'reject' as const, error: new Error('stopped') }),
    )
    expect(rejected.kind).toBe('reject')
  })

  it('rejects every invalid UTF-16 selection boundary, including split surrogate pairs', async () => {
    const { ctx, agent, revisionId } = await harness({}, 'A😀白')
    const base = reference(revisionId)
    const bad = [
      { startUtf16: -1, endUtf16: 1 },
      { startUtf16: 1, endUtf16: 1 },
      { startUtf16: 0, endUtf16: 99 },
      { startUtf16: 2, endUtf16: 3 },
      { startUtf16: 0, endUtf16: 2 },
    ]
    for (const offsets of bad) {
      await expect(ctx.novelContextResolver.resolveReferences(agent, [{
        ...base,
        selector: { kind: 'text-range', ...offsets, quoteHash: 'sha256:unused' },
      }])).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_INVALID_REFERENCE' })
    }
  })
})
