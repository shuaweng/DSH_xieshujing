---
description: "Frozen, task-specific Novel Context Manifests that compile exact Asset Revisions for model requests and replay."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-novel-context

English | [中文](README.zh.md)

## Summary

This experimental Host Consumer turns canonical Novel references and explicit task policies into bounded, exact model-visible context that DSH can reconstruct from the Session log.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="behavior"></a>
## Behavior

- `dsh-novel:` URIs carry one project, asset, retained Revision, optional type-defined JSON selector, and display label; `formatNovelReferenceMention()` wraps the URI in a readable Markdown mention for Composer drafts.
- `NovelContextResolver` intercepts direct user messages at `agent/pre-step`, removes only recognized canonical mentions from the readable message, and appends one immutable `user/message` with source kind `novel-context` immediately after it.
- `compile()` accepts a closed task policy and exact targets. Policies cover direct turns, chapter writing, selection rewrite/review, outline editing, chapter review, preference learning, and Story State extraction. Policy is selected by an explicit workflow or `novelContextPolicy` Skill metadata, never guessed from user prose.
- Policies expand only deterministic typed relations: chapter writing/review can include its Chapter Outline, Book Brief, Book Style Profile, and confirmed Story State while retaining the root Book Outline as a coordinate. Selection rewrite/review includes style and Story State. Project-global guidance is not always-on context.
- `replaceWorkset()` retains a version-two whole value for the active Agent. Its single `follow` item stores only active Asset identity and resolves the current head at compile time; `pinned` items retain exact Revisions and optional selectors. The value may alternatively carry one bounded `library-home` surface snapshot containing only visible library metadata; it grants no repository or cross-project read capability. Legacy version-one values from older browser clients normalize on replacement.
- The browser restores this live coordination value from Session-scoped local storage and republishes it after reconnect. It is deliberately not a custom Session event, so uninstalling the plugin cannot make an ordinary DSH Session log unreadable. The model-visible authority remains the version-three Context Manifest frozen into the standard Session message log.
- Direct turns materialize explicit Composer references while follow/pinned workset items remain coordinates. An explicit `/skill-name` turn compiles the Skill policy immediately; after the model loads a Skill, the next step adds related material without copying text already materialized in the prior Manifest.
- The compiler deduplicates identical exact coordinates while preserving distinct selections; required material for an Asset/Revision also prevents a lower-priority optional copy from broadening it. It caps references at eight and budgets 256 KiB of authored UTF-8 text by default. Required targets fail closed on overflow; optional materials degrade to coordinates rather than being truncated.
- Every V3 Manifest records policy, exact Revision, type, origin, retention mode, projection, selection reason, content hash, model-text size, and model-text hash under one deterministic Manifest id.
- The resolver asks the target Asset's registered Host definition to validate and project its selector. The shipped text selector rejects surrogate-pair splits and quote drift; no selector ever falls back to the current file.
- The first durable Novel context message binds the Session to one Project; later Novel context for another Project fails explicitly.

<a id="model-experience"></a>
## Model Experience

### Frozen Novel context

#### What the model sees

The model sees the user's readable message followed by a `NovelContextManifestSourceV3` frame containing canonical exact-Revision coordinates and only the material selected by the active task policy. On the library homepage, the frame instead includes the bounded visible library summary while preserving the Session's one-Project binding; it never opens another Book's Assets. Ordinary direct turns remain lean. Skill and fixed-workflow requests can add chapter outline, brief, style, confirmed Story State, or outline relations with an explicit reason and projection. Session replay reconstructs the same exact context cut.

#### Token effect

Coordinates and the library-home surface add only bounded metadata. Materialized target and related text are the variable portions governed by the configured byte limit; optional text becomes a coordinate when the budget is exhausted.

#### KV Cache effect

The package does not change the system prompt or tool catalog. A different referenced Revision changes the user-message suffix for that request but leaves earlier reusable prefixes intact.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Deterministic typed relations only** — semantic ranking, embeddings, generated summaries, and hidden intent classification are deferred. Story State is included only as exact authored text under explicit chapter policies.
- **One Project per Session** — cross-project context and Series-level shared assets are not supported.
- **UTF-16 range selectors** — persistent block ids, fuzzy relocation, and three-way selection repair are deferred.
- **Materialized text is verbatim** — the compiler does not summarize or compact a selected projection. Later implementations may add policy-owned summaries or model-specific token budgets behind the same explicit compile and V3 Manifest seam.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
