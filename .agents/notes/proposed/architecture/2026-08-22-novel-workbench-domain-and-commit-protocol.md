# Agent Note: Novel workbench domain and recoverable commit protocol

Status: proposed

English | [中文](2026-08-22-novel-workbench-domain-and-commit-protocol.zh.md)

## Problem

The shipped `novel` Agent Preset gives one Session a fiction-writing persona, skills, generic filesystem tools, static file-derived context, and post-write guards. It does not define a novel project, stable asset identity, immutable revisions, semantic selections, reviewable changes, or a browser workbench. Generic `read` / `grep` / `write` / `edit` calls therefore treat manuscripts as unrelated paths, and a successful write reaches the author's current file before the guard can describe what changed.

A novel workbench must let the author and the Agent address the same visible object without making browser state, mutable paths, or conversational prose authoritative. It must preserve DSH's existing invariants: model-visible input is reconstructable from the Session log, a capability has Service Definition / Service Provider / Consumer roles, the default `web` and `headless` compositions remain usable, and new behavior attaches to extension points rather than the agent loop.

The content is high-value user data and may also be edited outside DSH. The design consequently needs an explicit authority boundary between human-readable project files and SQLite history, a stale-write rule, and a crash protocol for the unavoidable gap between a filesystem publication and a database transaction. DSH's generic domain KV layer cannot supply cross-table transactions, secondary indexes, or migrations, and `ctx.fs` does not provide file watching or a cross-process transaction.

## Proposal

Add a private experimental `novel-studio` capability and Profile around a new `ctx.novelRepository` seam. The first complete vertical slice supports one novel project per Workspace root and one asset type, `manuscript.chapter`. It detects `novel.yaml`, addresses chapter assets by stable Frontmatter ids, renders an asset list and manuscript editor, freezes semantic selections, supplies exact revision-bound context to an Agent, accepts only ChangeSet proposals from model-facing tools, and applies an accepted single-asset ChangeSet through a recoverable commit protocol.

Current author content remains authoritative in the project files. `.novel/history.sqlite` is authoritative for immutable Revision snapshots, ChangeSets, and the apply journal. The first catalog and search projection is rebuilt in memory from project files and history; if a persistent search index later lands, it uses a separate disposable `.novel/index.sqlite`, never the history database. DSH Session history remains authoritative for the exact frozen context seen by a model. Browser-only layout, tab, cursor, and draft-view state remain client state.

The existing `novel` Agent Preset remains a session-scoped writing capability and a source of persona and skill behavior. It does not own the workbench domain. The MVP adds a separate package-owned `novel-workbench` Preset that consumes Novel tools and omits raw mutation tools for formal asset roots; research and development Presets may retain generic filesystem and shell tools without gaining authority to commit Novel ChangeSets.

PR1, PR2, and the PR3 MVP described below are implemented on the feature stack. This note remains proposed because its acceptance criteria intentionally cover later asset types, invalidation events, restart snapshots, and orchestration that the MVP defers.

This proposal extends the existing Profile, filesystem, Session-history, Remote, and client-presentation decisions. It supersedes none of them.

## PR1 foundation slice

PR1 establishes the smallest complete `ctx.novelRepository` capability seam as separate packages: a pure Service Definition, a local Service Provider, a read-only Host Remote Consumer, a Client-only adapter that mounts the generated Remote contribution, and the explicit Novel Studio composition bundle. The compiler-face split follows the ordinary one-aggregate rule rather than creating another `api/remotes` exception. The existing Gateway identity policy resolves the addressed Agent; the Consumer adds no authorization mechanism. It uses that Agent Session's working directory as the candidate Workspace root, determines whether it contains a valid version-one Novel Project, and reads its validated project descriptor; it cannot enumerate or mutate assets.

