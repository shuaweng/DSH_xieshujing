# @deepseek-ai/dsh-experimental-novel-repository-local

English | [中文](README.zh.md)

## Purpose

This experimental package provides the local-filesystem implementation of `ctx.novelRepository`. Project files remain authoritative for current authored content, while `.novel/history.sqlite` retains immutable exact-byte Revisions.

## Behavior

- The candidate root must be a directory. An absent `novel.yaml` returns `undefined`, while a present invalid manifest, including a dangling marker link, fails with a typed `NovelRepositoryError`.
- The complete UTF-8 manifest is bounded by `manifestMaxBytes`, which defaults to 64 KiB, must be a positive safe integer, and cannot exceed the smaller of the runtime's maximum buffer and string lengths. NUL bytes, decoded control characters, and every YAML parser error or warning, including duplicate keys and aliases, are rejected.
- Schema `1` requires `kind: novel-project`, non-empty `id` and `title` strings, and a `contentRoots` mapping whose `manuscript` entry is present and whose total entry count does not exceed 32. Content-root names use lowercase kebab-case.
- The provider resolves every declared content-root path through `ctx.fs` and requires its contained canonical target to exist as a directory. Missing roots, non-directories, dangling links, and canonical targets outside the project root are rejected.
- The `manuscript` tree is scanned within configurable depth, count, and byte bounds. Markdown chapters require strict YAML Frontmatter with `novel.schema: 1`, a stable `novel.id`, `novel.type: manuscript.chapter`, and a title. Duplicate ids and files that change during scanning fail closed.
- Exact UTF-8 file bytes are hashed and stored as immutable Revision snapshots in a private SQLite database. Renaming a file preserves Asset identity and the current Revision; an external byte change creates an `external-edit` Revision. Unknown or corrupt history schemas are refused and never reset.
- Author saves replace only the parsed body, retain the exact Frontmatter prefix, and use the current `FsVersion` plus base Revision to reject stale publication. Selection references use UTF-16 body offsets, reject surrogate-pair splits, and bind quote hashes to retained Revisions.
- History schema version two stores ChangeSets and an apply journal. Proposal is file-read-only; apply requires the proposing Session, an exact current base Revision, and one validated `replace-text` operation; reject is also Session-owned and terminal.
- Apply records exact before/after bytes and hashes as `applying` before guarded filesystem publication, then records the `agent-apply` Revision and terminal state. On project reopen, an after-hash finalizes, a before-hash retries the authorized write, and any third hash marks the ChangeSet `conflicted` without overwriting it.
- Version-one history databases migrate to version two in place. Unsupported newer or corrupt databases still fail explicitly and are never reset.

## Model Experience

### Local project discovery

#### What the model sees

Nothing from `LocalNovelRepository` is added to model context; consumers receive a Host-side project snapshot only through the repository service.

#### Token effect

Manifest parsing and target resolution add no prompt or tool-schema tokens.

#### KV Cache effect

The provider does not change message ordering or reusable KV-cache prefixes.

## Known Limitations and Deferred Work

- **Single Host writer** — writes are serialized within one provider process; file watching, cross-process locking, and collaborative editing are deferred.
- **Explicit reconciliation only** — current files are reconciled on list/read/save boundaries; there is no watcher or automatic repair.
- **Full snapshots** — every Revision stores complete bytes. Retention, compaction, and export policy are deferred.
- **Single-asset recovery** — multi-asset transactions, automatic rebase, fuzzy relocation, and three-way merge are deferred.
- **No cross-process lock** — the guarded `FsVersion` prevents one stale publication, but a second Host process is outside the supported writer model.
