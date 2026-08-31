# Agent Note: Novel Story State and reviewed Story Delta

Status: implemented

English | [中文](2026-08-27-novel-story-state-and-delta.zh.md)

## Problem

The Novel workbench has visible book briefs, style profiles, outlines, chapter outlines, manuscript Revisions, review reports, and explicit author finalization. Those sources describe intent, guidance, drafts, and criticism, but none is the durable authority for what the published story has actually established so far. As a long novel diverges from its original outline, later writing can therefore forget a confirmed event, use an obsolete character state, repeat a resolved hook, or import planned future information as if it had already happened.

Reconstructing that state by injecting every earlier chapter would be expensive, non-deterministic, and hostile to the task-aware context budget introduced by PR12. Introducing separate character, location, item, timeline, and knowledge-graph Asset types now would also force structure before the author workflow requires it.

## Decision

The implementation adds one project-singleton, author-visible, freeform Markdown Asset type named `book.story-state`. It records the current story reality confirmed by finalized prose: chronology, character condition and location, relationships and knowledge, object state, established facts, active plot threads, unresolved promises, and any other facts the author considers useful. These are optional authoring conventions, not required fields. The repository constrains identity, singleton cardinality, Revision, and mutation; it does not constrain the Markdown layout.

Marking an exact `manuscript.chapter` Revision final triggers a fixed one-shot Story Delta worker. The worker receives only the exact finalized chapter and the exact current Story State through the Novel Context Compiler, loads the packaged `story-state-extraction` Skill, and returns a strict bounded result containing a complete proposed Story State replacement, a summary, and short evidence quotes from that chapter.

The result is a durable `StoryStateCandidate`, not an automatic Canon mutation. It binds the exact finalized chapter Revision and exact target Story State Revision, records extractor and worker lineage, and remains `pending` until the author accepts or rejects it. Acceptance creates and applies an ordinary exact-base-revision ChangeSet. A stale Story State conflicts instead of being overwritten. Rejection retains the decision without changing the Asset. Repeating finalization for the same chapter Revision reuses its existing candidate.

Preference learning and Story Delta extraction are independent finalization products. Story Delta extraction can run for an author-written chapter even when there is no preceding Agent draft or learnable author edit. If the Story State singleton is missing, finalization still succeeds and the workbench offers a visible creation action rather than inventing hidden state.

The Context Compiler includes the latest confirmed `book.story-state` body only in chapter writing, rewrite, and chapter-review task policies. Ordinary turns, outline tasks, and preference learning retain a coordinate or no automatic Story State material, so this feature does not turn every conversation into an ever-growing full-book prompt. Each Manifest continues to record the exact included Revision and budget decision.

No new model tool is added. Existing `novel_create`, `novel_get`, `novel_search`, and `novel_propose_changes` understand the new Asset through the Asset Type Registry. Candidate acceptance and rejection remain author-only Remote actions.

## Authority and recovery

- The authored `book.story-state` Markdown file is the authority for current confirmed story state.
- Immutable Revisions, finalizations, Story State candidates, ChangeSets, apply journals, and decisions are durable sidecars in `.novel/history.sqlite` schema version six.
- The DSH Session Log remains the authority for prompts, Skill loads, Context Manifests, Subagent trajectories, and tool calls. Candidate rows store lineage identifiers, not duplicated conversation text.
- Publishing a Story State change uses the existing ChangeSet apply and crash-recovery protocol. Candidate state changes to `accepted` only after apply reaches an applied result and stores the result ChangeSet and Revision identities.
- A worker or persistence failure after finalization does not roll back the explicit finalization. The UI reports the retained finalization and the missing/failed derivative separately.

## Alternatives considered

**Automatically mutate Story State after finalization.** Rejected because extraction is semantic inference. A model must not silently turn its interpretation into Canon.

**Derive state from the full manuscript on every request.** Rejected because it is costly, non-replayable under changing prose, and defeats deterministic context budgeting.

**Create structured character, location, item, timeline, knowledge, and promise types now.** Rejected because the current user workflow prefers freeform strings. A reviewed singleton proves the state lifecycle without prematurely freezing an ontology; later typed views can migrate or project from the same authored state.

**Store Story Delta only as a review report.** Rejected because reports diagnose one Revision while later Agents need one visible, editable, versioned current truth source.

**Always inject Story State into every turn.** Rejected because ordinary questions and planning tasks do not need its full body. Task policies and Manifest budgets are the correct inclusion boundary.

## Verification

- The workbench and `novel_create` can create at most one freeform `book.story-state`; the Agent can list, search, read, and propose revision-bound edits to it through existing Novel tools.
- Finalizing any chapter Revision produces at most one durable, exact-Revision-bound Story State candidate when the singleton exists, independent of preference-learning eligibility.
- The packaged extraction Skill and fixed one-shot worker return a validated, bounded complete replacement plus summary and evidence; malformed output never mutates the Asset.
- The author can inspect, accept, or reject the candidate. Acceptance uses the existing ChangeSet/apply protocol, and a stale base Revision conflicts safely.
- Chapter-write, selection-rewrite, selection-review, and chapter-review Context Manifests include the exact accepted Story State Revision within explicit budgets; ordinary turns do not inject its body automatically.
- Schema-v5-to-v6 migration, candidate lifecycle, idempotency, context budgeting, Remote bounds, workbench creation/review, and the real keyless Novel Studio composition are covered by tests and snapshot validation.
- Default `web` and `headless` profiles remain isolated from Novel Studio.

## Consequences

The extractor can omit a fact, overstate an implication, or preserve obsolete prose. Mandatory author review, evidence, exact Revision binding, and normal ChangeSet conflict handling bound that risk. Freeform Markdown is less directly queryable than a knowledge graph, but it preserves author freedom and leaves room for later typed projections, structured Issue links, or domain-specific state sections without a storage rewrite.
