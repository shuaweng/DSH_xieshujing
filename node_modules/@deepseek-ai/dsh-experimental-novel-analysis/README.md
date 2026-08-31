---
description: "Exact-Revision chapter scans, strict review, Story State extraction, and author preference learning for Novel Studio."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-novel-analysis

English | [中文](README.zh.md)

## Summary

This experimental Host service owns exact-Revision chapter analysis and explicit finalization learning for Novel Studio. It combines a deterministic Chinese web-fiction style scan, a fixed read-only reviewer, a draft/final preference extractor, and a finalized-prose Story State extractor while persisting only validated reports and reviewable candidates through `ctx.novelRepository`.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="behavior"></a>
## Behavior

- `scanChapter()` reads one retained `manuscript.chapter` Revision, runs bounded deterministic rules without a model, and upserts one `noai-scan` report for that exact Revision. The workbench rules are adapted from the maintained Novel preset guard and cover repeated exposition/emphasis, templated transitions and rhythm, abstract emotion, generic imagery/scenery, POV/camera leakage, Markdown residue, promotional vocabulary, and related explainable patterns while preserving exact editable offsets.
- `reviewChapter()` runs only after an explicit Start review or rerun action and rejects the request when the current Session has disabled `chapter-review`. It asks the Novel Context Compiler for the closed `chapter-review` policy, which freezes the requested chapter, deterministically related Chapter Outline / Book guidance, and the current workset under one exact V3 Manifest before the service starts a fresh one-shot Subagent with a read-only persona, `maxDepth: 1`, only the `skill` tool, and a strict structured-output schema.
- The reviewer loads the package-owned `chapter-review` Skill and must return all eight evidence-bound dimensions: plot, logic/continuity, character, pacing, hook, style, immersion, and AI-like patterns. Its prompt forbids courtesy praise and default high scores. The deterministic NOAI scan is included as bounded candidate evidence that the reviewer must confirm in context rather than copy mechanically. Authored material is explicitly marked untrusted and cannot widen worker authority.
- A report is written only after the worker completes and the service validates every field and bound. A failed rerun leaves the previous successful `(project, asset, revision, kind)` report intact; a successful rerun replaces that one row.
- `candidateWarning()` materializes a proposed chapter ChangeSet in memory and runs the same deterministic scanner. Material risk returns bounded advisory text for the caller to add to the current model turn; it does not persist a report or create another ChangeSet.
- `finalizeChapter()` first retains the user's explicit decision for one exact chapter Revision. When a project has a `book.story-state`, a fresh one-shot worker receives only that exact state Revision and finalized chapter under `story-state-learning`, then returns a complete evidence-bound replacement candidate. Independently, the service finds the nearest `agent-apply` ancestor and starts a preference worker only when an author edit actually follows that Agent draft.
- `acceptPreference()` appends author-reviewed guidance to the exact style-profile Revision through the normal ChangeSet apply and crash-recovery protocol. `rejectPreference()` records a terminal decision without changing authored content. Save, review, scan, and Agent tool paths never finalize automatically.
- `acceptStoryState()` replaces the exact Story State Revision through the same ChangeSet protocol. A stale target conflicts instead of rebasing silently; rejection records a terminal decision without mutating the authored state.

<a id="model-experience"></a>
## Model Experience

### Chapter review and finalization workers

#### What the model sees

Only the dedicated reviewer sees the V3 Manifest compiled for the exact-Revision chapter and its deterministic related Assets. The preference worker sees the exact Agent draft, user-final Revision, and current Book Style Profile. The Story State worker sees the exact finalized chapter plus the exact confirmed Story State it proposes to replace. All workers have fixed read-only personas, only the `skill` tool, and strict output contracts. Reports stay out of ordinary prompt context; the root Agent can explicitly retrieve persisted review/NOAI reports for an exact chapter Revision through `novel_get_analysis`.

#### Token effect

Deterministic NOAI scans use no model tokens. A requested chapter review spends one bounded Subagent request. An explicit finalization spends one bounded Story State request when that singleton exists, plus one preference request only when there is a meaningful Agent-draft/author-final diff. Candidate warnings add at most five findings to the current turn.

#### KV Cache effect

The analyzer adds no dynamic tool schemas or system-prefix content. Frozen review material belongs to the child request, while candidate feedback is a logged deferred context after the proposal tool result.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Heuristics, not authorship detection** — NOAI reports identify editable template-language candidates; they neither prove AI authorship nor replace editorial judgment.
- **One report per kind and Revision** — successful reruns replace the same kind instead of retaining report-run history.
- **Chapter-only** — deterministic scan and reviewer currently require `manuscript.chapter`; book-wide, multi-chapter, character, and outline reviews are deferred.
- **No autonomous preference promotion** — candidates remain inert until the author accepts them; one finalization never silently rewrites the Book Style Profile.
- **No autonomous canon promotion** — Story State is freeform author-confirmed Markdown. Extraction produces one inert complete-replacement candidate per finalized chapter Revision; it never edits Canon silently and does not retain repeated extractor-run history.
- **No preference retrieval or training** — accepted guidance is ordinary authored style-profile text. Preference RAG, ranking, fine-tuning, and cross-book author profiles are deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
