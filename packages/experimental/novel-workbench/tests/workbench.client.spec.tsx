// @vitest-environment jsdom
/** Novel Workbench interaction contract: layout, commit barrier, and review decisions. */

import { useSyncExternalStore } from 'react'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { SlotRegistry, type SessionId, type SessionListState, type ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import type {
  NovelChangeSetDescriptor,
  NovelAssetDocument,
  NovelSelectionDescriptor,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import { NovelFrame } from '../src/client/NovelFrame.tsx'
import { Explorer } from '../src/client/Explorer.tsx'
import { Canvas } from '../src/client/Canvas.tsx'
import { ChangeSetCard, type NovelChangeReview } from '../src/client/ChangeSetCard.tsx'
import { createNovelFrameStore, createNovelWorkbenchStore } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import { apply as applyWorkbench, inject as workbenchInject } from '../src/client/index.ts'
import {
  manuscriptChapterRenderer,
  NovelAssetRendererRegistry,
} from '../src/client/renderers.tsx'
import { apply as applyHost } from '../src/index.ts'
import * as invariant from '../src/invariant.ts'

afterEach(cleanup)

const SID = 'session-novel' as SessionId
const t = ((key: keyof typeof zh) => zh[key]) as never

function hookOf<T>(instance: { subscribe: (listener: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(select: (state: T) => S): S {
    return select(useSyncExternalStore(instance.subscribe, instance.getSnapshot))
  }
}

function useSessions<T>(select: (state: SessionListState) => T): T {
  return select({
    ids: [SID],
    byId: { [SID]: { id: SID, displayTitle: 'Novel', running: false, blank: false, updatedAt: 1 } },
    current: SID,
    phase: 'ready',
    subagentsByParent: {},
    jobsBySession: {},
    currentAddress: undefined,
  })
}

const renderers = { get: () => manuscriptChapterRenderer } as never

function chapter(overrides: Partial<NovelAssetDocument> = {}): NovelAssetDocument {
  return {
    id: 'asset-chapter-1' as NovelAssetDocument['id'],
    projectId: 'project-1' as NovelAssetDocument['projectId'],
    type: 'manuscript.chapter',
    projectRelativePath: 'manuscript/chapter-1.md',
    revisionId: 'revision-1' as NovelAssetDocument['revisionId'],
    contentHash: `sha256:${'a'.repeat(64)}`,
    title: '第一章',
    content: { kind: 'manuscript', body: '旧句继续。' },
    ...overrides,
  }
}

function selection(overrides: Partial<NovelSelectionDescriptor> = {}): NovelSelectionDescriptor {
  return {
    version: 1,
    id: 'selection-1' as NovelSelectionDescriptor['id'],
    projectId: 'project-1' as NovelSelectionDescriptor['projectId'],
    assetId: 'asset-chapter-1' as NovelSelectionDescriptor['assetId'],
    revisionId: 'revision-2' as NovelSelectionDescriptor['revisionId'],
    selector: {
      kind: 'text-range', startUtf16: 0, endUtf16: 2,
      quoteHash: `sha256:${'b'.repeat(64)}`,
    },
    preview: '新句',
    mention: 'dsh-novel:eyJ2IjoxfQ',
    ...overrides,
  }
}

function changeSet(status: NovelChangeSetDescriptor['status'] = 'proposed'): NovelChangeSetDescriptor {
  return {
    id: 'changeset-1' as NovelChangeSetDescriptor['id'],
    projectId: 'project-1' as NovelChangeSetDescriptor['projectId'],
    assetId: 'asset-chapter-1' as NovelChangeSetDescriptor['assetId'],
    baseRevisionId: 'revision-1' as NovelChangeSetDescriptor['baseRevisionId'],
    summary: '让句子更克制',
    assetType: 'manuscript.chapter',
    status,
    operations: [{
      kind: 'replace-text',
      selector: {
        kind: 'text-range', startUtf16: 0, endUtf16: 2,
        quoteHash: `sha256:${'c'.repeat(64)}`,
      },
      replacement: '新句',
    }],
  }
}

function settled(meta: unknown = { kind: 'novel-change-set', changeSetId: 'changeset-1' }): ToolResultNode {
  return {
    kind: 'tool-result', seq: 1, time: 2, callId: 'call-1', callTime: 1,
    call: { name: 'novel_propose_changes', argsRaw: '{}' },
    content: [{ type: 'text', text: 'Proposal created.' }],
    isError: false, callView: null, resultView: null, subCalls: [], meta,
  }
}

describe('NovelFrame', () => {
  it('keeps assets, canvas, Agent conversation, and overlays in one root occupant', () => {
    const frameStore = createNovelFrameStore().create()
    const calls: string[] = []
    const renderSlot = ((name: string) => {
      calls.push(name)
      return <span data-testid={name}>surface</span>
    }) as never
    const view = render(<NovelFrame
      renderSlot={renderSlot} t={t} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      SessionProvider={vi.fn() as never}
      useStore={hookOf(frameStore) as never} actions={frameStore.actions}
    />)

    expect(view.container.querySelector('[data-novel-workbench]')).not.toBeNull()
    expect(view.getByLabelText(zh.chapters)).toBeTruthy()
    expect(view.getByLabelText(zh.agent)).toBeTruthy()
    expect(calls).toEqual(['sidebar', 'conversation', 'details', 'novel.explorer', 'novel.canvas', 'shell.overlay'])
    expect(view.container.querySelector('[data-details-open]')).toBeNull()

    act(() => { frameStore.actions.toggleSidebar(); frameStore.actions.openDetails() })
    expect(view.container.querySelector('[data-details-open]')).not.toBeNull()
  })
})

describe('Canvas', () => {
  it('flushes a dirty draft before freezing and mentioning its exact Revision', async () => {
    const store = createNovelWorkbenchStore().create()
    act(() => {
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '新句继续。' })
      store.actions.select({ kind: 'text-range', startUtf16: 0, endUtf16: 2 })
    })
    const saved = chapter({
      revisionId: 'revision-2' as NovelAssetDocument['revisionId'],
      content: { kind: 'manuscript', body: '新句继续。' },
    })
    const frozen = selection()
    const order: string[] = []
    const save = vi.fn(async () => { order.push('save'); return saved })
    const capture = vi.fn(async () => { order.push('capture'); return frozen })
    const appendMention = vi.fn(() => { order.push('mention') })

    const view = render(<Canvas
      useStore={hookOf(store) as never}
      actions={store.actions}
      useSessions={useSessions as never}
      useWorkspaces={vi.fn() as never}
      save={save}
      capture={capture}
      appendMention={appendMention}
      renderers={renderers}
      t={t}
    />)
    fireEvent.click(view.getByText(zh.reference))

    await waitFor(() => { expect(appendMention).toHaveBeenCalledWith(SID, frozen.mention) })
    expect(order).toEqual(['save', 'capture', 'mention'])
    expect(save).toHaveBeenCalledWith(SID, {
      assetId: saved.id, baseRevisionId: 'revision-1', content: { kind: 'manuscript', body: '新句继续。' },
    })
    expect(capture).toHaveBeenCalledWith(SID, {
      assetId: saved.id, revisionId: saved.revisionId,
      selector: { kind: 'text-range', startUtf16: 0, endUtf16: 2 },
    })
    expect(view.getByText(/第一章 · 0–2/u)).toBeTruthy()
    expect(store.getSnapshot().document?.revisionId).toBe(saved.revisionId)
  })

  it('saves manually and renders the empty canvas without a chapter', async () => {
    const store = createNovelWorkbenchStore().create()
    const empty = render(<Canvas
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={vi.fn()} appendMention={vi.fn()} t={t}
      renderers={renderers}
    />)
    expect(empty.getByText(zh.noChapter)).toBeTruthy()
    empty.unmount()

    act(() => {
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '手动保存' })
      store.actions.select({ kind: 'text-range', startUtf16: 1, endUtf16: 3 })
    })
    const save = vi.fn(async () => chapter({
      content: { kind: 'manuscript', body: '手动保存' },
      revisionId: 'revision-2' as NovelAssetDocument['revisionId'],
    }))
    const view = render(<Canvas
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={save} capture={vi.fn()} appendMention={vi.fn()} renderers={renderers} t={t}
    />)
    fireEvent.click(view.getByText(zh.save))
    await waitFor(() => { expect(save).toHaveBeenCalledTimes(1) })
    await waitFor(() => { expect(view.getByText(zh.saved)).toBeTruthy() })
    expect(store.getSnapshot()).toMatchObject({
      dirty: false,
      selection: { kind: 'text-range', startUtf16: 1, endUtf16: 3 },
      document: { revisionId: 'revision-2' },
    })
    expect((view.getByText(zh.reference).closest('button') as HTMLButtonElement).disabled).toBe(false)
  })

  it('surfaces save failures and never captures a dirty selection against an old Revision', async () => {
    const store = createNovelWorkbenchStore().create()
    act(() => {
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '尚未保存的新正文' })
      store.actions.select({ kind: 'text-range', startUtf16: 0, endUtf16: 4 })
    })
    const capture = vi.fn()
    const appendMention = vi.fn()
    const view = render(<Canvas
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={async () => { throw new Error('workspace write denied') }} capture={capture} appendMention={appendMention}
      renderers={renderers} t={t}
    />)

    fireEvent.click(view.getByText(zh.reference))

    await waitFor(() => { expect(view.getByRole('alert').textContent).toContain('workspace write denied') })
    expect(capture).not.toHaveBeenCalled()
    expect(appendMention).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({
      dirty: true,
      selection: { kind: 'text-range', startUtf16: 0, endUtf16: 4 },
    })
  })

  it('keeps clean selections exact, handles editor events, and ignores incomplete context', async () => {
    const store = createNovelWorkbenchStore().create()
    const { preview: _preview, ...selectionWithoutPreview } = selection()
    const capture = vi.fn(async () => selectionWithoutPreview)
    const appendMention = vi.fn()
    act(() => {
      store.actions.open(chapter())
      store.actions.select({ kind: 'text-range', startUtf16: 0, endUtf16: 2 })
    })
    const view = render(<Canvas
      useStore={hookOf(store) as never} actions={store.actions} useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      save={vi.fn()} capture={capture} appendMention={appendMention} renderers={renderers} t={t}
    />)
    fireEvent.click(view.getByText(zh.reference))
    await waitFor(() => { expect(capture).toHaveBeenCalledWith(SID, expect.objectContaining({ revisionId: 'revision-1' })) })
    expect(view.getByText(/第一章 · 0–2$/u)).toBeTruthy()
    const textarea = view.getByLabelText(/第一章/u)
    fireEvent.change(textarea, { target: { value: '键盘编辑' } })
    Object.defineProperties(textarea, { selectionStart: { value: 1, configurable: true }, selectionEnd: { value: 3, configurable: true } })
    fireEvent.select(textarea)
    expect(store.getSnapshot()).toMatchObject({
      draft: { kind: 'manuscript', body: '键盘编辑' },
      dirty: true,
      selection: { kind: 'text-range', startUtf16: 1, endUtf16: 3 },
    })
    view.unmount()

    const noSession = render(<Canvas
      useStore={hookOf(store) as never} actions={store.actions}
      useSessions={((select: (state: SessionListState) => unknown) => select({
        ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      })) as never}
      useWorkspaces={vi.fn() as never} save={vi.fn()} capture={vi.fn()} appendMention={vi.fn()}
      renderers={renderers} t={t}
    />)
    fireEvent.click(noSession.getByText(zh.save))
    fireEvent.click(noSession.getByText(zh.reference))
  })
})