Project discovery reads only the root `novel.yaml` through `ctx.fs`. The local Provider caps the manifest at 64 KiB by default; its Config may select another positive safe-integer byte limit no larger than the smaller of the runtime's maximum buffer and string lengths. It performs strict UTF-8 decoding, rejects every YAML parser error or warning, aliases, and encoded or decoded control characters, validates at most 32 declared content roots in the version-one document, and resolves the marker and content roots through `ctx.fs` before checking them with `ctx.fs.contains()`. A dangling or non-file marker is invalid. Every declared content root must already exist as a directory; dangling links, files, missing roots, and canonical targets outside the Workspace root are rejected. The Host Consumer caps the complete browser descriptor JSON encoded as UTF-8 at 256 KiB by default; its Config may select another positive safe-integer byte limit no larger than the runtime's maximum string length.

The supported explicit Novel Studio composition loads the slice after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. The default `web` and `headless` compositions and `PROFILE_TEMPLATES` remain unchanged; a custom `cordis.yml` may still install the private packages directly. Opening a project is read-only: PR1 does not create `.novel`, initialize SQLite, scan asset files, start watchers, register Novel UI or model tools, or implement ChangeSets.

## PR2 asset and Revision slice

PR2 extends the same capability seam with the first authored asset, `manuscript.chapter`. The local Provider recursively scans only Markdown files below the declared `manuscript` root, enforces configurable depth, asset-count, and exact-byte bounds, requires strict version-one `novel` Frontmatter, rejects duplicate stable ids and mid-scan file changes, and preserves Asset identity across a path rename. Files remain authoritative for the current authored serialization.

The first durable `.novel/history.sqlite` schema stores complete immutable Revision bytes and the reconciled current head. Initial observation, guarded browser saves, and external byte divergence are distinguished as `initial-scan`, `user-edit`, and `external-edit`; `agent-apply` is reserved for PR3. Unknown, unversioned, foreign, or corrupt databases fail explicitly and are never reset. The database uses a private file, WAL, foreign keys, `trusted_schema = OFF`, `synchronous = FULL`, a DSH Novel application id, and strict tables.

Browser Consumers gain bounded project-scoped asset list, chapter read, body-only guarded save, and selection capture methods. A body save retains the exact parsed Frontmatter prefix, validates the resulting complete file, requires both the current base Revision and provider-local `FsVersion`, and records the new Revision only after filesystem publication succeeds. A SelectionRef freezes a non-empty UTF-16 range on code-point boundaries over one retained Revision; quote hash, bounded context, and preview are derived from that immutable body. PR2 adds no prompt context, model tool, ChangeSet persistence, or workbench layout.

## PR3 Agent-native MVP slice

PR3 adds history schema version two with durable single-asset ChangeSets and an apply journal. The model-facing `novel_propose_changes` tool can create one exact-Revision `replace-text` proposal but cannot apply it. Apply and reject are browser-only Remote decisions authorized by the addressed Session. Apply writes the journal before guarded filesystem publication, records an `agent-apply` Revision afterward, and recovers `applying` rows by comparing exact before, after, or divergent hashes on project reopen.

The first SelectionRef strategy remains Revision-bound UTF-16 body offsets with a quote hash, optional bounded prefix and suffix, and no persistent block ids. The Client implements the Context Commit Barrier by saving a dirty chapter through the Repository before capturing a selection. It places a readable Markdown mention containing a canonical `dsh-novel:` URI in the ordinary Composer.

`NovelContextResolver` runs at `agent/pre-step`, parses canonical mentions from direct user messages, resolves only retained exact Revisions, and returns the readable direct message followed by one immutable `user/message` with source kind `novel-context`. That message contains safely serialized untrusted authored material and is appended by the ordinary agent loop, so replay does not reread mutable files. One Session is bound to the first referenced Project.

The explicit Novel Studio overlay disables the ordinary `ui-layout` root occupant only in that composition. `novel-workbench` becomes the sole root occupant and declares the native DSH sidebar, conversation, details, overlay, chapter explorer, and manuscript canvas slots. The shipped `web` and `headless` compositions do not contain these packages. The browser MVP renders one chapter editor, a visible Context Tray, and a durable ChangeSet Diff card with Accept and Reject actions.

PR3 does not add a file watcher or browser invalidation stream. Repository calls reconcile external files, and an accepted ChangeSet triggers an explicit workbench refetch. It also defers block ids, autosave cadence, search, additional asset types, multi-asset changes, automatic merge, a shipped CLI Profile template, and multi-Agent orchestration.

