# @deepseek-ai/dsh-experimental-novel-repository-local

English | [中文](README.zh.md)

## Purpose

This experimental package provides the local-filesystem implementation of `ctx.novelRepository`. Project files remain authoritative for current authored content, while `.novel/history.sqlite` retains immutable exact-byte Revisions.

## Behavior

- The candidate root must be a directory. An absent `novel.yaml` returns `undefined`, while a present invalid manifest, including a dangling marker link, fails with a typed `NovelRepositoryError`.
- Initialization is create-only: it validates the title and default root paths, creates `manuscript` and `planning`, then writes `novel.yaml` last. Existing author files are preserved, while an existing manifest or a non-directory root path fails without publishing a new marker.
- The complete UTF-8 manifest is bounded by `manifestMaxBytes`, which defaults to 64 KiB, must be a positive safe integer, and cannot exceed the smaller of the runtime's maximum buffer and string lengths. NUL bytes, decoded control characters, and every YAML parser error or warning, including duplicate keys and aliases, are rejected.
- Optional `assetOrder` entries in `novel.yaml` store a complete stable-ID sequence per exact Asset type. Reordering replaces the manifest under filesystem-version protection, creates no Asset Revision, and leaves unlisted legacy Assets in deterministic project-path order.
- Schema `1` requires `kind: novel-project`, non-empty `id` and `title` strings, and a `contentRoots` mapping whose `manuscript` entry is present and whose total entry count does not exceed 32. Content-root names use lowercase kebab-case.
- The provider resolves every declared content-root path through `ctx.fs` and requires its contained canonical target to exist as a directory. Missing roots, non-directories, dangling links, and canonical targets outside the project root are rejected.
- Registered Asset definitions select declared content roots, accepted extensions, creation behavior, semantic-parent rules, and optional project-singleton cardinality. Markdown Frontmatter dispatches each candidate through `ctx.novelAssetTypes`; unknown types, extension mismatches, duplicate ids, invalid parents, hierarchy cycles, project-singleton duplicates, and files that change during scanning fail closed. The shipped chapter definition uses Markdown under `manuscript`; the planning contribution uses freeform Markdown under optional `planning`.
- `searchAssets()` reconciles the same typed catalog, searches author-visible titles plus each registered definition's `modelText()`, supports an exact type allowlist, and returns deterministic bounded excerpts, scores, and current Revision summaries. Search never writes project files or silently adds results to model context.
- Exact UTF-8 file bytes are hashed and stored as immutable Revision snapshots in a private SQLite database. Renaming a file preserves Asset identity and the current Revision; an external byte change creates an `external-edit` Revision. Unknown or corrupt history schemas are refused and never reset.
- Typed creation generates a stable Asset id and safe filename inside the registered content root, validates parent/singleton/depth rules, publishes with `createIfAbsent`, and retains the first Revision. The built-in chapter definition accepts a title and complete manuscript body in one creation; it never requires a separately created empty container. When an empty chapter already exists, one exact-Revision ChangeSet can combine `update-title` with `insert-text` at offset zero; `replace-text` remains non-empty. Author saves and ChangeSets ask the registered definition to materialize and reparse complete candidate bytes once, then use the current `FsVersion` plus base Revision to reject stale publication. Shipped text definitions preserve identity/parent Frontmatter and validate UTF-16 offsets on complete code-point boundaries.
- History schema version five stores the target Asset type with ChangeSets, retains the apply journal, exposes immutable Revision summaries, keeps one validated analysis-report envelope per exact `(Project, Asset, Revision, kind)`, and adds idempotent exact-Revision finalizations plus review-gated preference candidates. Durable operations are decoded and materialized through that exact registered definition; proposal remains file-read-only and review is Session-owned.
- Analysis reports are bounded by `analysisReportMaxBytes` (1 MiB by default), require an existing Revision belonging to the addressed Asset, and upsert atomically only after the analysis Consumer submits complete JSON. A failed analyzer run performs no write and therefore preserves the prior successful report.
- Finalization walks only the addressed chapter's retained parent chain to find the nearest `agent-apply` source and its ChangeSet/Session lineage. Preference candidates require existing source, final, and exact `book.style-profile` Revisions; acceptance still publishes authored bytes only through the normal ChangeSet journal.
- Apply records exact before/after bytes and hashes as `applying` before guarded filesystem publication, then records the `agent-apply` Revision and terminal state. On project reopen, an after-hash finalizes, a before-hash retries the authorized write, and any third hash marks the ChangeSet `conflicted` without overwriting it.
- Save and apply-recovery publications forward the caller's per-call sandbox policy to `ctx.fs`; the provider never substitutes its own process directory for a Session workspace boundary.
- Version-one, version-two, and version-three history databases migrate to version four in place. Unsupported newer or corrupt databases still fail explicitly and are never reset.

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
- **Lexical search only** — normalization and deterministic substring ranking are shipped; language-aware tokenization, semantic embeddings, and relation-scoped ranking are deferred.
