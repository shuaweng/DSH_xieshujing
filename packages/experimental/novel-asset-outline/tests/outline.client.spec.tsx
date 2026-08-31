// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  createBookBriefRenderer,
  createBookStoryStateRenderer,
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
      readOnly: false,
      onContentChange,
      onTitleChange,
      onSelectionChange,
    }))
    expect(view.getByRole('heading', { name: '开端' })).toBeTruthy()
    expect(view.queryByText('# 开端')).toBeNull()
    fireEvent.click(view.getByRole('button', { name: zh.editMarkdown }))
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
      }, { kind: 'update-title', title: '新总纲' }],
      '旧大纲',
    ))
    expect(diff.getAllByLabelText(zh.before).map(node => node.textContent)).toEqual(['旧大纲', '旧'])
    expect(diff.getAllByLabelText(zh.after).map(node => node.textContent)).toEqual(['新总纲', '新'])

    const chapter = createChapterOutlineRenderer(t)
    const chapterView = render(chapter.renderEditor({
      document: {} as never,
      title: '第一章章纲',
      content: { kind: 'chapter-outline', body: '自由章纲' },
      ariaLabel: '第一章章纲',
      readOnly: false,
      onContentChange: vi.fn(),
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    fireEvent.click(chapterView.getByRole('button', { name: zh.editMarkdown }))
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
      readOnly: false,
      onContentChange: onBriefChange,
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    expect(brief.getByLabelText(zh.markdownPreview).textContent).toContain('旧概述')
    fireEvent.click(brief.getByRole('button', { name: zh.editMarkdown }))
    const briefEditor = brief.getByPlaceholderText(zh.bookBriefPlaceholder)
    fireEvent.change(briefEditor, { target: { value: '新概述' } })
    expect(onBriefChange).toHaveBeenCalledWith({ kind: 'book-brief', body: '新概述' })

    const style = render(createBookStyleProfileRenderer(t).renderEditor({
      document: {} as never,
      title: '本书风格',
      content: { kind: 'book-style-profile', body: '克制、具体。' },
      ariaLabel: '本书风格',
      readOnly: false,
      onContentChange: vi.fn(),
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    fireEvent.click(style.getByRole('button', { name: zh.editMarkdown }))
    expect(style.getByPlaceholderText(zh.bookStyleProfilePlaceholder)).toBeTruthy()

    const storyState = render(createBookStoryStateRenderer(t).renderEditor({
      document: {} as never,
      title: '故事状态',
      content: { kind: 'book-story-state', body: '# 当前事实\n\n林澈已抵达白港。' },
      ariaLabel: '故事状态',
      readOnly: false,
      onContentChange: vi.fn(),
      onTitleChange: vi.fn(),
      onSelectionChange: vi.fn(),
    }))
    expect(storyState.getByLabelText(zh.markdownPreview).textContent).toContain('林澈已抵达白港')
    fireEvent.click(storyState.getByRole('button', { name: zh.editMarkdown }))
    expect(storyState.getByPlaceholderText(zh.bookStoryStatePlaceholder)).toBeTruthy()
  })
})
