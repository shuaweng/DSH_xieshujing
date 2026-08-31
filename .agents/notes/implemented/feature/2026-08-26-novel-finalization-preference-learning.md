# Agent Note: Novel Finalization and Preference Learning

Status: implemented

English | [中文](2026-08-26-novel-finalization-preference-learning.zh.md)

## Problem

The Novel workbench retains every authored Revision, but it cannot distinguish an ordinary save from the version the author considers finished. Consequently, a draft/final diff is not reliable learning evidence: intermediate edits, rejected Agent output, and accidental saves would all look equivalent. PR11 needs an explicit author-controlled finalization boundary before it may infer durable style or pacing guidance.

This slice must not turn one edit into hidden permanent prompt state. It also must not introduce character, location, idea, Story State, or other knowledge Asset types. The existing free-form chapter, chapter outline, book brief, and book style profile remain sufficient inputs.

## Decision

Add a durable finalization sidecar and a durable preference-candidate sidecar to `.novel/history.sqlite` schema version five.

- A finalization addresses one exact `manuscript.chapter` Revision. Only the browser/user Remote can create it; no model tool can mark its own output final. Repeating the same command is idempotent. Several historical Revisions may remain marked final because finalization is an author decision and history is append-only.
- The learning source is the nearest `agent-apply` ancestor in the same Revision parent chain. The applied ChangeSet remains the authority for the source Agent Session. If there is no Agent ancestor, no author edit after it, or no text difference, finalization succeeds but no preference candidate is fabricated.
- A fixed one-shot Subagent compares the exact Agent Revision with the exact final Revision. Its prompt contains only bounded, explicitly delimited untrusted text plus the current exact `book.style-profile` when present. It returns a strict, bounded candidate: summary, proposed Markdown guidance, and before/after evidence.
- The candidate is not a style rule. It remains `pending` until the author accepts or rejects it. Accepting uses the existing ChangeSet and crash-recoverable apply protocol to append the reviewed guidance to the exact style-profile Revision captured during extraction. A stale style profile conflicts instead of being overwritten. Rejecting changes only candidate state.
- A missing style profile does not create hidden state. The workbench asks the author to create the visible singleton first, then rerun extraction.
- DSH Session Log remains the authority for the original prompt, skill calls, model/tool trajectory, and context manifest. PR11 stores the source ChangeSet and source Session identities as lineage pointers; it does not duplicate the Session Log into SQLite.

## User Experience

The chapter header exposes `Mark final` for the exact Revision on screen. After finalization, the workbench reports one of three explicit outcomes: no learnable Agent diff, a pending candidate, or a failure after the finalization was already retained. A preference drawer shows the inferred guidance and exact evidence. `Accept into book style` applies through a ChangeSet; `Reject` retains the rejected decision for audit.

Historical Revisions remain read-only but may be marked final deliberately. The current Revision selector displays finalization state. Finalization never runs automatically on save, ChangeSet apply, review, or NOAI scan.

## Boundaries

- No automatic mutation of `book.style-profile` from a model response.
- No preference RAG, model training, ranking, Story State, Character Knowledge, or Scene Contract in PR11.
- No character, location, idea, trope, or reference-library Asset types.
- Preference extraction is advisory and exact-Revision-bound; it is not a quality score.
- Existing file/SQLite authority, SelectionRef, ChangeSet authorization, and crash-recovery rules remain unchanged.

## Consequences

- An eligible finalization adds one bounded one-shot Subagent request; finalizations without a preceding Agent draft add no model request.
- Accepted guidance becomes ordinary authored `book.style-profile` text with ChangeSet and Revision lineage. It can be edited, reviewed, or reverted through existing mechanisms instead of becoming hidden prompt state.
- Exact style-Revision binding deliberately turns concurrent style edits into a conflict. The author must review or rerun extraction rather than losing newer guidance.
- The project gains no new character, location, idea, or preference Asset type. Those concepts remain free-form strings until a demonstrated semantic operation requires stronger structure.

## Alternatives considered

- **Learn from every save** — rejected because intermediate saves, rejected output, and accidental edits are not author endorsement.
- **Let the Agent mark its own Revision final** — rejected because it collapses generation and approval authority.
- **Write inferred guidance directly into the style profile** — rejected because one model inference must remain reviewable and reversible.
- **Create a general preference or knowledge Asset graph now** — rejected because PR11 only needs bounded evidence and a visible Book Style Profile target; extra types would impose structure before user workflows justify it.

## Validation

Tests must cover schema-v4-to-v5 migration, idempotent finalization, exact parent-chain source discovery, no-candidate cases, candidate persistence/validation, stale style conflicts, explicit rejection, strict Subagent output, Remote bounds, and the chapter-header/drawer interaction. The `novel-studio` profile must still be isolated from default Web modes.