describe('Explorer', () => {
  function sessionHook(current: SessionId | undefined) {
    return function useCurrent<T>(select: (state: SessionListState) => T): T {
      return select({
        ids: current === undefined ? [] : [current], byId: {}, current, phase: 'ready',
        subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
      })
    }
  }

  it('loads a project, preserves the active chapter across refresh, and opens another chapter', async () => {
    const store = createNovelWorkbenchStore().create()
    const first = chapter()
    const second = chapter({ id: 'asset-chapter-2' as never, title: '第二章', projectRelativePath: 'manuscript/chapter-2.md' })
    const assets = [
      { ...first, content: undefined },
      { ...second, content: undefined },
    ] as never
    const project = {
      schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
    } as never
    const load = vi.fn(async () => ({ project, assets }))
    const open = vi.fn(async (_sid: SessionId, id: string) => id === first.id ? first : second)
    let refresh: (() => void) | undefined
    const onRefresh = vi.fn((listener: () => void) => { refresh = listener; return () => { refresh = undefined } })
    const view = render(<Explorer
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      load={load} open={open} onRefresh={onRefresh} t={t}
    />)
    await waitFor(() => { expect(view.getByText('第一章')).toBeTruthy() })
    await waitFor(() => { expect(store.getSnapshot().document?.id).toBe(first.id) })
    fireEvent.click(view.getByText('第二章'))
    await waitFor(() => { expect(store.getSnapshot().document?.id).toBe(second.id) })
    await waitFor(() => { expect(view.getByText('第二章').closest('button')?.getAttribute('data-active')).toBe('true') })
    act(() => { refresh?.() })
    await waitFor(() => { expect(load).toHaveBeenCalledTimes(2) })
    await waitFor(() => { expect(open).toHaveBeenLastCalledWith(SID, second.id) })
    expect(view.getByText('第二章').closest('button')?.getAttribute('data-active')).toBe('true')
  })

  it('shows absent-project and load/open failures, including non-Error failures', async () => {
    async function mountWith(load: () => Promise<never> | Promise<{ assets: never[] }>, open = vi.fn()) {
      const store = createNovelWorkbenchStore().create()
      const view = render(<Explorer
        useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
        load={load as never} open={open} onRefresh={() => () => {}} t={t}
      />)
      return { store, view }
    }
    const absent = await mountWith(async () => ({ assets: [] }))
    await waitFor(() => { expect(absent.view.getByText(zh.noProject)).toBeTruthy() })
    absent.view.unmount()
    const error = await mountWith(async () => { throw new Error('load failed') })
    await waitFor(() => { expect(error.view.getByText('load failed')).toBeTruthy() })
    error.view.unmount()
    const stringError = await mountWith(async () => { throw 'string load failure' })
    await waitFor(() => { expect(stringError.view.getByText('string load failure')).toBeTruthy() })
    stringError.view.unmount()

    const store = createNovelWorkbenchStore().create()
    const descriptor = { ...chapter(), content: undefined } as never
    const openFailure = render(<Explorer
      useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
      load={async () => ({ project: {} as never, assets: [descriptor] })}
      open={async () => { throw new Error('open failed') }} onRefresh={() => () => {}} t={t}
    />)
    await waitFor(() => { expect(openFailure.getByText('第一章')).toBeTruthy() })
    fireEvent.click(openFailure.getByText('第一章'))
    await waitFor(() => { expect(store.getSnapshot().error).toBe('Error: open failed') })
  })

  it('cancels late load outcomes and ignores chapter clicks without a Session', async () => {
    let resolveLoad!: (value: { project: never; assets: never[] }) => void
    let rejectLoad!: (reason: unknown) => void
    for (const pending of ['resolve', 'reject'] as const) {
      const store = createNovelWorkbenchStore().create()
      const promise = new Promise<{ project: never; assets: never[] }>((resolve, reject) => {
        resolveLoad = resolve; rejectLoad = reject
      })
      const view = render(<Explorer
        useStore={hookOf(store) as never} actions={store.actions} useSessions={sessionHook(SID) as never} useWorkspaces={vi.fn() as never}
        load={() => promise} open={vi.fn()} onRefresh={() => () => {}} t={t}
      />)
      view.unmount()
      if (pending === 'resolve') resolveLoad({ project: {} as never, assets: [] })
      else rejectLoad(new Error('late'))
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
      expect(store.getSnapshot().error).toBeUndefined()
    }

    const store = createNovelWorkbenchStore().create()
    act(() => { store.actions.loaded({} as never, [{ ...chapter(), content: undefined }] as never) })
    const open = vi.fn()
    const view = render(<Explorer
      useStore={hookOf(store)} actions={{ ...store.actions, reset: vi.fn() }}
      useSessions={sessionHook(undefined) as never} useWorkspaces={vi.fn() as never}
      load={vi.fn()} open={open} onRefresh={() => () => {}} t={t}
    />)
    fireEvent.click(view.getByText('第一章'))
    expect(open).not.toHaveBeenCalled()
  })
})

