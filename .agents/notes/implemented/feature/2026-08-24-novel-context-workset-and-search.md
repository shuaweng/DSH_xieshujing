# Agent Note: Novel context workset and bounded Asset search

Status: implemented

English | [中文](2026-08-24-novel-context-workset-and-search.zh.md)

## Problem

The Novel workbench can freeze one explicit selection into a canonical `dsh-novel:` Composer reference, and the Host already records the exact model-visible Asset Revision in the Session Log. That proves the safe single-reference path, but it does not yet give an author a manageable working set. A chapter, outline, or character card cannot be pinned across turns; the currently open Asset cannot deliberately follow guarded saves; and the Composer has no compact disclosure of the non-text references that the next turn will receive.

Agents also have to enumerate the whole catalog with `novel_list` before reading a relevant Asset. That becomes noisy as a Book grows and encourages path or title guessing instead of semantic Asset discovery.

## Decision

Add a Session-owned Novel context workset and a bounded lexical Asset search while preserving exact Revisions as the only model-input authority.

The workset is a whole-value `novel/context-workset` Session event containing at most one `follow` reference plus explicitly `pinned` references. Every item carries one project, Asset, retained Revision, optional type-defined selector, author-facing label, and origin. Version two may also carry one bounded presentation surface, currently `library-home`; that surface contains only visible metadata, remains bound to the workset Project, and grants no cross-project Asset access. The browser replaces the whole value through a typed Remote mutation; a client-visible Session Projection folds the latest event so refreshes, other tabs, and replay recover the same workset. The event is coordination state, not authored Book data, so it never enters Frontmatter or `.novel/history.sqlite`.

At `agent/pre-step`, the Novel context resolver merges the current workset with canonical references parsed from the direct user message. Explicit message references take precedence, exact URI identity deduplicates the set, one-project Session binding still applies, and all repository reads target the named retained Revisions. The resolver emits one model-visible `user/message` whose `novel-context` source is a version-two Context Manifest. The manifest has a deterministic content-derived ID and records each frozen reference's origin and mode; the complete material remains in the append-only Session Log and is replayable without rereading mutable heads.

The Composer contributes a compact Context Tray only for the exact `novel-workbench` preset. It exposes follow-current, search-and-pin, and remove actions as human labels without paths, offsets, encoded URIs, or raw model payloads. Explicit selections remain ordinary `@[preview…]` Composer occurrences. Search and pinned items appear as separate compact chips because they affect later turns without becoming prose in the user's draft.

`novel_search` and the matching browser Remote use one provider-neutral repository operation. Version one performs a deterministic, bounded lexical scan over current typed Asset model text and titles, returns exact current Revision references plus short excerpts, and supports optional Asset-type filtering. Search results are discovery only: they are never injected automatically and never mutate authored content. A rebuildable SQLite/FTS or semantic index may replace the local scan behind the same repository seam later.

A `follow` item advances only after the browser observes a successful guarded save and receives the new Revision. Unsaved editor bytes are never silently represented as current context; while the active Asset is dirty, the tray marks follow-current as waiting for save and the Host retains the last exact saved Revision. Explicit selection capture keeps its existing save-before-freeze barrier.

## Durable and wire contracts

- `novel/context-workset` is a versioned whole-value Session event and its projection is the sole live workset read face.
- `novel-context` source version two is the frozen Context Manifest; it owns deterministic `manifestId`, project identity, and exact reference records.
- Workset mutation validates bounds, exact reference shapes, one-project membership, and Session working-directory binding before appending.
- Search is bounded by query length, result count, excerpt length, and aggregate Remote response size.
- Removing every item appends an empty workset value rather than deleting or rewriting prior events.

## Alternatives considered

**Keep every reference as hidden Composer text.** This makes pinning leak implementation tokens into draft semantics, makes cross-turn references difficult to distinguish from authored instructions, and provides no durable current-workset projection.

**Store the workset only in browser local state.** Refreshes and other tabs would disagree, and the Host could not prove which non-text references belonged to a model turn.

**Automatically retrieve relevant Assets for every prompt.** Automatic retrieval hides what the model saw and introduces ranking quality before authors have a reliable explicit workset. PR7 keeps discovery user- or Agent-initiated.

**Add SQLite FTS or embeddings immediately.** The current project scale does not justify migration and index-recovery complexity. A bounded provider-neutral lexical contract validates the product behavior without making the first implementation the permanent storage design.

## Consequences

Only an exact `novel-workbench` Session renders the compact Context Tray. Authors can follow the current saved Asset, search and pin exact results, and remove pinned or follow items; repository, Remote, and Agent search contracts also support optional Asset-type filtering. Refreshing or reopening a Session reconstructs the latest workset from Session events and its Projection.

A prompt without a visible Novel mention still receives pinned and followed exact Revisions, while an explicit `@[preview…]` reference is merged and deduplicated. Every prepared direct-user turn records one version-two Context Manifest and the complete model-visible material in the Session Log. Dirty current content is never mislabeled as included: guarded save advances the follow reference, while explicit selection capture keeps its save-before-freeze barrier.

Search stays bounded and discovery-only. It returns exact Asset/Revision references and excerpts, does not inject results automatically, and is composed only into the Novel preset. The initial lexical implementation is intentionally replaceable behind the repository contract.

## Risks

Whole-value workset events can grow the Session Log if the client publishes unchanged values, so the mutation must reject no-op replacements. Lexical search will miss conceptual matches and may rank common words poorly; the limitation is deliberate and visible. A follow reference trails unsaved typing until a guarded save succeeds, which favors reproducibility over pretending the Host has bytes it has not retained. The Context Tray adds one compact Composer row whenever the exact Novel preset is active. Keeping the follow and search affordances visible makes the workset discoverable even when it is empty, while preset scoping prevents the row from appearing in ordinary Agent sessions.

## Testing

Focused repository, context, Remote, Agent-tool, client, and Novel Studio composition suites pass with 96 tests. The affected TypeScript project references build together, generated Remote contracts are current, and repository lint, contract, translation-pairing, documentation, and client-bundle gates are run before the PR7 commit.
