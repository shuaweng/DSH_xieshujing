# @deepseek-ai/dsh-experimental-novel-analysis

English | [中文](README.zh.md)

## Purpose

This experimental Host service owns exact-Revision chapter analysis for Novel Studio. It combines a deterministic Chinese web-fiction style scan with a fixed read-only Subagent reviewer and persists only validated reports through `ctx.novelRepository`.

## Behavior

- `scanChapter()` reads one retained `manuscript.chapter` Revision, runs bounded deterministic rules without a model, and upserts one `noai-scan` report for that exact Revision.
- `reviewChapter()` freezes the requested chapter plus bounded Chapter Outline, Book Brief, Book Style Profile, and current workset references. It starts a fresh one-shot Subagent with a read-only persona, `maxDepth: 1`, only the `skill` tool, and a strict structured-output schema.
- The reviewer loads the package-owned `chapter-review` Skill and scores plot, causality, character, pacing, hook, and style with evidence-bound findings. Authored material is explicitly marked untrusted and cannot widen worker authority.
- A report is written only after the worker completes and the service validates every field and bound. A failed rerun leaves the previous successful `(project, asset, revision, kind)` report intact; a successful rerun replaces that one row.
- `candidateWarning()` materializes a proposed chapter ChangeSet in memory and runs the same deterministic scanner. Material risk returns bounded advisory text for the caller to add to the current model turn; it does not persist a report or create another ChangeSet.
- Analysis never applies, saves, finalizes, or otherwise mutates an authored Asset.

## Model Experience

### Chapter review worker

#### What the model sees

Only the dedicated reviewer Subagent sees the frozen exact-Revision chapter and bounded related Assets, a fixed read-only persona, the `skill` tool, and the strict report contract. The root Agent sees deterministic candidate warnings only when a proposed chapter crosses the configured threshold.

#### Token effect

Deterministic NOAI scans use no model tokens. A requested chapter review spends one bounded Subagent request plus the on-demand `chapter-review` Skill body. Candidate warnings add at most five findings to the current turn.

#### KV Cache effect

The analyzer adds no dynamic tool schemas or system-prefix content. Frozen review material belongs to the child request, while candidate feedback is a logged deferred context after the proposal tool result.

## Known Limitations and Deferred Work

- **Heuristics, not authorship detection** — NOAI reports identify editable template-language candidates; they neither prove AI authorship nor replace editorial judgment.
- **One report per kind and Revision** — successful reruns replace the same kind instead of retaining report-run history.
- **Chapter-only** — deterministic scan and reviewer currently require `manuscript.chapter`; book-wide, multi-chapter, character, and outline reviews are deferred.
- **No finalization learning** — marking a Revision final and learning style preferences from draft/final diffs belong to PR11.
