# Agent Note: Novel Scene Execution V1 and bounded generation lineage

Status: implemented

English | [中文](2026-08-27-novel-scene-execution-v1.zh.md)

## Problem

Novel Studio could already compile exact chapter context, load writing Skills, create chapters, and propose Revision-bound ChangeSets. The writing path was still mostly `chapter outline -> prose`, however, so a structurally valid result could miss the actual dramatic action: who tries what, how resistance answers, what information is released, and what changes by the end of the scene.

The retained Revision also did not say which model route, Preset, writing Skill, frozen Context Manifest, or generation strategy produced an Agent proposal. Later preference and quality work therefore could not distinguish a direct draft from prose produced after comparing several scene actions without reconstructing an entire Session trajectory.

## Decision

`chapter-execution` and `scene-drive` now derive a short request-local execution draft from the freeform chapter outline, confirmed Story State, book style, and only the necessary prior prose. The draft captures scene purpose and POV, start state, required change, information boundaries, intended reader effect, ending momentum, and nearby repetition to avoid. It is not a new Asset, a mandatory author form, or another permanent context item.

Ordinary, well-specified scenes proceed directly. Chapter openings, core confrontations, reveals, major emotional turns, payoffs, ending hooks, explicitly requested alternatives, and genuinely uncertain scenes may first produce two or three short action options. Options must differ in character action and dramatic response rather than wording. The author can select one, or authorize the Agent to compare character logic, continuity, information boundaries, repetition, tension, and future room before selecting. After selection the default remains one prose candidate, published only through the existing typed create or ChangeSet review flow.

The two writing Skills tell `novel_create` and `novel_propose_changes` which bounded strategy was used: direct, Agent-selected action options, or user-selected action options, plus a two-or-three option count and one-based selected index when applicable. The Host derives the rest from durable Session state rather than trusting model-supplied provenance:

- Agent Session and latest turn;
- effective provider/model request header;
- selected Agent Preset;
- latest successfully loaded Skill and its package-owned version;
- current frozen Novel Context Manifest id and policy names.

This `NovelGenerationLineage` is stored with the proposed ChangeSet and inherited by the resulting `agent-apply` Revision. History schema version eight adds nullable `generation_json` columns and migrates versions one through seven in place. The record deliberately excludes prompts, action-option text, generated prose, reviews, and quality scores.

All package-owned Novel Skills now place `novelContextPolicy` under standard Skill `metadata`. This fixes policy discovery by the filesystem Skill registry; only `chapter-execution` and `scene-drive` introduce a PR15 Skill version.

## Scope boundaries

- No structured Review Issue type, lifecycle, repair API, or issue-centric UI was added.
- No literary score, quality metric, evaluation corpus, A/B candidate UI, or browser workflow was added.
- No permanent Scene Contract Asset was added. The execution draft is temporary and can later move behind a typed compiler seam without changing current Assets or V3 Context Manifest replay.
- Multiple full prose candidates remain opt-in; Scene Execution V1 spends alternatives on short action decisions and defaults to one authored result.

## Verification

- Repository tests retain one validated lineage record across proposal, apply, Revision listing, and schema migration to version eight.
- Novel tool tests prove provider/model, Preset, Skill version, Context Manifest, and action-option coordinates are derived and validated, including rejection of incomplete option coordinates.
- Bundle tests parse every packaged Skill frontmatter and verify that each context policy is exposed through standard metadata; the two scene-writing Skills expose version one.
- Targeted TypeScript builds and the focused repository, tool, and bundle suites pass. Browser automation was intentionally omitted; manual product verification is the handoff for this PR.

## Consequences

Scene execution is more deliberate without forcing authors into a rigid outline schema or adding persistent context bulk. Lineage is sufficient to compare future Skill and context strategies while remaining small and independent of manuscript length. It does not itself decide which strategy writes better prose; preference learning and any later evaluation system can use these coordinates only when the product has real author decisions to compare.
