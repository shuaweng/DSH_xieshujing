// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createBookBriefRenderer,
  createBookStyleProfileRenderer,
  createChapterOutlineRenderer,
  createPlanningOutlineRenderer,
  zh,
} from '../src/client/index.ts'

const t = ((key: keyof typeof zh) => zh[key]) as never

describe('freeform planning Client renderers', () => {
  it('edits arbitrary outline Markdown and captures an exact text range', () => {
    const renderer = createPlanningOutlineRenderer(t)
    const onContentChange = vi.fn()
    const onTitleChange = vi.fn()
    const onSelectionChange = vi.fn()
    const view = render(renderer.renderEditor({
      document: {} as never,
      title: '全书大纲',
      content: { kind: 'outline', level: 'book', body: '# 开端\n\n雨夜抵达白港。' },
      ariaLabel: '全书大纲',
      onContentChange,
      onTitleChange,
      onSelectionChange,
    }))
    const editor = view.getByLabelText(zh.freeformBody)
    fireEvent.change(editor, { target: { value: '# 开端\n\n任何结构都可以。' } })
    expect(onContentChange).toHaveBeenCalledWith({ kind: 'outline', level: 'book', body: '# 开端\n\n任何结构都可以。' })
    Object.defineProperties(editor, {
      selectionStart: { configurable: true, value: 6 },
      selectionEnd: { configurable: true, value: 8 },
    })
    fireEvent.select(editor)
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: 'text-range', startUtf16: 6, endUtf16: 8 })
    onSelectionChange.mockClear()
    fireEvent.keyUp(editor, { key: 'ArrowRight' })
    expect(onSelectionChange).toHaveBeenCalledWith({ kind: 'text-range', startUtf16: 6, endUtf16: 8 })
    fireEvent.change(view.getByRole('textbox', { name: zh.outlineTitle }), { target: { value: '新总纲' } })
    expect(onTitleChange).toHaveBeenCalledWith('新总纲')
  })

  it('renders exact freeform Diff and a chapter-outline editor', () => {
    const outline = createPlanningOutlineRenderer(t)
    const diff = render(outline.renderDiff(
      { kind: 'outline', level: 'book', body: '旧情节' },
      [{
        kind: 'replace-text',
        selector: { kind: 'text-range', startUtf16: 0, endUtf16: 1, quoteHash: `sha256:${'a'.repeat(64)}` },
        replacement: '新',
      }],
    ))
    expect(diff.getByLabelText(zh.before).textContent).toBe('旧')
    expect(diff.getByLabelText(zh.after).textContent).toBe('新')

    const chapter = createChapterOutlineRenderer(t)
    const chapterView = render(chapter.renderEditor({
      document: {} as never,
      title: '第一章章纲',
      content: { kind: 'chapter-outline', body: '自由章纲' },
      ariaLabel: '第一章章纲',
      onContentChange: vi.fn(),
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    const chapterEditor = chapterView.container.querySelector('textarea')
    expect(chapterEditor?.value).toBe('自由章纲')
  })

  it('edits book guidance with distinct freeform renderers', () => {
    const onBriefChange = vi.fn()
    const brief = render(createBookBriefRenderer(t).renderEditor({
      document: {} as never,
      title: '本书概述',
      content: { kind: 'book-brief', body: '旧概述' },
      ariaLabel: '本书概述',
      onContentChange: onBriefChange,
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    const briefEditor = brief.getByPlaceholderText(zh.bookBriefPlaceholder)
    fireEvent.change(briefEditor, { target: { value: '新概述' } })
    expect(onBriefChange).toHaveBeenCalledWith({ kind: 'book-brief', body: '新概述' })

    const style = render(createBookStyleProfileRenderer(t).renderEditor({
      document: {} as never,
      title: '本书风格',
      content: { kind: 'book-style-profile', body: '克制、具体。' },
      ariaLabel: '本书风格',
      onContentChange: vi.fn(),
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    expect(style.getByPlaceholderText(zh.bookStyleProfilePlaceholder)).toBeTruthy()
  })
})
