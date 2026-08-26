# @deepseek-ai/dsh-experimental-novel-repository-remote

English | [中文](README.zh.md)

## Purpose

This experimental Host Consumer exposes Novel Project discovery plus bounded typed-Asset catalog, search, creation, read, guarded-save, selection, context-workset, and review methods without adding transport behavior to the provider-neutral Repository Service Definition.

## Behavior

- `NovelRepositoryRemote` registers under Host service key `novelRepositoryRemote`, consumes `ctx.novelRepository`, `ctx.fs`, and `ctx.sandboxPolicy`, and exports the wire namespace `novelRepository`.
- `novelRepository/discover` resolves the addressed Agent Session's working directory, delegates validation to the active Novel Repository provider, and returns `undefined` only when the provider finds no `novel.yaml`.
- `novelRepository/initialize` uses that same exact Session root and sandbox policy to initialize an absent project. It returns an already discovered project unchanged and delegates create-only conflict checks to the Repository provider.
- `NovelProjectDescriptor` contains the stable project id, schema, title, and display paths. It never exposes filesystem target keys or mutable provider objects to the browser.
- `assets`, `createAsset`, `asset`, and `saveAsset` project only browser-safe ids, semantic parent ids, metadata, and lossless JSON Asset content. Browser creation supplies type/title/parent/content while the Repository owns identity and path. `captureSelection` carries a type-defined JSON selector and returns a readable Markdown mention containing the canonical `dsh-novel:` reference.
- `search` delegates bounded lexical discovery to the active Repository provider and returns browser-safe excerpts plus exact current Revision identities. Results remain discovery data until the user pins one or sends an explicit reference.
- `replaceContextWorkset` delegates one whole-value version-two follow/pinned workset to the optional Novel context capability. A follow entry carries active Asset identity and resolves its current saved head when context compiles; a pin keeps an exact retained Revision. The context Consumer validates the value and records the Session event; the Remote owns neither the fold nor model injection.
- Asset types, content, selectors, and operations cross Remote as a bounded JSON envelope. Host and Client registries own their exact semantics, so adding a type does not require widening the generated Remote method list; incompatible or non-JSON values fail explicitly.
- `changeSet`, `applyChangeSet`, and `rejectChangeSet` expose browser review. Apply and reject pass the addressed Agent Session id as explicit authorization and return the durable terminal or conflict state.
- `revisions` returns immutable history summaries and `asset` can open one retained Revision. `analysisReports`, `scanNoAi`, and `reviewChapter` are exact-Revision endpoints; deterministic scan and Subagent orchestration remain owned by `ctx.novelAnalysis`, not by transport.
- `revisionFinalizations` and `preferenceCandidates` expose browser-safe exact-Revision history. `finalizeChapter`, `acceptPreference`, and `rejectPreference` delegate the explicit user workflow to `ctx.novelAnalysis`; no model tool receives finalization authority.
- Catalog, creation, current-head reads, saves, and applies resolve the addressed Agent Session's sandbox policy and forward it through repository reconciliation. This keeps an external Session workspace writable without widening the deployment fallback root.
- `responseMaxBytes`, defaulting to 8 MiB, bounds every complete non-discovery JSON response; over-budget responses fail rather than truncate or silently omit data.
- The existing Gateway identity policy resolves the addressed Agent; this package adds no authorization mechanism. `descriptorMaxBytes` limits the complete descriptor JSON encoded as UTF-8, defaults to 256 KiB, and cannot exceed the runtime's maximum string length.
- The generated `./remote` contribution is browser-safe and is mounted by the separate `@deepseek-ai/dsh-experimental-novel-repository-client` package; this Host package never enters the Client compiler aggregate.
- The Host service has its own Cordis key so installing transport does not replace the `novelRepository` provider. The distinct wire namespace preserves the browser-facing `ctx.remote.novelRepository` API.

## Model Experience

### Project discovery Remote

#### What the model sees

Nothing from `novelRepository/discover` is added to model context. The endpoint serves browser plugins and registers no prompt contribution or model-facing tool.

#### Token effect

The Remote descriptor and browser result add no prompt or tool-schema tokens.

#### KV Cache effect

The package does not change message ordering or reusable KV-cache prefixes.

## Known Limitations and Deferred Work

- **No proposal endpoint** — model proposals enter through the separate Novel tool; the browser Remote can only read, accept, or reject an existing ChangeSet.
- **No workbench UI** — this package publishes a typed browser API but renders no explorer, editor, Context Tray, or review card.
- **No Session Log ownership** — the separate Novel context Consumer owns durable model context; browser discovery responses never enter the Session Log by themselves.
- **Analysis transport only** — the Remote exposes report commands but does not interpret report payloads, run a model, or apply any suggested edit.
- **Explicit composition required** — the Host service does not belong in the default Web profile; Novel Studio assembly must install it with a repository provider and the separate Client adapter.
