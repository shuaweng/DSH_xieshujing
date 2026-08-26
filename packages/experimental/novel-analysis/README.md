# @deepseek-ai/dsh-experimental-novel-analysis

English | [中文](README.zh.md)

## Purpose

This experimental Host service owns exact-Revision chapter analysis and explicit finalization learning for Novel Studio. It combines a deterministic Chinese web-fiction style scan, a fixed read-only reviewer, and a fixed draft/final preference extractor while persisting only validated reports and reviewable candidates through `ctx.novelRepository`.

## Behavior

- `scanChapter()` reads one retained `manuscript.chapter` Revision, runs bounded deterministic rules without a model, and upserts one `noai-scan` report for that exact Revision.
- `reviewChapter()` freezes the requested chapter plus bounded Chapter Outline, Book Brief, Book Style Profile, and current workset references. It starts a fresh one-shot Subagent with a read-only persona, `maxDepth: 1`, only the `skill` tool, and a strict structured-output schema.
- The reviewer loads the package-owned `chapter-review` Skill and scores plot, causality, character, pacing, hook, and style with evidence-bound findings. Authored material is explicitly marked untrusted and cannot widen worker authority.
- A report is written only after the worker completes and the service validates every field and bound. A failed rerun leaves the previous successful `(project, asset, revision, kind)` report intact; a successful rerun replaces that one row.
- `candidateWarning()` materializes a proposed chapter ChangeSet in memory and runs the same deterministic scanner. Material risk returns bounded advisory text for the caller to add to the current model turn; it does not persist a report or create another ChangeSet.
- `finalizeChapter()` first retains the user's explicit decision for one exact chapter Revision, finds the nearest `agent-apply` ancestor, and starts a fresh one-shot preference worker only when an author edit actually follows that Agent draft. The worker compares bounded exact Revision text plus the current exact `book.style-profile` and can only return a strict inert candidate with evidence.
- `acceptPreference()` appends author-reviewed guidance to the exact style-profile Revision through the normal ChangeSet apply and crash-recovery protocol. `rejectPreference()` records a terminal decision without changing authored content. Save, review, scan, and Agent tool paths never finalize automatically.

## Model Experience

### Chapter review and finalization workers

#### What the model sees

Only the dedicated reviewer sees the frozen exact-Revision chapter and bounded related Assets. Only the dedicated preference worker sees the exact Agent draft, exact user-final Revision, and exact current Book Style Profile. Both workers have fixed read-only personas, only the `skill` tool, and strict output contracts. The root Agent sees deterministic candidate warnings only when a proposed chapter crosses the configured threshold.

#### Token effect

Deterministic NOAI scans use no model tokens. A requested chapter review spends one bounded Subagent request plus the on-demand `chapter-review` Skill body. An eligible explicit finalization spends one bounded preference-worker request; finalizations without a preceding Agent draft spend no model tokens. Candidate warnings add at most five findings to the current turn.

#### KV Cache effect

The analyzer adds no dynamic tool schemas or system-prefix content. Frozen review material belongs to the child request, while candidate feedback is a logged deferred context after the proposal tool result.

## Known Limitations and Deferred Work

- **Heuristics, not authorship detection** — NOAI reports identify editable template-language candidates; they neither prove AI authorship nor replace editorial judgment.
- **One report per kind and Revision** — successful reruns replace the same kind instead of retaining report-run history.
- **Chapter-only** — deterministic scan and reviewer currently require `manuscript.chapter`; book-wide, multi-chapter, character, and outline reviews are deferred.
- **No autonomous preference promotion** — candidates remain inert until the author accepts them; one finalization never silently rewrites the Book Style Profile.
- **No preference retrieval or training** — accepted guidance is ordinary authored style-profile text. Preference RAG, ranking, fine-tuning, and cross-book author profiles are deferred.
