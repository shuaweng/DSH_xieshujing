# @deepseek-ai/dsh-experimental-novel-context

English | [中文](README.zh.md)

## Purpose

This experimental Host Consumer turns canonical Novel references and explicit task policies into bounded, exact model-visible context that DSH can reconstruct from the Session log.

## Behavior

- `dsh-novel:` URIs carry one project, asset, retained Revision, optional type-defined JSON selector, and display label; `formatNovelReferenceMention()` wraps the URI in a readable Markdown mention for Composer drafts.
- `NovelContextResolver` intercepts direct user messages at `agent/pre-step`, removes only recognized canonical mentions from the readable message, and appends one immutable `user/message` with source kind `novel-context` immediately after it.
- `compile()` accepts a closed task policy and exact targets. Version one policies cover direct turns, chapter writing, selection rewrite/review, outline editing, chapter review, and preference learning. Policy is selected by an explicit workflow or `novelContextPolicy` Skill metadata, never guessed from user prose.
- Policies expand only deterministic typed relations: for example, chapter writing/review can include its chapter outline, Book Brief, and Book Style Profile while retaining the root Book Outline as a coordinate. Project-global guidance is not always-on context.
- `replaceWorkset()` records a version-two whole value. Its single `follow` item stores only active Asset identity and resolves the current head at compile time; `pinned` items retain exact Revisions and optional selectors. Legacy version-one events replay and normalize on replacement.
- A client-visible `novelContextWorkset` Session Projection folds the latest whole value. It is coordination state only; the model-visible authority is the version-three Context Manifest frozen into the Session Log.
- Direct turns materialize explicit Composer references while follow/pinned workset items remain coordinates. An explicit `/skill-name` turn compiles the Skill policy immediately; after the model loads a Skill, the next step adds related material without copying text already materialized in the prior Manifest.
- The compiler deduplicates identical exact coordinates while preserving distinct selections; required material for an Asset/Revision also prevents a lower-priority optional copy from broadening it. It caps references at eight and budgets 256 KiB of authored UTF-8 text by default. Required targets fail closed on overflow; optional materials degrade to coordinates rather than being truncated.
- Every V3 Manifest records policy, exact Revision, type, origin, retention mode, projection, selection reason, content hash, model-text size, and model-text hash under one deterministic Manifest id.
- The resolver asks the target Asset's registered Host definition to validate and project its selector. The shipped text selector rejects surrogate-pair splits and quote drift; no selector ever falls back to the current file.
- The first durable Novel context message binds the Session to one Project; later Novel context for another Project fails explicitly.

## Model Experience

### Frozen Novel context

#### What the model sees

The model sees the user's readable message followed by a `NovelContextManifestSourceV3` frame containing canonical exact-Revision coordinates and only the material selected by the active task policy. Ordinary direct turns remain lean. Skill and fixed-workflow requests can add chapter outline, brief, style, or outline relations with an explicit reason and projection. Session replay reconstructs the same exact context cut.

#### Token effect

Coordinates add only bounded metadata. Materialized target and related text are the variable portions governed by the configured byte limit; optional text becomes a coordinate when the budget is exhausted.

#### KV Cache effect

The package does not change the system prompt or tool catalog. A different referenced Revision changes the user-message suffix for that request but leaves earlier reusable prefixes intact.

## Known Limitations and Deferred Work

- **Deterministic typed relations only** — semantic ranking, embeddings, generated summaries, Story State, and hidden intent classification are deferred.
- **One Project per Session** — cross-project context and Series-level shared assets are not supported.
- **UTF-16 range selectors** — persistent block ids, fuzzy relocation, and three-way selection repair are deferred.
- **Materialized text is verbatim** — the compiler does not summarize or compact a selected projection. Later implementations may add policy-owned summaries or model-specific token budgets behind the same explicit compile and V3 Manifest seam.