## Scope and invariants

- `ProjectId`, `AssetId`, `RevisionId`, `SelectionRefId`, and `ChangeSetId` are opaque branded ids. A path, title, order, or database row number never becomes identity.
- One Workspace root contains at most one version-one Novel Project, declared by its root `novel.yaml`. One authored asset occupies one file. Series, multiple Books per Workspace, and cross-project references are deferred.
- `novel.type` in Frontmatter is semantic authority. The extension selects a parser; the directory supplies organization advice; neither directory nor filename overrides the declared type.
- Current authored bytes and authored metadata have one authority: the asset file. Current content is not duplicated as an independently editable SQLite head.
- Every Revision is immutable and stores the exact UTF-8 serialized file snapshot plus its content hash, parent, origin, and asset identity. A live `FsVersion` is a compare-and-swap guard, not a durable Revision id.
- Every model-originated formal-asset mutation starts as a typed ChangeSet bound to one base Revision. Version one applies at most one Asset and never silently relocates an operation to a newer Revision.
- Every model-visible Novel context block is appended as an identified immutable `user/message`. A mutable latest file, hash alone, Session Projection, or client cache cannot reconstruct a request.
- All asset paths resolve under the configured project roots and are checked with `ctx.fs.contains()`. A configured `cwd` is not treated as containment.
- Browser push carries ids and revision invalidations, not complete manuscript bodies. Reconnect and an unknown event cause the client to refetch authoritative state.
- Version one supports one DSH Host writer per project. It does not claim cross-process exactly-once behavior, remote-backend parity, or lossless concurrent external writes.

## Authority matrix

| Data | Authority | Derived or cached form | Recovery rule |
| --- | --- | --- | --- |
| Project identity, format version, content roots | `novel.yaml` | Workspace detection result | Re-read the file; malformed configuration fails loud |
| Current asset body and authored metadata | Asset Markdown/YAML file and Frontmatter | Parsed `AssetSnapshot` | Re-read exact bytes; never reconstruct current prose from an index |
| Asset path lookup and type catalog | Project scan | In-memory catalog; future `.novel/index.sqlite` | Delete and rebuild; duplicate ids block mutation |
| Immutable Revision history | `.novel/history.sqlite` | Read cache | Migrate explicitly or refuse read-write open; never reset automatically |
| ChangeSet and apply authorization | `.novel/history.sqlite` | Tool result metadata and browser cache | Refetch by `ChangeSetId`; replay state transitions idempotently |
| In-progress file/database commit | Apply journal in `.novel/history.sqlite` | Live operation handle | Reconcile exact before/after hashes on project open |
| Exact model-visible Novel context | DSH `user/message` events | Context tray and transcript row | Replay logged content; never reread mutable latest assets |
| Current tab, cursor, panel geometry, uncommitted view state | Client runtime | Optional local UI persistence | May be discarded without changing authored content |

## Project and asset format

`novel.yaml` is a project marker and versioned format declaration, not a second asset manifest. It does not enumerate every asset file.

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
```

Version-one chapter assets are UTF-8 Markdown with minimal YAML Frontmatter. Revision ids, file versions, word counts, inferred mentions, last-opened state, and Agent execution facts stay out of Frontmatter.

```markdown
---
novel:
  schema: 1
  id: asset_chapter_12
  type: manuscript.chapter
  title: Chapter 12
  status: drafting
---

The rain had already hidden the harbor lights.
```

Moving or renaming a file preserves the Asset because its Frontmatter id is stable. A duplicate id, unsupported schema, malformed Frontmatter, path outside a declared root, or a symlink that escapes the project produces an explicit diagnostic and prevents formal mutation of the affected project. The Repository does not rewrite a malformed file while trying to repair it.

`.novel/history.sqlite` owns its own schema version and ordered migrations from the first implemented version. A newer unsupported history schema opens read-only or fails explicitly; it is never deleted as though it were a derived index. WAL and sidecar files follow SQLite's lifecycle and are excluded from asset scanning. Project templates recommend excluding SQLite runtime files from Git because binary merge is unsupported; copying the complete project directory still carries local history.

## Domain identities and versioned values

The Service Definition owns the vocabulary; the local Service Provider owns parsing, containment, SQLite, and filesystem publication; tools, context resolution, Remote methods, and browser UI are Consumers.

```ts ignore-check
type ContentHash = `sha256:${string}`

