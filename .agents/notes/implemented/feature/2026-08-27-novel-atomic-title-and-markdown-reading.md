# Agent Note: Atomic Novel title changes and Markdown reading views

Status: implemented

English | [中文](2026-08-27-novel-atomic-title-and-markdown-reading.zh.md)

## Problem

Novel Assets store an author-visible title in typed Frontmatter and authored prose or planning text in the body. The original proposal operations changed only body text. An Agent could therefore fill an empty chapter but leave it named “Untitled Chapter”, and a later title-only proposal would be based on an already-stale Revision. Freeform guidance Assets also exposed their Markdown source as the only view, so headings, lists, and emphasis appeared as punctuation during ordinary reading.

## Decision

The shared Novel operation vocabulary includes `update-title`, validated and materialized by the registered Asset type rather than by the generic Repository. Shipped manuscript and freeform Markdown types accept at most one title operation and at most one body operation in one exact-Revision ChangeSet. A manuscript body operation is `insert-text` or `replace-text`; a freeform planning or book-guidance body operation is `replace-text`. The pair is serialized and published once, so a newly named chapter and its prose become one Revision or neither change is applied.

`update-title` changes only the author-visible title field owned by the type. It cannot patch arbitrary Frontmatter, identity, parentage, type, or derived metadata. Existing exact-Revision conflict, review, apply, and recovery behavior therefore remains unchanged.

Freeform Markdown Assets keep their Markdown source as the sole authored truth. The client defaults existing content to a rendered reading projection and provides an explicit Edit/Read toggle. Edit mode exposes the unchanged source and uses the existing guarded complete-content save; reading mode does not create or persist a second representation.

The Novel Workbench prompt and chapter-execution Skill instruct the Agent to combine `update-title` with the appropriate body operation when naming and filling an existing untitled chapter. Direct creation still accepts title and complete body in one `novel_create` call.

## Alternatives considered

**Put the chapter heading inside the body.** Rejected because explorer labels, references, search metadata, and the workbench header use the typed Asset title, not the first Markdown heading.

**Create separate title and body ChangeSets.** Rejected because applying the first creates a new Revision and makes the second stale; forcing an automatic rebase would weaken the exact-Revision guarantee.

**Add a generic metadata patch operation.** Rejected because it would let model input bypass type-owned identity, hierarchy, and Frontmatter rules.

**Persist rendered HTML beside Markdown.** Rejected because it creates two authored representations that can diverge. Rendering remains a client projection of retained Markdown source.

## Consequences

An Agent can name and write an existing empty chapter through one reviewable proposal, and the Diff card shows both changes. Authors retain the same title and body editing behavior. Book briefs, style profiles, outlines, and chapter outlines read like formatted documents by default while preserving unrestricted Markdown editing and the existing file format.
