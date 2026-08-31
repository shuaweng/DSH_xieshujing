# Agent Note: Novel Session Skill controls and strict chapter review

Status: implemented

English | [中文](2026-08-28-novel-session-skills-and-strict-review.zh.md)

## Problem

Novel authors need to see which reusable writing methods the active Novel Preset contributes and suppress methods that do not fit one conversation. A visual-only switch would be misleading because the Agent could still receive the Skill Catalog or load a disabled Skill. Chapter review also needs an editorial posture that searches systematically for defects instead of using courtesy praise and optimistic default scores.

## Decision

The Novel Workbench lists author-visible custom Skills from the active Agent scope in a bottom-bar drawer. Toggle state is a complete latest-wins disabled-name set stored as a durable `skill/activation` Session event. `@deepseek-ai/dsh-tool-skill` applies that state to catalog publication, model tool loading, and explicit user invocation, so one switch changes actual Agent capability for that Session without changing the Preset or another Session.

The fixed chapter reviewer refuses to run when `chapter-review` is disabled. When enabled, it returns exactly eight evidence-bound dimensions covering plot, logic and continuity, character, pacing, hooks, style, immersion breaks, and AI-like patterns. Its prompt forbids courtesy praise and default high scores. The deterministic NOAI scanner contributes a bounded evidence list, while the reviewer must confirm each candidate in context before reporting it.

## Alternatives considered

**Store activation globally in the Preset.** This would make one experiment affect every existing and future conversation, and it would turn a local writing choice into a configuration edit.

**Hide disabled Skills only in the workbench.** This would leave the model-visible catalog and loader executable, so the switch would communicate a false guarantee.

**Treat deterministic NOAI findings as review conclusions.** This would be reproducible but unable to distinguish intentional voice from a harmful template pattern; the scanner remains evidence rather than the final editorial judgment.

**Ask the reviewer to be harsher without changing its output requirements.** Tone alone does not require coverage, so the service validates the complete eight-dimension result and rejects missing or duplicate dimensions.

## Consequences

Skill activation is append-only Session history and may cause the next eligible pre-step to append a replacement Skill Catalog. Re-enabling a Skill does not erase older catalog messages, but only the newest catalog governs subsequent use. New Skills default to enabled.

Chapter review spends the same single bounded Subagent request plus a deterministic local scan. The stricter schema can reject incomplete reviewer output instead of persisting a partial report, and existing six-dimension reports remain readable by the workbench.
