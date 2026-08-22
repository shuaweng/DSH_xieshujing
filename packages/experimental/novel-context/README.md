# @deepseek-ai/dsh-experimental-novel-context

English | [中文](README.zh.md)

## Purpose

This experimental Host Consumer turns canonical, Revision-bound Novel references into exact model-visible context that DSH can reconstruct from the Session log.

## Behavior

- `dsh-novel:` URIs carry one project, asset, retained Revision, optional UTF-16 text selector, and display label; `formatNovelReferenceMention()` wraps the URI in a readable Markdown mention for Composer drafts.
- `NovelContextResolver` intercepts direct user messages at `agent/pre-step`, removes only recognized canonical mentions from the readable message, resolves exact retained Revisions, and appends one immutable `user/message` with source kind `novel-context` immediately after it.
- Referenced prose is serialized as deterministic JSON inside an explicit untrusted-material frame. A reference never grants instructions, permissions, or tool authority.
- One request may contain at most eight references and 256 KiB of resolved UTF-8 text by default. Both positive-integer limits are configurable, duplicate references are folded, and overflow fails before the model request.
- A text selector is valid only when its UTF-16 boundaries do not split a surrogate pair and its quote hash matches the exact retained Revision. The resolver never falls back to the current file.
- The first durable Novel context message binds the Session to one Project; later Novel context for another Project fails explicitly.

## Model Experience

### Frozen Novel context

#### What the model sees

The model sees the user's readable message followed by one `Referenced novel material` message containing exact Revision metadata and safely serialized authored text. The context message is visible in Session replay through its `novel-context` source.

#### Token effect

Only explicitly referenced text is added. The fixed safety frame and JSON metadata add a small overhead; configured reference and byte limits cap the variable portion.

#### KV Cache effect

The package does not change the system prompt or tool catalog. A different referenced Revision changes the user-message suffix for that request but leaves earlier reusable prefixes intact.

## Known Limitations and Deferred Work

- **Explicit references only** — automatic retrieval, pinned working sets, semantic search, and relevance ranking are deferred.
- **One Project per Session** — cross-project context and Series-level shared assets are not supported.
- **UTF-16 range selectors** — persistent block ids, fuzzy relocation, and three-way selection repair are deferred.
- **Full retained text** — the resolver does not summarize or compact referenced assets; callers must stay within the configured budget.
