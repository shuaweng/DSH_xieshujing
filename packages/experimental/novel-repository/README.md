# @deepseek-ai/dsh-experimental-novel-repository

English | [中文](README.zh.md)

## Purpose

This experimental package defines the provider-neutral `ctx.novelRepository` capability seam and version-one Novel Project types. It gives Host consumers one stable, manifest-owned project identity without treating a filesystem path, Session, browser state, or transport request as that identity.

## Behavior

- `NovelRepository.discoverProject()` accepts one canonical filesystem directory target and returns `undefined` only when that directory has no `novel.yaml`.
- A discovered `NovelProjectSnapshot` contains schema `1`, the stable `ProjectId`, author-visible title, canonical project and manifest targets, and canonical named content-root targets.
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

- **Discovery only** — the contract does not list or parse assets, Frontmatter, relations, revisions, or ChangeSets.
- **No persistence or index contract** — SQLite, history, search, file watching, and crash recovery are outside this package.
- **No transport, Client UI, or model tool** — Remote projection, workbench presentation, Session-log or model-context integration, and model-facing Novel tools belong to separate Consumers.
