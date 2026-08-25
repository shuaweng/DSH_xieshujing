# Agent Note: Revision-bound chapter analysis

Status: implemented

English | [中文](2026-08-25-revision-bound-chapter-analysis.zh.md)

## Problem

The Novel Workbench can author and propose changes to chapters, but it cannot yet answer two durable questions: which exact manuscript Revision was assessed, and whether a later assessment supersedes an earlier run over the same bytes. A free-floating review in conversation history becomes misleading as soon as the author edits the chapter. The existing Novel preset also owns a deterministic style scanner, but neither authors in the workbench nor the proposal tool can reuse its findings as a typed, Revision-aware product surface.

The workbench also exposes only the current file head. Without retained-Revision navigation, review reports and rewritten chapters cannot be inspected as one coherent history. Letting an old snapshot become editable would bypass the current-base guard and turn historical browsing into an implicit branch operation.

## Decision

Add Revision-bound analysis as a derived history domain beside immutable `asset_revisions`:

- `analysis_reports` is authoritative for generated analysis output, never for authored prose;
- every row is keyed by `(project_id, asset_id, revision_id, report_kind)` and references a retained Revision;
- the first report kinds are `chapter-review` and `noai-scan`;
- a successful rerun over the same key atomically replaces the previous generated report, while a failed or cancelled run leaves the previous report intact;
- reports record analyzer version and generation time, plus source and worker Session identities when a Subagent generated them;
- deleting the derived report database never changes authored Markdown, but unlike the search index it is not silently regenerated because review output may have model cost and historical value.

Expose retained Revision summaries and exact reports through `NovelRepository`. Reading an old Revision stays exact and immutable. The workbench may select it from the chapter header, quote it, scan it, and review it, but title/content save controls are disabled until the user returns to the current head. Branching or restoring old content is outside this change.

Introduce a `novelAnalysis` Host service. Its deterministic NOAI scanner accepts exact manuscript model text and emits bounded JSON findings with source offsets, category, severity, evidence, and suggested direction. Clicking `NOAI` in a chapter status bar flushes the current dirty head first, then scans and upserts the report for the resulting exact Revision without invoking a model.

Chapter review starts one fixed, one-shot Subagent with a strict structured-output contract. The coordinator freezes the requested chapter Revision and supplies relevant exact chapter outline, book brief, style profile, and pinned Novel references when available. The worker is read-only, has no write or ChangeSet tools, and is instructed to use the shipped `chapter-review` Skill. A valid completion is normalized and then upserted; invalid, interrupted, or cancelled output is not persisted. The report drawer shows the report for the Revision currently on screen, never a report for “latest” by implication.

After `novel_propose_changes` validates and materializes a candidate `manuscript.chapter`, it asks `novelAnalysis` for a deterministic candidate scan. Material findings are attached through the tool execution's deferred model context, so the warning is logged and becomes visible to the proposing Agent only after the proposal succeeds. Candidate scans are not persisted because a ChangeSet candidate is not an Asset Revision. This feedback is advisory: it must not reject, mutate, or auto-apply the proposal.

The chapter status bar adds Review and NOAI actions beside the existing chapter-plan action. Both reuse a Revision-aware analysis drawer. Non-chapter Assets keep global skin and typography controls but do not expose chapter analysis actions.

## Alternatives considered

**Keep reviews only in the Session Log.** The Session records execution provenance but cannot provide one current report per exact chapter Revision across Sessions.

**Store reports inside Markdown Frontmatter.** Generated findings would create noisy authored diffs and mix derived output with the user's source of truth.

**Run the model for AI-style detection.** The existing checks are deterministic and should remain fast, reproducible, and free of model cost. A later semantic reviewer may complement them under a separate report kind.

**Allow editing an old Revision directly.** That hides a branch/restore decision inside ordinary save behavior and defeats optimistic concurrency. Historical views remain read-only.

**Reject proposals that trigger NOAI findings.** Style heuristics are fallible. The Agent must see and reason about the warning, while the user's proposal remains reviewable.

## Testing

- History schema migration is monotonic and creates strict Revision-bound report storage without changing authored files.
- Revision summaries are deterministically ordered newest first, and an exact old Revision can be opened after restart.
- At most one successful report of each kind exists for one exact chapter Revision; a successful rerun replaces it and a failed rerun preserves it.
- NOAI scanning is deterministic, bounded, model-free, and reports insufficient samples without pretending they are clean.
- Chapter review uses a fixed read-only one-shot Subagent, a shipped Skill, frozen context, strict structured output, and durable source/worker provenance.
- Review and NOAI buttons analyze the exact Revision shown in the workbench; dirty current content is saved before analysis.
- Historical content and title controls are read-only, while returning to the current head restores normal editing.
- `novel_propose_changes` adds a logged, deferred warning for material candidate findings without changing ChangeSet persistence or apply authority.
- Non-Novel Profiles remain unchanged, and the Novel workbench remains eligible only under the existing `novel-workbench` preset gate.
- Focused repository, migration, scanner, coordinator, tool, remote, client, composition, type, lint, docs, and keyless browser checks pass.

## Consequences

Authors can now inspect prose, analysis, and provenance as one exact-Revision history, while deterministic NOAI scans remain fast and model-free. The cost is a new durable history table and a fixed review orchestration seam that deployments must compose with a compatible Subagent provider.

Heuristic style findings can be noisy, so evidence and severity remain inspectable and cannot become an automatic gate. Model review can vary between runs; replacement is intentional only within the same Revision and report kind, and its analyzer version remains visible. Reading historical Revisions increases retained-history importance, so corrupt or missing rows fail closed rather than falling back to current files. The first version has no named report archive per Revision and no manuscript branching; those require separate product decisions.