interface Asset {
  readonly id: AssetId
  readonly projectId: ProjectId
  readonly type: 'manuscript.chapter'
  readonly projectRelativePath: string
}

interface AssetSnapshot {
  readonly asset: Asset
  readonly revisionId: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly frontmatter: Readonly<Record<string, unknown>>
  readonly body: string
}

interface AssetRevision {
  readonly id: RevisionId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly parentRevisionId?: RevisionId
  readonly serializedUtf8: Uint8Array
  readonly contentHash: ContentHash
  readonly origin: 'initial-scan' | 'user-edit' | 'agent-apply' | 'external-edit'
  readonly createdAt: string
}

interface SelectionRef {
  readonly version: 1
  readonly id: SelectionRefId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly revisionId: RevisionId
  readonly selector: TextRangeSelector
  readonly preview?: string
}

interface TextRangeSelector {
  readonly kind: 'text-range'
  readonly startUtf16: number
  readonly endUtf16: number
  readonly quoteHash: ContentHash
  readonly prefix?: string
  readonly suffix?: string
}

interface ChangeSet {
  readonly id: ChangeSetId
  readonly projectId: ProjectId
  readonly assetId: AssetId
  readonly baseRevisionId: RevisionId
  readonly operations: readonly NovelOperation[]
  readonly actor:
    | { readonly kind: 'agent'; readonly sessionId: SessionId }
    | { readonly kind: 'user'; readonly sessionId?: SessionId }
  readonly summary: string
  readonly status: 'proposed' | 'applying' | 'applied' | 'rejected' | 'conflicted'
}
```

`Asset` is the current scanned catalog value: its path is mutable organization data, while its branded id remains identity across a rename. `AssetSnapshot` is an immutable parsed read model bound to one retained Revision; `frontmatter` and `body` are derived from `serializedUtf8`, never independent authorities. The Repository reconciles current file bytes into a Revision before exposing a Revision-bound snapshot. Provider-local `FsVersion` stays in the internal live observation used for guarded publication; it is neither durable nor sent across Remote.

Revision ids are content-independent opaque identities. Version one encodes every content and quote hash as `sha256:` followed by exactly 64 lowercase hexadecimal digits over the named exact UTF-8 bytes, so journal comparisons remain stable across restarts and implementations. Full serialized snapshots are retained because correctness and restoration matter more than delta compression. Retention, compaction, export, and deduplication require a later decision with an explicit user-data policy.

ChangeSet operations are discriminated by asset type and validated by its registered adapter. The initial `manuscript.chapter` operation replaces one exact body range. The Repository materializes and validates complete candidate after-bytes before a ChangeSet may enter `applying`; models never submit arbitrary SQL, a filesystem path as authority, or an unvalidated JSON Patch.

## Selection references

A version-one text range uses UTF-16 code-unit offsets over the exact parsed Markdown body of one immutable Revision. The editor must reject boundaries inside a surrogate pair. `quoteHash` verifies the selected text; `prefix`, `suffix`, and `preview` support diagnostics and presentation only. They never authorize fuzzy relocation.

Before the Composer submits a reference to dirty editor content, the browser calls the Novel Remote to flush that authored draft through the Repository. The flush writes the user's current asset with a guarded filesystem mutation, records a `user-edit` Revision, and returns a Revision-bound `SelectionRef`. Failure to flush leaves the prompt unsent.

Reading an old immutable SelectionRef is allowed and is visibly labeled as an old Revision. Applying a ChangeSet based on it is allowed only while that Revision is still the current reconciled head. A newer head yields `conflicted`; version one does not perform fuzzy matching, automatic rebase, or three-way merge. Persistent paragraph or block ids are deferred until a separate decision defines external-editor duplication, deletion, and repair semantics.

## Context admission and Session history

The Composer serializes explicit asset and selection chips as canonical, versioned `dsh-novel:` references in the direct user message. It continues to call ordinary `session.prompt`; version one does not add `novel.prompt` and does not pair `agent.inject()` with a follow-up.

A `NovelContextResolver` follows the existing Session-reference pattern. At `agent/pre-step`, after the current direct message has been claimed, it parses and removes canonical references, validates that every reference names one Project and a retained immutable Revision, applies configured count and byte/token budgets, and returns the readable direct message followed immediately by one frozen Novel context message. The agent loop appends both as `user/message` events in that same Step.

The context message has a merge-extensible source such as `{ kind: 'novel-context', form: 'catalog', version: 1, projectId, references }`. Its content contains the exact provider-neutral text shown to the model, not only ids or hashes. It frames authored content as untrusted reference material, uses tag-safe deterministic JSON serialization, and never lets manuscript text close an instruction delimiter. Missing revisions, cross-project references, malformed selectors, and budget overflow fail before a model request; the Resolver never substitutes the latest file.

The first accepted `novel-context` message in a Session derives its Novel Project binding. Later Novel context in that Session must name the same Project. Ordinary Sessions remain unbound, and the default Web UI can still render the generic context row without loading the Novel workbench. Session Projection may later expose only small derived binding or pinned-id state; it never carries asset bodies or Revision snapshots.

## ChangeSet apply and crash recovery

Proposing a ChangeSet is durable but does not mutate the asset file. Applying requires an explicit user action through the Novel Remote. Version one uses this recoverable single-asset commit:

1. Load the proposed ChangeSet, base Revision, current asset bytes, and current `FsVersion`; reject non-proposed or unauthorized state.
2. Verify that the current bytes equal the base Revision and that every typed operation targets that Revision; materialize and validate the complete after-bytes.
3. In one SQLite transaction, set the ChangeSet to `applying` and persist the exact before/after hashes, after-bytes, target identity, and apply authorization in the journal.
4. Publish the after-bytes with `ctx.fs.writeText(..., { kind: 'replaceIfVersion', version })` under the Repository's per-project write queue.
5. In one SQLite transaction, insert the immutable `agent-apply` Revision, update the reconciled head projection, clear the journal item, and set the ChangeSet to `applied`.

The operation is not described as a cross-medium atomic transaction. Project open and explicit refresh reconcile every `applying` journal item before admitting another write:

- If the file hash equals the recorded after-hash, finalize the Revision and `applied` state without rewriting the file.
- If the file hash equals the recorded before-hash, retry the already-authorized guarded publication, then finalize.
- If the file hash equals neither, preserve both snapshots and mark the ChangeSet `conflicted`; never write automatically.

An `FS_STALE_VERSION` before publication also becomes `conflicted` after the Repository records the observed current bytes as an `external-edit` or `user-edit` Revision. `apply`, `reject`, recovery, and replay are idempotent by `ChangeSetId`; a repeated request reports the durable terminal state. Rejection is valid only from `proposed` and never deletes Revision or ChangeSet evidence.

## Profile and package isolation

Development starts in private `@deepseek-ai/dsh-experimental-*` packages and an explicitly initialized `novel-studio` Profile. Release packages do not depend on experimental packages. Promotion moves the complete capability to product-role package groups before adding a shipped Profile template.

The Profile composes `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app`, and a Novel bundle. The default `web` and `headless` Profiles do not load the Repository, Novel tools, Novel Remote, or Novel UI. They may continue to list the existing session-scoped `novel` Agent Preset.

The first technical slice may register a Novel view inside the existing conversation surface and a Context Tray in its input dock. This is a test harness, not the final product layout. Before the vertical slice is called a Novel workbench, `novel-studio` replaces `ui-layout` with the Profile's sole root occupant, keeps the existing Conversation component in a declared right-side `conversation` slot, and adds project-scoped `novel.explorer` and `novel.canvas` slots. Switching Sessions does not unmount the open manuscript canvas.

Version one does not add a generic Router or Workbench registry. Those abstractions require a second concrete workbench consumer. Workbench choice belongs to the Profile; Agent persona and tool composition belong to a Session Preset.

## Model tools and browser presentation

The first model-facing Consumers are `novel_get` and `novel_propose_changes`. `novel_get` reads validated Asset or Selection references and returns bounded semantic content. `novel_propose_changes` validates one chapter operation, records a ChangeSet, and returns its stable id; it cannot apply the proposal.

The ChangeSet id and target summary live in JSON-serializable tool `meta`. The Novel client registers the keyed `tool.call.toolview` entry for `novel_propose_changes`, renders the durable proposal on replay, and calls Novel Remote methods for show, apply, or reject. With the client plugin absent, the ordinary generic tool row remains a readable fallback. Browser invalidation events contain project, asset, Revision, or ChangeSet ids and are explicitly admitted by the Remote-event allowlist; clients refetch after an event or reconnect.

The safe Novel Preset omits raw model-facing `write` and `edit` for formal assets. Research and development Presets may expose `read`, `grep`, shell, or raw mutation tools, but Repository authority, stale checks, and ChangeSet application never depend on `toolFilter` or prompt policy. External or privileged raw writes appear as file divergence at the next reconciliation boundary.

## Deferred work

- Additional asset types, including outlines, characters, ideas, scenes, timelines, relations, and view definitions.
- A persistent disposable search index, full-text search, semantic search, inferred mentions, and reverse relations.
- File watching, remote filesystem parity, multiple concurrent Host writers, collaboration, and CRDT positions.
- Persistent block ids, fuzzy relocation, three-way merge, multi-asset ChangeSets, branches, and cross-project references.
- Series and multiple Books per Workspace, publishing adapters, import/export, and history retention controls.
- Role Profiles, Task and Blackboard domains, `novel_delegate`, autonomous workflows, and multi-Agent coordination.
- A general Router or Workbench registry shared by Default, Code, Novel, or future workbenches.

## Relationship to existing decisions

This proposal uses Profile bundles as the isolation unit from [Profile plugin bundles replace the fixed surface overlays](../../implemented/architecture/2026-08-05-profile-plugin-bundles.md), and follows the Service Definition / Service Provider / Consumer split from [Filesystem capability seam](../../implemented/architecture/2026-06-17-filesystem-capability-seam.md). It uses guarded `ctx.fs` mutation through the [file-context event gate](../../implemented/architecture/2026-06-26-file-context-as-event-gate.md) without treating generic filesystem tools as Novel authority.

Frozen Novel context follows [reconstructable requests](../../implemented/architecture/2026-07-05-reconstructable-requests.md) and [identified immutable message values](../../implemented/architecture/2026-07-28-identified-immutable-message-values.md). Browser calls use [Typert Remote method calls](../../implemented/architecture/2026-08-02-typert-remote-method-calls.md), while the ChangeSet row follows [client tool presentation ownership](../../implemented/architecture/2026-08-08-client-tool-presentation-ownership.md).

The generic [Domain KV storage proposal](2026-07-24-domain-kv-storage-and-workspace.md) remains suitable for lightweight registration and small metadata. Novel history deliberately owns a separate database because it requires migrations, transactions, ordered state transitions, immutable snapshots, and indexed queries that the generic record layer does not promise.

## Alternatives considered

**Make SQLite authoritative for current prose and export Markdown.** This gives one transactional database but weakens external-editor, Git, and plain-file portability, which are explicit product requirements. Files therefore remain authoritative for current authored content.

**Store Revision and ChangeSet records in `storageDomain`.** Its record KV contract has no cross-table transaction, secondary index, or migration protocol. Wrapping it would create a second transaction layer without deleting Novel-owned recovery code, so the Novel Repository owns its SQLite schema directly.

**Let the Agent use generic `write` / `edit` and reconstruct a diff afterward.** A post-write guard observes too late, cannot bind the mutation to a base Revision, and cannot keep unaccepted prose out of the author's file. Formal model mutations therefore enter through ChangeSets.

**Add hidden paragraph ids to every chapter immediately.** Persistent ids improve later relocation but introduce duplicate, deletion, and external-editor repair semantics before a current-Revision selection needs them. Version-one references remain Revision-bound; a future selector kind can add block identity compatibly.

**Add `novel.prompt` that calls `agent.inject()` followed by `followup()`.** The two inbox placements are not one semantic pair and injected context may be claimed by another Step. Resolving refs in `agent/pre-step`, after the direct prompt is claimed, follows an existing DSH extension pattern and logs one exact request batch.

**Replace the default Web root or build a generic Workbench registry first.** A global replacement would make unrelated DSH Sessions depend on Novel UI, while a registry has only one new consumer. A separate Profile isolates the product now and leaves generalization until evidence exists.

**Implement multi-asset transactions and multi-Agent orchestration in the first slice.** Both multiply recovery and ownership states before the semantic edit loop is proven. Version one establishes a single-asset durable boundary; orchestration consumes it later.

## Acceptance criteria

- A proposed implementation has a complete `ctx.novelRepository` capability seam with independently testable Service Definition, local Service Provider, and Consumers; every registration disposes cleanly under HMR and plugin unload.
- Real profile composition tests prove `web` and `headless` load no Novel Repository, Remote, workbench UI, or Novel tools, while `novel-studio` loads the intended exact roster without replacing the existing session-scoped Preset contract.
- A project scan identifies one `manuscript.chapter`, preserves identity across rename, rejects duplicate ids and escaped paths, reports malformed Frontmatter without rewriting it, and rebuilds every derived catalog value from files.
- Revision tests prove exact UTF-8 snapshot retention, parent continuity, content-hash equality, explicit schema migration or refusal, and no automatic reset of `.novel/history.sqlite`.
- Selection tests cover Chinese text, emoji, CRLF input, surrogate-pair boundaries, dirty-draft flush, old-Revision display, quote-hash mismatch, and fail-closed stale application without fuzzy relocation.
- Context tests prove canonical refs resolve only retained immutable Revisions, cross-project and oversized context fail before a model call, exact safely serialized content appears in `user/message`, and replay, resume, fork, and compaction never reread mutable latest files.
- ChangeSet tests prove proposal does not mutate files, unauthorized or stale apply cannot publish, apply/reject/retry are idempotent, and crash injection before journal commit, before file publish, after file publish, and before final SQLite commit converges to the documented state.
- A guarded write racing a user or external edit preserves the newer file, records divergence, and leaves the Agent proposal `conflicted`; no test permits last-writer-wins overwrite.
- Browser tests prove asset and ChangeSet invalidations refetch authoritative state, reconnect needs no event replay, keyed Tool presentation restores the card from durable `meta`, and absent Novel presentation falls back to the generic Tool row.
- Keyless runnable application snapshots cover the technical Novel view and the final `novel-studio` root composition, including a selected range, disclosed frozen context, a ChangeSet card, Diff review, acceptance, stale conflict, and restart recovery. Default Web snapshots remain unchanged apart from separately intentional Preset roster facts.
- Documentation records the on-disk formats, migration policy, single-writer limit, security framing, token effect, KV Cache effect, and operational recovery procedure before the proposal moves to `implemented`.

## Risks

Files and SQLite cannot share one atomic transaction. The journal makes the commit recoverable and convergent, but every new write path must preserve the order and hash checks; bypassing the Repository reintroduces ambiguity.

The single-Host-writer limit does not prevent an external editor or second process from writing between observation and publication. `FsVersion` protects the final publish inside one provider, and reconciliation preserves divergent bytes, but version one does not promise cross-process coordination.

Full Revision snapshots can grow quickly for long novels. Premature delta storage would complicate restoration and corruption recovery, so version one accepts the space cost and defers a measurable retention policy.

UTF-16 body offsets match the browser and TypeScript runtime but require explicit newline and surrogate handling. Any future non-JavaScript client must implement the same selector version rather than reinterpret offsets.

Novel files are untrusted model context. Incorrect framing can turn quoted prose or research into instructions, and excessive automatic context can consume the request budget. The Resolver must fail closed on size, escape deterministically, and disclose every included Revision.

An isolated Profile duplicates some shell composition and postpones seamless in-app switching. That cost is accepted to keep default DSH stable and avoid a speculative global Workbench abstraction.
