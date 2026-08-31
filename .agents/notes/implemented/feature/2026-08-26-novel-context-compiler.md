# Agent Note: Task-aware Novel Context Compiler

Status: implemented

English | [中文](2026-08-26-novel-context-compiler.zh.md)

## Problem

The Novel workbench already records explicit selections and a visible follow/pin workset, but every direct turn receives the same shallow treatment. Writing, outline editing, style rewriting, chapter review, and finalization learning need different material. Letting every Skill rediscover those Assets with `novel_list` and `novel_get` is repetitive and inconsistent, while injecting the book brief, style profile, every outline, and every pinned Asset into every turn creates hidden context growth.

The version-one workset also stores an exact Revision for `follow`. After a guarded save, a missed browser update or refreshed tab can retain that old Revision even though “follow current view” promises live identity rather than a historical pin.

## Decision

Add a Host-owned `NovelContextResolver.compile()` boundary. Callers must name a closed task policy and exact target; the compiler never infers policy from natural-language prose. Version one policies are `direct-turn`, `chapter-write`, `selection-rewrite`, `selection-review`, `outline-edit`, `chapter-review`, and `preference-learning`.

Each policy expands only deterministic relationships already represented by typed Assets. Chapter writing and review can materialize the exact target chapter, its chapter outline, book brief, and book style while retaining the root book outline as a coordinate. Selection work materializes the selected text and book style, with the brief as a coordinate. Book/volume outline work may materialize its parent and brief while retaining children as coordinates; chapter-outline work may materialize the book outline and brief while retaining its manuscript parent as a coordinate. Preference learning uses only its explicitly supplied draft, final, and style Revisions. Project-global assets are not always-on prompt text.

The compiler deduplicates identical exact coordinates while preserving distinct selections. Required task material is ordered before optional context, and a required selection or projection prevents a lower-priority optional copy of the same Asset/Revision from broadening it. The compiler caps the final reference set and applies a UTF-8 authored-text budget. Required material fails closed when it cannot fit. Optional material degrades to a canonical coordinate rather than being truncated or silently omitted. The result is one version-three Context Manifest containing the selected policy, exact Revision, type, projection, reason, content hash, model-text byte count, and model-text hash. The exact rendered frame enters the receiving Session as model-visible text, so replay never rereads mutable heads.

Novel Skills declare one `novelContextPolicy` in their ordinary metadata. An explicit `/skill-name` turn compiles that policy immediately. When the model loads a Skill with the standard `skill` tool, the following step compiles its declared related material; prose already materialized in the first-step Manifest is represented only by its coordinate, preventing duplicate chapter or selection text. Fixed chapter-review and finalization-learning Subagents consume the same compiler output instead of maintaining private context assembly rules.

The workset advances to version two. `follow` now stores only project, Asset identity, and label; the Host resolves its current head when compiling a prompt. `pinned` continues to store an exact Revision and optional selector. Existing version-one events remain readable and are normalized to version two on the next replacement. This supersedes the follow-Revision decision in [Novel context workset and bounded Asset search](2026-08-24-novel-context-workset-and-search.md); explicit and pinned references remain frozen exactly as before.

## Boundaries

- The compiler selects existing authored Assets; it does not create Story State, infer facts from prose, summarize mutable heads, rank embeddings, or decide what the user meant.
- UI focus remains coordination state. A follow pointer is live until prompt compilation; every compiled Manifest is immutable.
- Skill metadata selects a policy but cannot widen repository, tool, Subagent, or sandbox authority.
- Context budgeting is observable through projection and reason fields. Coordinates remain available for later explicit `novel_get` reads.
- Review and preference workers receive the compiler's exact text inside their own child Session prompt; browser state itself is never inherited.

## Alternatives considered

**Always inject the book brief and style.** This spends tokens on unrelated questions and makes it harder to explain why a result used a given rule.

**Let each Skill call discovery tools.** Tool reads remain useful for novel exploration, but requiring every fixed workflow to rediscover the same deterministic relations duplicates policy and produces inconsistent replay records.

**Classify the user's prose into a task automatically.** The first compiler deliberately avoids a hidden intent model. Explicit Skill choice and fixed workflow entry points are stable, testable policy selectors.

**Precompute one permanent context pack per chapter.** Packs become stale and duplicate authored truth. The compiler instead resolves current heads at the task boundary and freezes the exact result.

## Consequences

Ordinary direct turns remain lean: explicit selections are materialized, while follow and pinned workset items are coordinates. Loading or explicitly invoking a Novel Skill adds only that task's declared related material. Chapter review and preference learning now share the same selection, deduplication, budget, hashing, and replay contract as root-agent work.

The compiler remains replaceable. Later work can add Story State, summaries, retrieval scoring, per-model token budgets, or additional Asset policies behind the same explicit request and V3 Manifest seam without changing workbench references or allowing unlogged model context.

## Testing

Focused tests cover legacy workset migration, live follow resolution after a new Revision, policy expansion, exact deduplication, deterministic Manifest identity, optional-material coordinate degradation, required-material budget failure, explicit Skill policy selection, model-loaded Skill continuation without prose duplication, fixed review/finalization compiler use, Remote V2 contracts, Context Tray behavior, and Novel Studio Skill metadata.
