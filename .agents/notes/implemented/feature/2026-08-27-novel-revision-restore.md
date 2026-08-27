# Agent Note: Novel Revision restore as a new current head

Status: implemented

English | [中文](2026-08-27-novel-revision-restore.zh.md)

## Problem

Novel Studio retains every authored Revision and already lets authors inspect historical prose, outlines, guidance, reports, finalizations, preference evidence, and Story State candidates. Inspection alone is not enough when an Agent rewrite or later manual edit is worse than an earlier version. Authors need a reliable way to return authored content to a known state without destroying the evidence and lineage that make Agent changes safe.

Moving the current pointer backwards would make later Revisions disappear from the ordinary history chain, make Session and report references ambiguous, and let an old proposal appear current again. Overwriting the file without repository participation would lose restore provenance, bypass optimistic concurrency, and leave proposed ChangeSets incorrectly applicable.

## Decision

`restoreAssetRevision()` takes an exact current `baseRevisionId`, an exact retained `sourceRevisionId`, and an authorized Session identity. It validates that both Revisions belong to the same Project and Asset, rejects restoring the already-current Revision, reparses the exact retained source bytes through the Asset's registered type at its current path, validates current catalog relationships, and publishes those bytes under the current filesystem version.

Success creates a new current Revision whose parent is the previously current Revision. Its ordinary origin remains `user-edit`, while optional `restoredFromRevisionId` and `restoredBySessionId` fields record the selected historical source and authorizing Session. No Revision is deleted, reordered, or made mutable. The new head can itself be restored away from later, so restore participates in the same linear authored history as save and ChangeSet apply.

The same SQLite transaction that records the new Revision and current head changes every still-`proposed` ChangeSet for that Asset to `conflicted`. Those proposals were created against a different head identity even when their text happens to resemble the restored source; silently reviving or rebasing them would weaken the exact-Revision contract. Already applied, rejected, or conflicted ChangeSets remain unchanged.

Revision-bound analysis reports, finalizations, preference candidates, and Story State candidates are retained on the exact historical Revisions that produced them. They are evidence, not caches to delete. Restoring a chapter does not roll back the project-singleton Story State automatically, because later chapters may depend on confirmed facts. When a Story State Asset exists, the restore result instead sets `storyStateReviewRecommended`, and the workbench presents a visible review warning.

The browser exposes restore only from a read-only historical Revision. It opens a current-versus-selected comparison rendered by the same registered Asset renderer and requires explicit confirmation. On success the canvas opens the newly created current Revision, labels it as restored, reports how many pending proposals became conflicted, and shows the Story State warning when applicable.

## Authority and recovery

- Authored project files remain the authority for current content; retained exact bytes and restore lineage live in `.novel/history.sqlite` schema version seven.
- The addressed Agent Session supplies restore authority and sandbox policy through the Remote Consumer. The model has no restore tool and cannot confirm the author-only action.
- Publication uses the current `FsVersion` and exact base Revision, so concurrent saves or external edits reject the restore instead of being overwritten.
- The filesystem write necessarily precedes the SQLite transaction. If the process fails in that narrow interval, the restored authored bytes remain safe and the next reconciliation records an `external-edit` Revision, but the intended restore provenance cannot be reconstructed automatically.

## Alternatives considered

**Move the current Revision pointer backwards.** Rejected because it breaks the append-only lineage, obscures later work, and makes durable Session references ambiguous.

**Delete every Revision after the selected one.** Rejected because reports, finalizations, Agent trajectories, and author decisions are durable evidence and may still be useful for comparison or a later restore.

**Automatically rebase pending ChangeSets onto restored text.** Rejected because type-specific exact operations deliberately fail stale. A future explicit three-way merge may produce a new proposal, but restore must not guess.

**Automatically roll Story State back with chapter prose.** Rejected because Story State is reviewed project Canon and later chapters may already depend on it. The safe response is impact review, not hidden multi-Asset mutation.

**Expose restore as a model-facing tool.** Rejected because choosing which authored history becomes current is destructive in intent even though data is retained. It remains an explicit browser author action.

## Verification

- Repository tests restore exact retained bytes as a new head, preserve a linear parent chain and restore provenance, conflict pending proposals atomically, retain historical analysis reports, recommend Story State review for chapters, and reject stale base or wrong-Asset sources.
- Schema migration tests upgrade versions one through six to version seven and retain existing rows while adding nullable restore provenance.
- Remote tests prove that restore authority comes from the addressed Agent Session and that the browser descriptor contains only bounded, browser-safe effects.
- Workbench tests cover historical read-only mode, comparison, explicit confirmation, authoritative refresh, restored labels, conflicted-proposal feedback, and Story State review messaging.
- The real keyless Novel Studio composition snapshot covers the assembled restore workflow and durable ChangeSet conflict rather than a standalone component approximation.
- The affected TypeScript projects, generated Remote contract, scoped documentation pairing, focused suites, contract lint, and assembled keyless workbench snapshot pass together. The repository-wide static audit still reports pre-existing workspace and documentation-corpus drift outside PR14; this change adds no new failure to those reported categories.

## Consequences

Restore is safe and auditable but intentionally does not make all derivatives current again. Authors may need to rerun NOAI or chapter review for the new Revision and inspect Story State impact. Historical reports remain available on their original versions, while proposed changes against the old head become explicit conflicts. The narrow file-before-database crash window preserves content at the cost of restore lineage; eliminating that final limitation would require a restore journal and recovery protocol analogous to ChangeSet apply.
