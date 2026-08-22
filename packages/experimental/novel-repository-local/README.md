# @deepseek-ai/dsh-experimental-novel-repository-local

English | [中文](README.zh.md)

## Purpose

This experimental package provides the local-filesystem implementation of `ctx.novelRepository`. It discovers a Novel Project from a bounded, versioned `novel.yaml` and resolves the declared content roots through the composed `ctx.fs` service.

## Behavior

- The candidate root must be a directory. An absent `novel.yaml` returns `undefined`, while a present invalid manifest, including a dangling marker link, fails with a typed `NovelRepositoryError`.
- The complete UTF-8 manifest is bounded by `manifestMaxBytes`, which defaults to 64 KiB, must be a positive safe integer, and cannot exceed the smaller of the runtime's maximum buffer and string lengths. NUL bytes, decoded control characters, and every YAML parser error or warning, including duplicate keys and aliases, are rejected.
- Schema `1` requires `kind: novel-project`, non-empty `id` and `title` strings, and a `contentRoots` mapping whose `manuscript` entry is present and whose total entry count does not exceed 32. Content-root names use lowercase kebab-case.
- The provider resolves every declared content-root path through `ctx.fs` and requires its contained canonical target to exist as a directory. Missing roots, non-directories, dangling links, and canonical targets outside the project root are rejected.

## Model Experience

### Local project discovery

#### What the model sees

Nothing from `LocalNovelRepository` is added to model context; consumers receive a Host-side project snapshot only through the repository service.

#### Token effect

Manifest parsing and target resolution add no prompt or tool-schema tokens.

#### KV Cache effect

The provider does not change message ordering or reusable KV-cache prefixes.

## Known Limitations and Deferred Work

- **Manifest discovery only** — the provider does not scan assets, parse asset Frontmatter, build an index, or create revisions and ChangeSets.
- **Content roots are validated, not scanned** — each target must already exist as a contained directory, but discovery does not enumerate its files.
- **No live synchronization or repair** — discovery is a stateless call with no file watcher, cache refresh, migration, or automatic manifest repair; only schema `1` is accepted.
- **No SQLite, Remote, dedicated Client UI, or model tool** — persistence, transport, workbench surfaces, and model-facing Novel tools are outside this provider.
