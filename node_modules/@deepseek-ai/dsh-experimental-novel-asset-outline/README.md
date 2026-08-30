# @deepseek-ai/dsh-experimental-novel-asset-outline

English | [中文](README.zh.md)

## Purpose

This experimental Asset-type package contributes freeform planning and project-guidance surfaces to the Novel workbench. It deliberately separates semantic identity and hierarchy from writing method: the repository enforces only Book Outline → Volume Outline, Chapter → Chapter Outline, and project-singleton guidance cardinality, while authors and Agents may choose any Markdown structure inside each body.

## Behavior

- `planning.outline` is a UTF-8 Markdown Asset under the declared `planning` root. Frontmatter owns schema, stable id, type, title, and `level: book | volume`; the Markdown body is otherwise freeform.
- A Book Outline has no parent. A Volume Outline requires `novel.parent` pointing to a Book Outline. Further nesting, cross-type parents, missing parents, and cycles fail closed.
- `planning.chapter-outline` is freeform Markdown with `novel.parent` pointing to exactly one `manuscript.chapter`. A chapter may have at most one Chapter Outline.
- `book.brief`, `book.style-profile`, and `book.story-state` are parentless, freeform Markdown Assets stored under the declared `planning` root. Each exact type is a project singleton. The brief carries premise and canon boundaries; the style profile carries prose and serial-rhythm guidance; Story State carries only current reality confirmed by finalized prose.
- Emotion targets, key scenes, hook distribution, a 15/35/35/15 rhythm, and four-beat structure are optional guidance exposed by the workbench. They are never persistence fields and never validation requirements.
- Human saves can edit title and complete body. A frozen selection uses the shared exact UTF-16 text-range selector and binds its quote hash to one retained Revision.
- All five types accept one exact `replace-text` operation and may combine it with one `update-title` in the same ChangeSet. The registered definition verifies the title, offsets, and quote hash before one atomic materialization and preserves identity, parent, and unrelated Frontmatter.
- The Client contribution defaults existing content to a rendered Markdown reading view and switches explicitly to the unconstrained source editor. The reading view is only a projection of the retained source. It presents exact text and title Diffs; the shared explorer supplies a Book group for the three singleton Assets and two-level outline navigation, while the manuscript canvas supplies the chapter-local drawer.

```markdown
---
novel:
  schema: 1
  id: outline-main
  type: planning.outline
  title: 全书大纲
  level: book
---

# 作者喜欢的任何结构

可以写散文、列表、标题、表格，或者作者自己的方法。
```

```markdown
---
novel:
  schema: 1
  id: volume-one
  type: planning.outline
  title: 第一卷卷纲
  level: volume
  parent: outline-main
---

本卷逐步升级白港谜案，最终以灯塔熄灭收束。
```

```markdown
---
novel:
  schema: 1
  id: chapter-one-plan
  type: planning.chapter-outline
  title: 第一章章纲
  parent: chapter-one
---

本章只写雨夜抵达，以无人应答的敲门声收尾。
```

```markdown
---
novel:
  schema: 1
  id: book-style
  type: book.style-profile
  title: 本书风格
---

# 叙事声音

克制、具体，先写动作与后果，再补当前场景必需的解释。
```

```markdown
---
novel:
  schema: 1
  id: book-story-state
  type: book.story-state
  title: Story State
---

# Confirmed facts

- <one fact confirmed by the finalized manuscript>
```

## Model Experience

### Freeform planning context and operations

#### What the model sees

`novel_list` exposes all creation contracts and canonical exact-Revision references. `novel_create` can create a Book Outline, Volume Outline, chapter-bound Chapter Outline, or a missing singleton Asset. `novel_get` returns the exact freeform body, and `novel_propose_changes` creates a reviewable exact text replacement without applying it. Relevant workflows read the current brief, style, or confirmed Story State only under matching explicit policies; none is hidden always-on prompt content.

#### Token effect

Installing these types adds no new type-specific tool schema. The stable Novel tools add type creation and proposal instructions to catalog/read results; authored body tokens appear only when listed references are read or injected.

#### KV Cache effect

Switching between Book, Volume, and Chapter Outline surfaces does not change the tool catalog or system-prompt prefix. Only request-local Asset references and bodies change.

## Known Limitations and Deferred Work

- **Markdown source editing** — the reading view renders standard Markdown, while rich source decoration, blocks, comments, and templates managed as reusable Assets are deferred.
- **Single exact replacement** — multi-range proposals, automatic rebase, and structural merge are deferred.
- **Two outline levels only** — nested acts or custom hierarchy levels should be expressed inside freeform Markdown until an evidence-backed semantic need appears.
- **One Chapter Outline per chapter** — alternatives and branch plans are deferred.
- **Only reviewed finalized-preference learning** — an accepted draft/final candidate is appended to `book.style-profile` through a ChangeSet. Automatic promotion, deduplication across many finalizations, and preference retrieval are deferred.
- **Only reviewed Story State promotion** — a finalized chapter can produce one complete replacement candidate for `book.story-state`; the author must accept it, and stale target Revisions conflict.
- **Lexical discovery only** — planning and guidance Assets participate in provider-neutral title/model-text search; semantic and relation-scoped search are deferred.
