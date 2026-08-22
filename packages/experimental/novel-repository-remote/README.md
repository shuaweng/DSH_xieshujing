# @deepseek-ai/dsh-experimental-novel-repository-remote

English | [中文](README.zh.md)

## Purpose

This experimental Host Consumer exposes Novel Project discovery plus bounded browser catalog, chapter, guarded-save, and selection methods without adding transport behavior to the provider-neutral `ctx.novelRepository` Service Definition. The Host service and generated browser contract remain opt-in parts of Novel Studio.

## Behavior

- `NovelRepositoryRemote` registers under Host service key `novelRepositoryRemote`, consumes `ctx.novelRepository` and `ctx.fs`, and exports the wire namespace `novelRepository`.
- `novelRepository/discover` resolves the addressed Agent Session's working directory, delegates validation to the active Novel Repository provider, and returns `undefined` only when the provider finds no `novel.yaml`.
- `NovelProjectDescriptor` contains the stable project id, schema, title, and display paths. It never exposes filesystem target keys or mutable provider objects to the browser.
- `assets`, `asset`, `saveChapter`, and `captureSelection` project only browser-safe ids, metadata, chapter body text, and frozen selection values. Exact serialized file bytes, `FsTarget`, `FsVersion`, SQLite handles, and mutable provider objects remain Host-only.
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

- **No ChangeSet methods yet** — proposal, review, apply, reject, and recovery arrive with the next slice.
- **No workbench UI** — this package publishes a typed browser contract but renders no explorer, editor, context tray, or error state.
- **No Session Log or model-context integration** — discovery uses the Agent Session selected by existing Gateway identity policy, but its result does not enter the Session Log or model context; a future context Consumer must own that durable projection.
- **Explicit composition required** — the Host service does not belong in the default Web profile; Novel Studio assembly must install it with a repository provider and the separate Client adapter.
