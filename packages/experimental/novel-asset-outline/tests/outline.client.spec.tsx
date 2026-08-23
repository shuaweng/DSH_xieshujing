// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createPlanningOutlineRenderer, zh } from '../src/client/index.ts'

const t = ((key: keyof typeof zh) => zh[key]) as never

describe('planning.outline Client renderer', () => {
  it('edits the same structured value and captures one semantic node selection', () => {
    const renderer = createPlanningOutlineRenderer(t)
    const onContentChange = vi.fn()
    const onTitleChange = vi.fn()
    const onSelectionChange = vi.fn()
    const view = render(renderer.renderEditor({
      document: {} as never,
      title: '主线大纲',
      content: {
        kind: 'outline',
        nodes: [{ id: 'chapter-1', title: '第一章', summary: '旧概要', children: [] }],
      },
      ariaLabel: '主线大纲',
      onContentChange,
      onTitleChange,
      onSelectionChange,
    }))
    fireEvent.click(view.getByRole('button', { name: '第一章' }))
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: 'outline-node', nodeId: 'chapter-1' })
    fireEvent.change(view.getByLabelText(new RegExp(zh.summary, 'u')), { target: { value: '新概要' } })
    expect(onContentChange).toHaveBeenCalledWith({
      kind: 'outline',
      nodes: [{ id: 'chapter-1', title: '第一章', summary: '新概要', children: [] }],
    })
    fireEvent.change(view.getByLabelText(zh.outlineTitle), { target: { value: '第一卷规划' } })
    expect(onTitleChange).toHaveBeenCalledWith('第一卷规划')
  })

  it('renders a field-level typed Diff', () => {
    const renderer = createPlanningOutlineRenderer(t)
    const view = render(renderer.renderDiff({
      kind: 'outline', nodes: [{ id: 'chapter-1', title: '第一章', summary: '旧概要', children: [] }],
    }, [{
      kind: 'update-outline-node',
      selector: { kind: 'outline-node', nodeId: 'chapter-1', nodeHash: `sha256:${'a'.repeat(64)}` },
      changes: { summary: '新概要' },
    }]))
    expect(view.getByLabelText(zh.before).textContent).toBe('旧概要')
    expect(view.getByLabelText(zh.after).textContent).toBe('新概要')
  })
})