describe('ChangeSetCard', () => {
  it('shows the proposed diff and applies it only after an explicit decision', async () => {
    const read = vi.fn(async () => ({ changeSet: changeSet(), before: { kind: 'manuscript' as const, body: '旧句继续。' } }))
    const applyChange = vi.fn(async () => changeSet('applied'))
    const refreshWorkbench = vi.fn()
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={read} applyChange={applyChange} rejectChange={vi.fn()} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)

    await waitFor(() => { expect(view.getByText('旧句')).toBeTruthy() })
    expect(view.getByText('新句')).toBeTruthy()
    fireEvent.click(view.getByText(zh.accept))
    await waitFor(() => { expect(view.getByText(zh.applied)).toBeTruthy() })
    expect(applyChange).toHaveBeenCalledWith(SID, 'changeset-1')
    expect(refreshWorkbench).toHaveBeenCalledTimes(1)
  })

  it('rejects without refreshing and falls back for unrelated tool metadata', async () => {
    const rejectChange = vi.fn(async () => changeSet('rejected'))
    const refreshWorkbench = vi.fn()
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={vi.fn()} rejectChange={rejectChange} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(view.getByText(zh.reject)).toBeTruthy() })
    fireEvent.click(view.getByText(zh.reject))
    await waitFor(() => { expect(view.getByText(zh.rejected)).toBeTruthy() })
    expect(refreshWorkbench).not.toHaveBeenCalled()
    view.unmount()

    const fallback = render(<ChangeSetCard
      block={settled({ kind: 'other' })} sessionId={SID} toolName="other" callId="call-2"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={vi.fn()} applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)
    expect(fallback.getByText(zh.proposal)).toBeTruthy()
  })

  it('does not refresh when an apply decision resolves as conflicted', async () => {
    const refreshWorkbench = vi.fn()
    const view = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1" openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={async () => changeSet('conflicted')} rejectChange={vi.fn()} refreshWorkbench={refreshWorkbench}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(view.getByText(zh.accept)).toBeTruthy() })
    fireEvent.click(view.getByText(zh.accept))
    await waitFor(() => { expect(view.getByText(zh.conflicted)).toBeTruthy() })
    expect(refreshWorkbench).not.toHaveBeenCalled()
  })

  it('surfaces read and decision failures without mutating authored state', async () => {
    const readFailure = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => { throw new Error('cannot read proposal') }}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()} renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(readFailure.getByText('cannot read proposal')).toBeTruthy() })
    readFailure.unmount()

    const decisionFailure = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={async () => { throw new Error('apply failed safely') }} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(decisionFailure.getByText(zh.accept)).toBeTruthy() })
    fireEvent.click(decisionFailure.getByText(zh.accept))
    await waitFor(() => { expect(decisionFailure.getByText('apply failed safely')).toBeTruthy() })

    decisionFailure.unmount()
    const nonError = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => { throw 'string failure' }}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()} renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(nonError.getByText('string failure')).toBeTruthy() })
    nonError.unmount()

    const nonErrorDecision = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1" openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={async () => { throw 'string decision failure' }} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
      renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(nonErrorDecision.getByText(zh.accept)).toBeTruthy() })
    fireEvent.click(nonErrorDecision.getByText(zh.accept))
    await waitFor(() => { expect(nonErrorDecision.getByText('string decision failure')).toBeTruthy() })
  })

  it('renders conflict state and safely ignores every malformed metadata carrier', async () => {
    const conflict = render(<ChangeSetCard
      block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1"
      openFile={vi.fn()}
      useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
      useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
      read={async () => ({ changeSet: changeSet('conflicted'), before: { kind: 'manuscript', body: '旧句继续。' } })}
      applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()} renderers={renderers} t={t}
    />)
    await waitFor(() => { expect(conflict.getByText(zh.conflicted)).toBeTruthy() })
    conflict.unmount()
    for (const block of [
      {} as ToolResultNode,
      settled(null),
      settled('text'),
      settled({ kind: 'novel-change-set', changeSetId: 1 }),
    ]) {
      const fallback = render(<ChangeSetCard
        block={block} sessionId={SID} toolName="other" callId="call-x" openFile={vi.fn()}
        useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
        useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
        read={vi.fn()} applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
        renderers={renderers} t={t}
      />)
      expect(fallback.getByText(zh.proposal)).toBeTruthy()
      fallback.unmount()
    }
  })

  it('drops late read resolution and rejection after unmount', async () => {
    for (const outcome of ['resolve', 'reject'] as const) {
      let settle!: (value: NovelChangeReview) => void
      const pending = new Promise<NovelChangeReview>((resolve, reject) => {
        settle = outcome === 'resolve' ? resolve : () => { reject(new Error('late failure')) }
      })
      const view = render(<ChangeSetCard
        block={settled()} sessionId={SID} toolName="novel_propose_changes" callId="call-1" openFile={vi.fn()}
        useSessions={useSessions as never} useWorkspaces={vi.fn() as never}
        useSession={vi.fn() as never} useProjection={vi.fn() as never} useInput={vi.fn() as never} inputActions={{} as never}
        read={() => pending} applyChange={vi.fn()} rejectChange={vi.fn()} refreshWorkbench={vi.fn()}
        renderers={renderers} t={t}
      />)
      view.unmount()
      settle({ changeSet: changeSet(), before: { kind: 'manuscript', body: '旧句继续。' } })
      await act(async () => { await Promise.resolve(); await Promise.resolve() })
    }
  })
})

