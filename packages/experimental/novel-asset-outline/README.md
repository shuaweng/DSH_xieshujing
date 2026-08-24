# @deepseek-ai/dsh-experimental-novel-asset-outline

English | [中文](README.zh.md)

## Purpose

This experimental Asset-type package contributes freeform planning surfaces to the Novel workbench. It deliberately separates semantic identity and hierarchy from writing method: the repository enforces only Book Outline → Volume Outline and Chapter → Chapter Outline relationships, while authors and Agents may choose any Markdown structure inside each body.

## Behavior

- `planning.outline` is a UTF-8 Markdown Asset under the declared `planning` root. Frontmatter owns schema, stable id, type, title, and `level: book | volume`; the Markdown body is otherwise freeform.
- A Book Outline has no parent. A Volume Outline requires `novel.parent` pointing to a Book Outline. Further nesting, cross-type parents, missing parents, and cycles fail closed.
- `planning.chapter-outline` is freeform Markdown with `novel.parent` pointing to exactly one `manuscript.chapter`. A chapter may have at most one Chapter Outline.
- Emotion targets, key scenes, hook distribution, a 15/35/35/15 rhythm, and four-beat structure are optional guidance exposed by the workbench. They are never persistence fields and never validation requirements.
- Human saves can edit title and complete body. A frozen selection uses the shared exact UTF-16 text-range selector and binds its quote hash to one retained Revision.
- Both types accept one exact `replace-text` operation per ChangeSet. The registered definition verifies offsets and quote hash before materialization and preserves identity, parent, and unrelated Frontmatter.
- The Client contribution renders both types as unconstrained writing surfaces and presents exact text Diffs. The shared explorer supplies the two-level outline navigation; the manuscript canvas supplies the chapter-local drawer.

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

## Model Experience

### Freeform planning context and operations

#### What the model sees

`novel_list` exposes both creation contracts and canonical exact-Revision references. `novel_create` can create a Book Outline, Volume Outline, or chapter-bound Chapter Outline. `novel_get` returns the exact freeform body, and `novel_propose_changes` creates a reviewable exact text replacement without applying it.

#### Token effect

Installing these types adds no new type-specific tool schema. The stable Novel tools add type creation and proposal instructions to catalog/read results; authored body tokens appear only when listed references are read or injected.

#### KV Cache effect

Switching between Book, Volume, and Chapter Outline surfaces does not change the tool catalog or system-prompt prefix. Only request-local Asset references and bodies change.

## Known Limitations and Deferred Work

- **Plain Markdown editing** — rich Markdown decoration, blocks, comments, and templates managed as reusable Assets are deferred.
- **Single exact replacement** — multi-range proposals, automatic rebase, and structural merge are deferred.
- **Two outline levels only** — nested acts or custom hierarchy levels should be expressed inside freeform Markdown until an evidence-backed semantic need appears.
- **One Chapter Outline per chapter** — alternatives and branch plans are deferred.
- **No search index** — planning Assets are discoverable by catalog and exact reference; full-text and relation search are deferred.
