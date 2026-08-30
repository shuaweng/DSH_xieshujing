import { Context } from '@deepseek-ai/cordis'
import { agentEvents, type Agent } from '@deepseek-ai/dsh-agent'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import { CallId, createToolResultMessage, createUserMessage } from '@deepseek-ai/dsh-llm'
import { AssetId, ProjectId, RevisionId } from '@deepseek-ai/dsh-experimental-novel-repository'
import { apply as applyOutlineAssetTypes } from '@deepseek-ai/dsh-experimental-novel-asset-outline'
import LocalNovelRepository from '../../novel-repository-local/src/index.ts'
import NovelAssetTypeRegistry from '../../novel-repository/src/asset-types.ts'
import SessionStore, { Session, SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SkillRegistry from '@deepseek-ai/dsh-skill'
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
  await mkdir(join(dir, 'planning'))
  await writeFile(join(dir, 'novel.yaml'), [
    'kind: novel-project',
    'schema: 1',
    'id: project-context',
    'title: Context Project',
    'contentRoots:',
    '  manuscript: manuscript',
    '  planning: planning',
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
  await writeFile(join(dir, 'planning', 'chapter-outline.md'), [
    '---', 'novel:', '  schema: 1', '  id: chapter-outline-context',
    '  type: planning.chapter-outline', '  title: 第一章章纲', '  parent: chapter-context',
    '---', '先发现灯灭，再听见脚步。', '',
  ].join('\n'))
  await writeFile(join(dir, 'planning', 'brief.md'), [
    '---', 'novel:', '  schema: 1', '  id: brief-context',
    '  type: book.brief', '  title: 本书概述', '---', '白港悬疑故事。', '',
  ].join('\n'))
  await writeFile(join(dir, 'planning', 'style.md'), [
    '---', 'novel:', '  schema: 1', '  id: style-context',
    '  type: book.style-profile', '  title: 本书风格', '---', '克制，短句。', '',
  ].join('\n'))
  await writeFile(join(dir, 'planning', 'story-state.md'), [
    '---', 'novel:', '  schema: 1', '  id: story-state-context',
    '  type: book.story-state', '  title: 故事状态', '---',
    '# 当前事实', '', '- 林澈已经抵达白港。', '',
  ].join('\n'))
  await writeFile(join(dir, 'planning', 'outline.md'), [
    '---', 'novel:', '  schema: 1', '  id: outline-context',
    '  type: planning.outline', '  title: 全书大纲', '  level: book',
    '---', '第一卷抵达白港。', '',
  ].join('\n'))
  const ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  await ctx.plugin(NovelAssetTypeRegistry)
  applyOutlineAssetTypes(ctx)
  await ctx.plugin(LocalNovelRepository)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SkillRegistry)
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
      version: 3,
      policies: ['direct-turn'],
      projectId: 'project-context',
      references: [{
        assetId: 'chapter-context', revisionId, origin: 'message', mode: 'explicit',
      }],
    })
    expect(source?.kind === 'novel-context' && source.version === 3 ? source.manifestId : '')
      .toMatch(/^sha256:[a-f0-9]{64}$/u)
    const modelText = decision.messages[1]?.content[0]
    const frozenText = modelText?.type === 'text' ? modelText.text : ''
    expect(frozenText).toContain('"reference":"dsh-novel:')
    expect(frozenText).toContain('"text":"下雨"')
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
    const currentWorkset = {
      version: 2 as const,
      projectId: ProjectId('project-context'),
      items: [{
        projectId: ProjectId('project-context'),
        assetId: AssetId('chapter-context'),
        label: '白港选区',
        mode: 'follow' as const,
        origin: 'active-asset' as const,
      }],
    }
    await expect(ctx.novelContextResolver.replaceWorkset(agent, workset)).resolves.toEqual(currentWorkset)
    const eventCount = session.events.filter(event => event.type === 'novel/context-workset').length
    await ctx.novelContextResolver.replaceWorkset(agent, workset)
    expect(session.events.filter(event => event.type === 'novel/context-workset')).toHaveLength(eventCount)
    expect(ctx.sessionProjections.snapshot(session).values.novelContextWorkset).toEqual(currentWorkset)

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
    if (entered.kind !== 'enter') throw new Error('expected entered step')
    const followed = entered.messages[1]?.content[0]
    const followedText = followed?.type === 'text' ? followed.text : ''
    expect(followedText).toContain('"reference":"dsh-novel:')
    expect(followedText).not.toContain('"text":')
    expect(entered.messages[1]?.source).toMatchObject({
      version: 3,
      references: [{ revisionId, projection: 'coordinate' }],
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

    const surfaceWorkset = {
      version: 2 as const,
      projectId: ProjectId('project-context'),
      items: [],
      surface: {
        kind: 'library-home' as const,
        label: '小说工作台首页',
        bookCount: 3,
        manuscriptCharacters: 34781,
        todayCharacterDelta: 3376,
        books: [{
          title: '白港', description: '海港悬疑故事。', chapterCount: 1,
          manuscriptCharacters: 2113, continueTitle: '第一章',
        }],
        omittedBooks: 2,
      },
    }
    await expect(ctx.novelContextResolver.replaceWorkset(agent, surfaceWorkset)).resolves.toEqual(surfaceWorkset)
    const homePrompt = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '我有哪些书？' }] })
    const homeEntered = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [homePrompt], turn: 2, step: 1, signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [homePrompt] }),
    )
    if (homeEntered.kind !== 'enter') throw new Error('expected entered home step')
    expect(homeEntered.messages[1]?.source).toMatchObject({
      kind: 'novel-context', version: 3,
      surface: { kind: 'library-home', label: '小说工作台首页', bookCount: 3 },
      references: [],
    })
    const homeContext = homeEntered.messages[1]?.content[0]
    expect(homeContext?.type === 'text' ? homeContext.text : '').toContain('"title":"白港"')
  })

  it('compiles task-related exact material once and keeps lower-priority global context coordinate-only', async () => {
    const { ctx, agent, revisionId } = await harness()
    const compiled = await ctx.novelContextResolver.compile(agent, {
      policies: ['chapter-write'],
      targets: [{
        ...reference(revisionId),
        origin: 'active-asset', mode: 'explicit', projection: 'full',
        reason: 'target-asset', required: true,
      }],
    })
    expect(compiled.source).toMatchObject({ version: 3, policies: ['chapter-write'] })
    expect(compiled.source.references.find(item => item.assetId === 'chapter-context'))
      .toMatchObject({ projection: 'full', reason: 'target-asset' })
    expect(compiled.source.references.find(item => item.assetId === 'chapter-outline-context'))
      .toMatchObject({ projection: 'full', reason: 'chapter-outline' })
    expect(compiled.source.references.find(item => item.assetId === 'brief-context'))
      .toMatchObject({ projection: 'full', reason: 'book-brief' })
    expect(compiled.source.references.find(item => item.assetId === 'style-context'))
      .toMatchObject({ projection: 'full', reason: 'book-style' })
    expect(compiled.source.references.find(item => item.assetId === 'story-state-context'))
      .toMatchObject({ projection: 'full', reason: 'story-state' })
    expect(compiled.source.references.find(item => item.assetId === 'outline-context'))
      .toMatchObject({ projection: 'coordinate', reason: 'book-outline' })
    expect(new Set(compiled.source.references.map(item => `${item.assetId}@${item.revisionId}`)).size)
      .toBe(compiled.source.references.length)
    expect(compiled.text).toContain('先发现灯灭，再听见脚步。')
    expect(compiled.text).toContain('林澈已经抵达白港。')
    expect(compiled.text).not.toContain('"reason":"book-outline","text"')

    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const chapterOutline = (await ctx.novelRepository.listAssets(project))
      .find(summary => summary.asset.id === 'chapter-outline-context')
    if (chapterOutline === undefined) throw new Error('expected chapter outline')
    const outlineTask = await ctx.novelContextResolver.compile(agent, {
      policies: ['outline-edit'],
      targets: [{
        projectId: project.id,
        assetId: chapterOutline.asset.id,
        revisionId: chapterOutline.revisionId,
        label: chapterOutline.title,
        projection: 'full',
        reason: 'target-asset',
        required: true,
      }],
    })
    expect(outlineTask.source.references.find(item => item.assetId === 'outline-context'))
      .toMatchObject({ projection: 'full', reason: 'book-outline' })
    expect(outlineTask.source.references.find(item => item.assetId === 'brief-context'))
      .toMatchObject({ projection: 'full', reason: 'book-brief' })
    expect(outlineTask.source.references.find(item => item.assetId === 'chapter-context'))
      .toMatchObject({ projection: 'coordinate', reason: 'outline-parent' })
  })

  it('keeps required task material, degrades optional prose to coordinates, and hashes the frozen cut deterministically', async () => {
    const { ctx, agent, revisionId } = await harness({ maxContextBytes: 20 })
    const request = {
      policies: ['chapter-write'] as const,
      targets: [{
        ...reference(revisionId),
        origin: 'active-asset' as const,
        mode: 'explicit' as const,
        projection: 'full' as const,
        reason: 'target-asset' as const,
        required: true,
      }],
    }
    const first = await ctx.novelContextResolver.compile(agent, request)
    const second = await ctx.novelContextResolver.compile(agent, request)
    expect(first.source.manifestId).toBe(second.source.manifestId)
    expect(first.text).toContain(first.source.manifestId)
    expect(first.source.references).toEqual(expect.arrayContaining([
      expect.objectContaining({ assetId: 'chapter-context', projection: 'full', modelTextBytes: 18 }),
      expect.objectContaining({ assetId: 'chapter-outline-context', projection: 'coordinate', modelTextBytes: 0 }),
      expect.objectContaining({ assetId: 'brief-context', projection: 'coordinate', modelTextBytes: 0 }),
      expect.objectContaining({ assetId: 'style-context', projection: 'coordinate', modelTextBytes: 0 }),
    ]))
    expect(first.text.match(/白港下雨了。/gu)).toHaveLength(1)

    const minimalDuplicate = await ctx.novelContextResolver.compile(agent, {
      policies: ['direct-turn'],
      targets: [{
        ...reference(revisionId), projection: 'coordinate', reason: 'target-asset', required: true,
      }, {
        ...reference(revisionId), projection: 'full', reason: 'pinned-asset', required: false,
      }],
    })
    expect(minimalDuplicate.source.references).toHaveLength(1)
    expect(minimalDuplicate.source.references[0]).toMatchObject({
      assetId: 'chapter-context', projection: 'coordinate', reason: 'target-asset', modelTextBytes: 0,
    })
    expect(minimalDuplicate.text).not.toContain('白港下雨了。')

    const twoSelections = await ctx.novelContextResolver.compile(agent, {
      policies: ['direct-turn'],
      targets: [0, 1].map(index => ({
        ...reference(revisionId),
        selector: {
          kind: 'text-range' as const,
          startUtf16: index,
          endUtf16: index + 1,
          quoteHash: `sha256:test-${index}`,
        },
        projection: 'coordinate' as const,
        reason: 'explicit-material' as const,
        required: true,
      })),
    })
    expect(twoSelections.source.references).toHaveLength(2)

    const tooSmall = await harness({ maxContextBytes: 8 })
    await expect(tooSmall.ctx.novelContextResolver.compile(tooSmall.agent, {
      policies: ['chapter-write'],
      targets: [{
        ...reference(tooSmall.revisionId),
        projection: 'full', reason: 'target-asset', required: true,
      }],
    })).rejects.toMatchObject({ code: 'NOVEL_CONTEXT_BUDGET_EXCEEDED' })
  })

  it('resolves a live follow pointer to the latest Revision only when the prompt is compiled', async () => {
    const { ctx, agent, revisionId } = await harness()
    await ctx.novelContextResolver.replaceWorkset(agent, {
      version: 2,
      projectId: ProjectId('project-context'),
      items: [{
        projectId: ProjectId('project-context'), assetId: AssetId('chapter-context'),
        label: '第一章', mode: 'follow', origin: 'active-asset',
      }],
    })
    const project = await ctx.novelRepository.discoverProject(await ctx.fs.resolve('.'))
    if (project === undefined) throw new Error('expected Novel Project')
    const saved = await ctx.novelRepository.saveAssetContent(project, {
      assetId: AssetId('chapter-context'),
      baseRevisionId: revisionId,
      content: { kind: 'manuscript', body: '这是当前最新正文。' },
    })
    const direct = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '继续。' }] })
    const entered = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [direct], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [direct] }),
    )
    if (entered.kind !== 'enter') throw new Error('expected entered step')
    expect(entered.messages[1]?.source).toMatchObject({
      version: 3,
      references: [{ assetId: 'chapter-context', revisionId: saved.revisionId, projection: 'coordinate' }],
    })
  })

  it('uses declared Skill metadata instead of guessing prose intent for an explicit Skill turn', async () => {
    const { ctx, agent } = await harness()
    ctx.skills.register({
      name: 'chapter-execution',
      description: 'write a chapter',
      content: 'Write only from frozen context.',
      source: 'runtime',
      metadata: { novelContextPolicy: 'chapter-write' },
    })
    await ctx.novelContextResolver.replaceWorkset(agent, {
      version: 2,
      projectId: ProjectId('project-context'),
      items: [{
        projectId: ProjectId('project-context'), assetId: AssetId('chapter-context'),
        label: '第一章', mode: 'follow', origin: 'active-asset',
      }],
    })
    const direct = createUserMessage({
      source: { kind: 'user' }, content: [{ type: 'text', text: '/chapter-execution 继续本章。' }],
    })
    const entered = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [direct], turn: 1, step: 1, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [direct] }),
    )
    if (entered.kind !== 'enter') throw new Error('expected entered step')
    const source = entered.messages[1]?.source
    expect(source).toMatchObject({ version: 3, policies: ['chapter-write'] })
    if (source?.kind !== 'novel-context' || source.version !== 3) throw new Error('expected V3 context')
    expect(source.references.find(item => item.assetId === 'chapter-context'))
      .toMatchObject({ projection: 'full' })
    expect(source.references.find(item => item.assetId === 'chapter-outline-context'))
      .toMatchObject({ projection: 'full' })
  })

  it('adds related material after a model-loaded Skill without duplicating already frozen prose', async () => {
    const { ctx, agent, session, revisionId } = await harness()
    ctx.skills.register({
      name: 'chapter-execution', description: 'write a chapter', source: 'runtime',
      content: 'Write only from frozen context.', metadata: { novelContextPolicy: 'chapter-write' },
    })
    const initial = await ctx.novelContextResolver.compile(agent, {
      policies: ['direct-turn'],
      targets: [{
        ...reference(revisionId), origin: 'message', mode: 'explicit',
        projection: 'full', reason: 'explicit-material', required: true,
      }],
    })
    const callId = CallId('skill-context-call')
    session.append('turn/start', { turn: 1 })
    session.append('step/start', { turn: 1, step: 1 })
    session.append('user/message', initial.additionalContext, { surfaceOp: 'append' })
    session.append('tool/call', {
      turn: 1, step: 1, callId, name: 'skill', arguments: '{"name":"chapter-execution"}',
    })
    session.append('tool/result', {
      turn: 1, step: 1,
      message: createToolResultMessage({ callId, content: [{ type: 'text', text: 'loaded' }], isError: false }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 1 })
    const entered = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [], turn: 1, step: 2, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    )
    if (entered.kind !== 'enter') throw new Error('expected entered step')
    expect(entered.messages).toHaveLength(1)
    const source = entered.messages[0]?.source
    expect(source).toMatchObject({ version: 3, policies: ['chapter-write'] })
    if (source?.kind !== 'novel-context' || source.version !== 3) throw new Error('expected V3 context')
    expect(source.references.find(item => item.assetId === 'chapter-context'))
      .toMatchObject({ projection: 'coordinate' })
    expect(source.references.find(item => item.assetId === 'chapter-outline-context'))
      .toMatchObject({ projection: 'full' })
    const block = entered.messages[0]?.content[0]
    const text = block?.type === 'text' ? block.text : ''
    expect(text).not.toContain('白港下雨了。')
    expect(text).toContain('先发现灯灭，再听见脚步。')

    const repeatedCallId = CallId('skill-context-call-repeated')
    session.append('step/start', { turn: 1, step: 2 })
    session.append('user/message', entered.messages[0]!, { surfaceOp: 'append' })
    session.append('tool/call', {
      turn: 1, step: 2, callId: repeatedCallId, name: 'skill', arguments: '{"name":"chapter-execution"}',
    })
    session.append('tool/result', {
      turn: 1, step: 2,
      message: createToolResultMessage({
        callId: repeatedCallId, content: [{ type: 'text', text: 'loaded again' }], isError: false,
      }),
    }, { surfaceOp: 'append' })
    session.append('step/end', { turn: 1, step: 2 })
    const repeated = await agentEvents(ctx, agent).waterfall(
      'agent/pre-step',
      { messages: [], turn: 1, step: 3, signal: new AbortController().signal },
      () => Promise.resolve({ kind: 'enter' as const, messages: [] }),
    )
    if (repeated.kind !== 'enter') throw new Error('expected repeated entered step')
    const repeatedBlock = repeated.messages[0]?.content[0]
    expect(repeatedBlock?.type === 'text' ? repeatedBlock.text : '').not.toContain('白港下雨了。')
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
