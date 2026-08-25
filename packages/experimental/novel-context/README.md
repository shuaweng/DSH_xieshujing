# @deepseek-ai/dsh-experimental-novel-context

English | [中文](README.zh.md)

## Purpose

This experimental Host Consumer turns canonical, Revision-bound Novel references into exact model-visible context that DSH can reconstruct from the Session log.

## Behavior

- `dsh-novel:` URIs carry one project, asset, retained Revision, optional type-defined JSON selector, and display label; `formatNovelReferenceMention()` wraps the URI in a readable Markdown mention for Composer drafts.
- `NovelContextResolver` intercepts direct user messages at `agent/pre-step`, removes only recognized canonical mentions from the readable message, resolves exact retained Revisions, and appends one immutable `user/message` with source kind `novel-context` immediately after it.
- `replaceWorkset()` records the complete current follow/pinned reference set as a versioned `novel/context-workset` Session event. At most one item follows the active saved Asset; searched Assets can be pinned. Replacing an unchanged value appends no event.
- A client-visible `novelContextWorkset` Session Projection folds the latest whole value. The browser uses it only to disclose and edit the next-turn workset; the model-visible authority is the version-two Context Manifest frozen into the Session Log.
- Every item serializes a canonical exact-Revision `dsh-novel:` coordinate. Follow/pinned workset items are coordinate-only and can be fetched with `novel_get`; an explicit Composer reference embeds its exact selected text (or explicit whole-Asset projection) inside the untrusted-material frame.
- On a direct user turn, explicit Composer references are ordered before the retained workset, exact duplicates are folded, and one Manifest records each exact Revision plus its `explicit`, `follow`, or `pinned` mode and origin. Tool-continuation steps do not inject the workset again.
- One request may contain at most eight references and 256 KiB of resolved UTF-8 text by default. Both positive-integer limits are configurable, duplicate references are folded, and overflow fails before the model request.
- The resolver asks the target Asset's registered Host definition to validate and project its selector. The shipped text selector rejects surrogate-pair splits and quote drift; no selector ever falls back to the current file.
- The first durable Novel context message binds the Session to one Project; later Novel context for another Project fails explicitly.

## Model Experience

### Frozen Novel context

#### What the model sees

The model sees the user's readable message followed by one manifest containing canonical exact-Revision coordinates. Only explicit references carry authored text; the automatically followed current Asset and searched pins remain coordinates. Its version-two `novel-context` source carries a deterministic Manifest id, origin, and retention mode, so Session replay reconstructs the same context cut.

#### Token effect

Coordinates for the visible workset add only bounded metadata. Explicit referenced text is the variable portion governed by the configured byte limit.

#### KV Cache effect

The package does not change the system prompt or tool catalog. A different referenced Revision changes the user-message suffix for that request but leaves earlier reusable prefixes intact.

## Known Limitations and Deferred Work

- **Author-controlled retrieval only** — search results enter context only after an author or Agent chooses an exact result; automatic retrieval, semantic ranking, and hidden context injection are deferred.
- **One Project per Session** — cross-project context and Series-level shared assets are not supported.
- **UTF-16 range selectors** — persistent block ids, fuzzy relocation, and three-way selection repair are deferred.
- **Explicit text is verbatim** — the resolver does not summarize or compact an explicit selection or whole-Asset reference; callers must stay within the configured budget.
