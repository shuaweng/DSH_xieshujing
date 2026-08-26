# Agent Note: Explicit Novel analysis and composer placement

Status: implemented

English | [中文](2026-08-27-novel-explicit-analysis-and-composer-placement.zh.md)

## Problem

Opening the chapter-review drawer also started an expensive reviewer Subagent when no report existed, so inspection and execution were indistinguishable. Deterministic NOAI analysis used a small subset of the shipped Novel guard and missed common explain-first, perspective, and template-prose patterns. A selection reference always appended to the composer even when the author had placed the caret elsewhere. Revision-bound analysis reports were durable and visible in the workbench but absent from the model tool set, forcing authors to copy reports into chat.

## Decision

Opening the chapter-review drawer only reads an existing report for the exact chapter Revision. An empty drawer presents an explicit Start review action; an existing report presents an explicit Rerun action. Only either action flushes dirty prose and starts the reviewer. NOAI remains an immediate deterministic scan and uses the package-owned rule set derived from the maintained Novel guard; the analyzer version changes whenever report semantics change.

The conversation input service retains the live textarea selection for each Session. External reference producers ask the service to insert a structured reference at that selection. The input machine still owns the reference occurrence, undo unit, serialization, and draft-revision check; the DOM layer reports selection changes and restores the resulting caret.

Analysis reports remain Revision-bound derived artifacts, not authored Novel Assets. The read-only `novel_get_analysis` tool resolves canonical Asset references and returns persisted chapter-review or NOAI reports for those exact Revisions. Reports are not silently added to a Context Manifest, do not appear in authored-asset search, and cannot be modified through Novel tools.

## Alternatives considered

**Generate review when the drawer opens.** Rejected because a navigation gesture starts model work, incurs latency and cost, and can overwrite the current report without an explicit author action.

**Append every external reference to the draft.** Rejected because it breaks sentence composition and makes authors manually move each reference.

**Expose reports as ordinary typed Assets.** Rejected because reports are derived from one exact Revision and have separate replacement and provenance rules; treating them as authored files would mix analysis history with author-controlled material.

**Automatically inject the latest report into every prompt.** Rejected because unrelated turns would pay a context cost and could receive a report for the wrong Revision. Explicit tool reads are retained in Session history and keep report selection observable.

## Consequences

Authors can inspect a review panel without starting work, choose when to review, place references where they are writing, and ask the Agent to read a persisted report by exact chapter Revision. The broader deterministic rule set produces more findings and therefore requires explainable categories, bounded output, and a version change rather than pretending to be a probabilistic authorship detector. Client input selection becomes shared state because reference producers cannot otherwise honor the live caret without querying another plugin's DOM.
