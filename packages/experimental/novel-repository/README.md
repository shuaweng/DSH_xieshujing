# @deepseek-ai/dsh-experimental-novel-repository

English | [中文](README.zh.md)

## Purpose

This experimental package defines the provider-neutral `ctx.novelRepository` capability seam and version-one Novel Project types. It gives Host consumers stable Project, Asset, Revision, and Selection identities without treating a filesystem path, Session, browser state, or transport request as that identity.

## Behavior

- `NovelRepository.discoverProject()` accepts one canonical filesystem directory target and returns `undefined` only when that directory has no `novel.yaml`.
- A discovered `NovelProjectSnapshot` contains schema `1`, the stable `ProjectId`, author-visible title, canonical project and manifest targets, and canonical named content-root targets.
- `listAssets()` reconciles authored files into current catalog rows, `readAsset()` reads the current or one retained immutable Revision, `saveChapterBody()` performs a guarded body-only author save, and `captureSelection()` freezes one exact UTF-16 body range.
- Version-one public values define `manuscript.chapter`, exact `sha256:` content hashes, immutable Revision ancestry, and Revision-bound `SelectionRef` values. `ChangeSet` vocabulary is reserved here for the next Consumer slice; this Service Definition does not itself expose model tools or apply changes.
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

- **One asset type** — version one supports `manuscript.chapter`; outlines, characters, ideas, relations, and view definitions are deferred.
- **No search or live watching** — catalog reconciliation is explicit. Search, file watching, and browser invalidation are deferred.
- **No transport, Client UI, or model tool** — Remote projection, workbench presentation, Session-log or model-context integration, and model-facing Novel tools belong to separate Consumers.
