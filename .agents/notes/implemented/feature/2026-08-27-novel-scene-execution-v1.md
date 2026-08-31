# Agent Note: Novel scene execution and native decisions

Status: implemented

English | [中文](2026-08-27-novel-scene-execution-v1.zh.md)

## Problem

Novel Studio can compile exact chapter context, load writing Skills, create chapters, and propose Revision-bound ChangeSets. A direct `chapter outline -> prose` path is appropriate for ordinary scenes, but key confrontations, reveals, emotional turns, and ending hooks can have several materially different dramatic actions. Committing to prose before comparing those actions spends tokens on the wrong level of uncertainty and can produce natural sentences without a meaningful change in the scene.

Generation lineage also needs to distinguish direct writing from prose produced after an Agent or author decision. Model-supplied strategy names, option counts, and selected indexes are not reliable evidence: the model can mistype, invent, or reuse them without a real choice having occurred.

## Decision

`chapter-execution` and `scene-drive` derive a short request-local execution draft from the freeform chapter outline, confirmed Story State, book style, and only the necessary prior prose. The draft captures scene purpose and POV, start state, required change, information boundaries, intended reader effect, ending momentum, and nearby repetition to avoid. It is not a new Asset, a mandatory author form, or another permanent context item.

Ordinary, well-specified scenes proceed directly. Chapter openings, core confrontations, reveals, major emotional turns, payoffs, ending hooks, explicitly requested alternatives, and genuinely uncertain scenes can submit exactly two or three short dramatic actions to `novel_choose_scene_action`. Options differ in character action, resistance, and resulting change rather than wording. The default remains one prose result after the decision.

The choice stays inside the DSH Agent loop. Author-owned selection calls the existing `ctx.userQuestions` capability, so the normal Composer takeover displays the options, pauses the root Agent tool call, records the answer, and resumes it. Agent-owned selection uses the same Novel tool without a human pause. A delegated Subagent can report options but cannot ask the author or lend a decision call to its parent. Free-text “Other” feedback asks the Agent to replan and does not authorize an option.

The successful choice tool call and result are durable Session events. A later `novel_create` or `novel_propose_changes` cites the choice call id through `scene_decision_call_id`; it does not submit a strategy, option count, or selected index. A writing method remains active across turns while it is the most recently loaded Skill in the Session; loading a different Skill supersedes it. The choice tool therefore reuses an applicable earlier `chapter-execution` or `scene-drive` method instead of requiring duplicate Skill injection. For an existing chapter, it compiles the supplied exact Revision into a fresh chapter-write Context Manifest and defers that model-visible frame before prose generation. The Host accepts the decision id only when the successful result and final mutation belong to the same current Session turn, refreshed Manifest, active writing Skill, Novel Project, and exact target Asset Revision. A choice for an existing Revision cannot authorize creation of a new Asset, and a choice for a new Asset cannot authorize an existing-Asset proposal.

The Host derives `action-options-user-selected` or `action-options-agent-selected`, the bounded option count, and the one-based selected index from durable tool-result metadata. `NovelGenerationLineage` retains those coordinates and the decision call id with the existing Session, model route, Preset, Skill, Context Manifest, and policy provenance. The option prose remains in the Session event and is not copied into the Revision or context manifest. Direct writing omits the decision id and retains the `direct` strategy.

History schema version eight stores lineage in nullable `generation_json` columns. The proposed ChangeSet retains the lineage, and an applied `agent-apply` Revision inherits it. Existing history remains compatible: Repository validation still reads legacy PR15 non-direct records without a decision id, while the PR17 Novel tool creates no new non-direct record without one.

## Scope boundaries

- No Scene database, permanent Scene Contract Asset, second context store, or novel-specific interaction state machine exists.
- No multiple-full-draft default, candidate manager, quality score, structured Review Issue lifecycle, or A/B preference engine exists.
- No option prose enters ordinary Novel context. Only the selected decision coordinates enter lineage.
- The model still publishes authored changes only through the existing typed creation or ChangeSet review flow.

## Verification

- Tool tests cover native author selection, Agent selection, free-text replan feedback, fabricated call ids, and target-bound decision reuse.
- Repository tests retain validated decision lineage through proposal, apply, Revision listing, and history migration.
- A real Loader composition boots `userQuestions`, the generic tool runtime, and `tool-novel` from `cordis.yml`, proving the packaged scene-decision schema resolves through product composition rather than a unit-only context.
- Bundle tests parse both packaged writing Skills at version two and pin their use of the native choice tool and decision call id.
- Focused TypeScript and Vitest checks cover this path. Browser automation remains outside this change; manual product verification exercises the existing generic question UI.

## Alternatives considered

**Generate prose directly for every scene.** This remains the ordinary fast path, but making it universal leaves dramatic action, resistance, information release, and state change implicit exactly where alternatives matter most.

**Let the model send strategy and selection coordinates with the final write.** This is simpler but cannot prove that the author saw an option or that any real comparison occurred. Durable DSH tool events provide evidence the Host can validate.

**Persist every execution draft or option set as a Novel Asset.** Permanent Scene Contracts add author-visible structure and context growth before the temporary execution shape has proved stable.

**Build a Novel-specific choice drawer and state store.** A second interaction system would duplicate DSH cancellation, resume, Session ownership, and replay semantics. `ctx.userQuestions` already owns that capability.

**Generate several complete prose candidates by default.** Full alternatives spend substantially more tokens and create review burden; short action choices concentrate exploration on the decision that changes the scene.

## Consequences

Key scenes gain a deliberate action decision without slowing ordinary writing or forcing authors into a rigid outline schema. Author choices are visible through familiar DSH interaction, replayable in the Session, and safely bound to the exact write they authorize. Lineage remains small and independent of manuscript length, while future preference analysis can distinguish author-selected, Agent-selected, and direct results from verified coordinates. The system gains no guarantee that the chosen action produces better prose; that judgment still belongs to the author and later quality work.