describe('Novel workbench stores and browser assembly', () => {
  it('keeps Client renderers exact and effect-scoped for independently contributed Asset types', async () => {
    const ctx = new Context()
    const registryFiber = ctx.plugin(NovelAssetRendererRegistry)
    await registryFiber
    const chapterFiber = ctx.plugin({
      inject: ['novelAssetRenderers'],
      apply(scope: Context) { scope.novelAssetRenderers.register(manuscriptChapterRenderer) },
    })
    await chapterFiber
    const testRenderer = { ...manuscriptChapterRenderer, type: 'bible.test' }
    const testFiber = ctx.plugin({
      inject: ['novelAssetRenderers'],
      apply(scope: Context) { scope.novelAssetRenderers.register(testRenderer) },
    })
    await testFiber

    expect(ctx.novelAssetRenderers.list().map(value => value.type)).toEqual(['bible.test', 'manuscript.chapter'])
    expect(ctx.novelAssetRenderers.get('bible.test')).toBe(testRenderer)
    expect(() => ctx.novelAssetRenderers.register(testRenderer)).toThrow(/already registered/u)
    expect(() => ctx.novelAssetRenderers.register({ ...testRenderer, type: 'Test' })).toThrow(/dotted lowercase/u)
    expect(() => ctx.novelAssetRenderers.register({ ...testRenderer, type: 'bible.missing', renderDiff: undefined } as never))
      .toThrow(/missing renderDiff/u)
    await testFiber.dispose()
    expect(() => ctx.novelAssetRenderers.get('bible.test')).toThrow(/no registered Client renderer/u)
    await chapterFiber.dispose()
    await registryFiber.dispose()
  })

  it('covers every shared state transition and frame action', () => {
    const store = createNovelWorkbenchStore().create()
    const project = {
      schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
    } as never
    const assets = [{ id: 'asset-1', title: '第一章' }] as never
    act(() => {
      store.actions.loaded(project, assets)
      store.actions.open(chapter())
      store.actions.edit({ kind: 'manuscript', body: '旧句继续。' })
      store.actions.select({ kind: 'text-range', startUtf16: 1, endUtf16: 2 })
      store.actions.referenced(selection())
      store.actions.saved(chapter({ revisionId: 'revision-2' as never, content: { kind: 'manuscript', body: '旧句继续。' } }))
      store.actions.fail('failed')
      store.actions.refresh()
    })
    expect(store.getSnapshot()).toMatchObject({ error: 'failed', reload: 1, dirty: false })
    act(() => { store.actions.reset() })
    expect(store.getSnapshot()).toEqual({
      assets: [], dirty: false, loading: true, reload: 1,
    })

    const frame = createNovelFrameStore().create()
    act(() => { frame.actions.toggleSidebar(); frame.actions.openDetails(); frame.actions.closeDetails() })
    expect(frame.getSnapshot()).toEqual({ sidebarCollapsed: false, detailsOpen: false })
  })

  it('wires slots, remotes, Composer mentions, reviews, layout, locale, and theme teardown', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    const slots = ctx.slots
    const locale = new LocaleRuntime(ctx)
    ctx.provide('locale', locale)
    const sessionScope: { value?: object } = {}
    ctx.provide('sessions', { scope: () => sessionScope.value } as never)
    const project = {
      schema: 1, id: 'project-1', title: '白港', rootDisplayPath: '/story',
      manifestDisplayPath: '/story/novel.yaml', contentRootDisplayPaths: { manuscript: '/story/manuscript' },
    }
    const asset = {
      id: 'asset-chapter-1', projectId: 'project-1', type: 'manuscript.chapter',
      projectRelativePath: 'manuscript/chapter-1.md', revisionId: 'revision-1',
      contentHash: `sha256:${'a'.repeat(64)}`, title: '第一章',
    }
    let discoverValue: unknown = project
    let failAsset = false
    const remote = {
      discover: vi.fn(async () => ({ ok: true as const, value: discoverValue })),
      assets: vi.fn(async () => ({ ok: true as const, value: [asset] })),
      asset: vi.fn(async (
        _sid: unknown,
        _aid: unknown,
        revision: NovelAssetDocument['revisionId'] | undefined,
      ) => failAsset
        ? { ok: false as const, error: { code: 'REMOTE_FAILED', message: 'offline', name: 'Error' } }
        : { ok: true as const, value: chapter({ revisionId: revision ?? chapter().revisionId }) }),
      saveAsset: vi.fn(async () => ({ ok: true as const, value: chapter({ revisionId: 'revision-2' as never }) })),
      captureSelection: vi.fn(async () => ({ ok: true as const, value: selection() })),
      changeSet: vi.fn(async () => ({ ok: true as const, value: changeSet() })),
      applyChangeSet: vi.fn(async () => ({ ok: true as const, value: changeSet('applied') })),
      rejectChangeSet: vi.fn(async () => ({ ok: true as const, value: changeSet('rejected') })),
    }
    ctx.provide('remote', { novelRepository: remote } as never)
    let theme: ThemeSnapshot = {
      preference: 'light', active: { id: 'light', colorScheme: 'light', tokens: { '--novel-old': '1px' } },
      themes: [], revision: 0,
    }
    ctx.provide('theme', { getTheme: () => theme } as never)
    const declareTool = slots.register({
      name: 'root',
      priority: 10,
      children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
    } as never, () => null)
    const fiber = ctx.plugin({
      // The production client module loader understands dotted Remote facets;
      // this direct Cordis bench provides the complete remote object itself.
      inject: workbenchInject.filter(name => name !== 'remote.novelRepository'),
      apply: applyWorkbench,
    })
    await fiber.await()

    expect(slots.entries('root')).toHaveLength(2)
    const root = slots.entries('root').find(entry => entry.component === NovelFrame)!
    const layout = ctx.get('layout') as { toggleSidebar: () => void; openDetails: () => void; closeDetails: () => void }
    layout.toggleSidebar(); layout.openDetails(); layout.closeDetails()
    const panels = { toggleSidebar: vi.fn(), openDetails: vi.fn(), closeDetails: vi.fn() }
    expect((root.inject as (actions: typeof panels) => object)(panels)).toEqual({})
    layout.toggleSidebar(); layout.openDetails(); layout.closeDetails()
    expect(panels.toggleSidebar).toHaveBeenCalledOnce()
    expect(panels.openDetails).toHaveBeenCalledOnce()
    expect(panels.closeDetails).toHaveBeenCalledOnce()

    const explorer = slots.entries('novel.explorer')[0]!.inject as () => {
      load: (id: SessionId) => Promise<unknown>
      open: (id: SessionId, assetId: string) => Promise<unknown>
      onRefresh: (listener: () => void) => () => void
    }
    const explorerFace = explorer()
    await expect(explorerFace.load(SID)).resolves.toMatchObject({ project, assets: [asset] })
    discoverValue = undefined
    await expect(explorerFace.load(SID)).resolves.toEqual({ assets: [asset] })
    await expect(explorerFace.open(SID, 'asset-chapter-1')).resolves.toMatchObject({ title: '第一章' })

    const canvas = slots.entries('novel.canvas')[0]!.inject as () => {
      save: (id: SessionId, request: unknown) => Promise<unknown>
      capture: (id: SessionId, request: unknown) => Promise<unknown>
      appendMention: (id: SessionId, mention: string) => void
    }
    const canvasFace = canvas()
    await expect(canvasFace.save(SID, {})).resolves.toMatchObject({ revisionId: 'revision-2' })
    await expect(canvasFace.capture(SID, {})).resolves.toMatchObject({ id: 'selection-1' })
    expect(() => { canvasFace.appendMention(SID, 'mention') }).toThrow(/no browser scope/u)
    sessionScope.value = {}
    expect(() => { canvasFace.appendMention(SID, 'mention') }).toThrow(/conversation service is unavailable/u)
    let draft = ''
    const setDraft = vi.fn((value: string) => { draft = value })
    ctx.provide('conversation', { input: { for: () => ({ state: { getSnapshot: () => ({ draft }) }, setDraft }) } } as never)
    canvasFace.appendMention(SID, 'one')
    draft = 'two '
    canvasFace.appendMention(SID, 'three')
    draft = 'four'
    canvasFace.appendMention(SID, 'five')
    expect(setDraft.mock.calls.map(call => call[0])).toEqual(['one ', 'two three ', 'four five '])

    const card = slots.entries('tool.call.toolview').find(entry => entry.component === ChangeSetCard)!
    const review = (card.inject as () => {
      read: (sid: string, id: string) => Promise<NovelChangeReview>
      applyChange: (sid: string, id: string) => Promise<NovelChangeSetDescriptor>
      rejectChange: (sid: string, id: string) => Promise<NovelChangeSetDescriptor>
      refreshWorkbench: () => void
    })()
    await expect(review.read(SID, 'changeset-1')).resolves.toMatchObject({
      changeSet: { id: 'changeset-1' },
      before: { kind: 'manuscript', body: '旧句继续。' },
    })
    await expect(review.applyChange(SID, 'changeset-1')).resolves.toMatchObject({ status: 'applied' })
    await expect(review.rejectChange(SID, 'changeset-1')).resolves.toMatchObject({ status: 'rejected' })
    const refreshed = vi.fn()
    const offRefresh = explorerFace.onRefresh(refreshed)
    review.refreshWorkbench()
    expect(refreshed).toHaveBeenCalledOnce()
    offRefresh()
    review.refreshWorkbench()
    expect(refreshed).toHaveBeenCalledOnce()

    failAsset = true
    await expect(explorerFace.open(SID, 'asset-chapter-1')).rejects.toThrow('open Novel Asset failed: REMOTE_FAILED: offline')
    expect(document.documentElement.style.colorScheme).toBe('light')
    expect(document.body.style.getPropertyValue('--novel-old')).toBe('1px')
    theme = {
      preference: 'dark', active: { id: 'dark', colorScheme: 'dark', tokens: { '--novel-old': '3px', '--novel-new': '2px' } },
      themes: [], revision: 1,
    }
    ctx.emit('theme/change', theme)
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(true)
    expect(document.body.style.getPropertyValue('--novel-old')).toBe('3px')
    theme = {
      preference: 'dark', active: { id: 'dark', colorScheme: 'dark', tokens: { '--novel-new': '2px' } },
      themes: [], revision: 2,
    }
    ctx.emit('theme/change', theme)
    expect(document.body.style.getPropertyValue('--novel-old')).toBe('')
    expect(document.body.style.getPropertyValue('--novel-new')).toBe('2px')

    await fiber.dispose()
    expect(document.documentElement.style.colorScheme).toBe('')
    expect(document.body.hasAttribute('data-ds-dark-theme')).toBe(false)
    expect(document.body.style.getPropertyValue('--novel-new')).toBe('')
    declareTool()
  })

  it('keeps the Host half empty and registers its invariant companion', async () => {
    applyHost()
    const register = vi.fn().mockReturnValue(() => {})
    const dispose = await invariant.apply({ invariants: { register } } as never)
    expect(invariant.name).toBe('novel-workbench-invariant')
    expect(invariant.inject).toEqual(['invariants'])
    expect(register).toHaveBeenCalledWith('@deepseek-ai/dsh-experimental-novel-workbench', expect.any(Function))
    expect(() => { (register.mock.calls[0]![1] as () => void)() }).not.toThrow()
    expect(dispose).toBeTypeOf('function')
  })
})
