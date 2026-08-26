# @deepseek-ai/dsh-experimental-novel-repository

English | [中文](README.zh.md)

## Purpose

This experimental package defines the provider-neutral `ctx.novelRepository` capability seam, the effect-scoped `ctx.novelAssetTypes` registry, and version-one Novel Project types. It gives Host consumers stable Project, Asset, Revision, and Selection identities without treating a filesystem path, Session, browser state, or transport request as that identity.

## Behavior

- `NovelRepository.discoverProject()` accepts one canonical filesystem directory target and returns `undefined` only when that directory has no `novel.yaml`.
- `initializeProject()` creates the default content-root directories before publishing `novel.yaml` as the final activation marker. It rejects blank titles, an existing manifest, and non-directory root conflicts rather than modifying an existing or malformed project.
- A discovered `NovelProjectSnapshot` contains schema `1`, the stable `ProjectId`, author-visible title, canonical project and manifest targets, and canonical named content-root targets.
- `listAssets()` reconciles authored files into current catalog rows, `searchAssets()` discovers bounded current exact Revisions through a provider-owned search strategy, `createAsset()` creates one registered type at a provider-owned path, `readAsset()` reads the current or one retained immutable Revision, `listAssetRevisions()` exposes bounded Revision history, `saveAssetContent()` performs a guarded typed-content save, and `captureSelection()` freezes one type-defined semantic selection.
- `NovelAssetTypeMap` is merge-extensible. Each matching Host definition owns creation instructions, optional semantic-parent rules or project-singleton cardinality, exact authored-type parsing/creation, model projection, selection validation, save materialization, durable operation decoding, and ChangeSet materialization; registrations are unique and disappear with their caller effect.
- Version one ships `manuscript.chapter` plus separately contributed freeform `planning.outline`, `planning.chapter-outline`, `book.brief`, and `book.style-profile` types, exact `sha256:` content hashes, immutable Revision ancestry, Revision-bound `SelectionRef` values, typed `replace-text` operations, and durable single-asset ChangeSets carrying their target Asset type.
- `proposeChangeSet()` records a proposal without changing authored files. `readChangeSet()`, `applyChangeSet()`, and `rejectChangeSet()` expose explicit review transitions; apply authority is a Session id supplied by an authorized Consumer.
- `NovelAnalysisReport` is bound to one Project, Asset, exact Revision, and kind. Providers expose list and upsert operations so successful reruns replace one kind for one Revision while failed analysis cannot erase an earlier report; the analysis Consumer owns each report payload's semantics.
- `RevisionFinalization` retains an explicit user decision for one exact chapter Revision and its nearest Agent-authored ancestor. `NovelPreferenceCandidate` retains bounded draft/final evidence and stays inert until an explicit accept or reject decision; the analysis Consumer owns extraction and reviewed application semantics.
- Operations that may publish files or recover an interrupted apply accept an optional per-call sandbox policy. Session-aware Consumers must pass the addressed Session's resolved policy so a Project outside the Host process working directory remains writable only within that Session workspace.
- Providers report invalid roots, malformed or oversized manifests, unsupported schemas, and path escapes through stable `NovelRepositoryError` codes rather than guessing a repair.
- This package owns only the Service Definition, provider-neutral public values, and error vocabulary. A provider such as `@deepseek-ai/dsh-experimental-novel-repository-local` owns manifest I/O and validation; a separate Consumer owns any Remote or UI projection.

## Model Experience

### Project discovery service

#### What the model sees

Nothing from `ctx.novelRepository` is added to model context; it registers neither a prompt contribution nor a model-facing tool.

#### Token effect

The service definition and project values add no prompt or tool-schema tokens.

#### KV Cache effect

The package does not change message ordering or reusable KV-cache prefixes.

## Known Limitations and Deferred Work

- **Five shipped asset types** — the kernel installs `manuscript.chapter`; the planning package contributes `planning.outline`, `planning.chapter-outline`, and project-singleton `book.brief` / `book.style-profile`. Characters, ideas, relations, scenes, and view definitions are deferred.
- **One operation per ChangeSet** — current shipped text Assets support one exact `replace-text` and reject automatic relocation to a newer Revision.
- **No live watching** — catalog reconciliation is explicit. The Service now exposes bounded search, while file watching and browser invalidation remain deferred.
- **Definition only** — Remote projection, workbench presentation, Session-log context, and model-facing Novel tools belong to separate Consumers.
- **Generic report envelope** — the Repository validates identity, size, provenance, and lossless JSON, while analyzer-specific payload validation belongs to the analysis service that writes it.
