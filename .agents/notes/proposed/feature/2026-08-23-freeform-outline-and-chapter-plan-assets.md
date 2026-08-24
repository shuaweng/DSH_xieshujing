# Agent Note: Freeform outline and chapter-plan assets

Status: proposed

English | [中文](2026-08-23-freeform-outline-and-chapter-plan-assets.zh.md)

## Problem

The first `planning.outline` slice stores a fixed YAML tree whose nodes expose `summary`, `goal`, `conflict`, and `turn` fields. That format proves the Asset Type Registry can support structured data, but it also turns one writing method into the only valid outline. Authors and Agents cannot use prose, tables, custom headings, beat lists, or a project-specific convention without first translating the idea into repository-owned fields.

Chapter plans have the same risk. Emotion targets, scene keys, hook distribution, rhythm ratios, and four-beat structures are useful prompts, not universal canon. Making them required fields would confuse optional writing guidance with durable data integrity.

The workbench also lacks a domain operation that creates a new Asset. An Agent can list, read, and propose changes to an existing outline, but it cannot create a book outline, volume outline, or chapter plan through the same typed boundary.

## Proposal

Replace the fixed outline tree with freeform Markdown assets. The repository constrains identity, type, parent relationship, nesting depth, revision, and mutation protocol; it does not constrain the author's internal outline notation.

`planning.outline` has two levels:

- a book outline has no parent outline;
- a volume outline has exactly one book outline parent.

Both levels contain one unrestricted Markdown body. A project may have multiple book outlines when the author wants alternatives, but a volume outline cannot contain another volume outline. The Explorer renders the parent relationship as a two-level tree; the editor is a writing surface rather than a field inspector.

Add `planning.chapter-outline` as a separate freeform Markdown Asset with exactly one `manuscript.chapter` parent. At most one current chapter-outline Asset may target a chapter. It is hidden from the main planning tree and opened from the manuscript status bar in a right-side drawer, so the author can consult or edit it without leaving the chapter. A user-invoked starter template may suggest core event, emotion target, scene key, hooks, rhythm, four beats, and continuity checks. The template is inserted text, not Schema, and an author or Agent may replace it completely.

Add a typed Repository creation operation and expose it as `novel_create`. The Asset Type definition owns creation validation and serialization; the Repository mints identity and a safe path below the registered content root, validates parent type and cardinality, publishes with `createIfAbsent`, and records the resulting Revision. The model supplies semantic type, title, optional parent Asset id, and typed content, never a filesystem path.

Creation is immediate because it adds a new recoverable file and cannot overwrite existing canon. Agent modifications to an existing outline or chapter plan remain proposal-only ChangeSets bound to a base Revision. `novel_get` supplies the exact freeform body and type-specific guidance; `novel_propose_changes` uses the same revision-bound text-range protocol as manuscript prose.

The authored file remains the current-content authority. A crash after file publication but before history insertion leaves a valid typed file; project reconciliation observes it and creates the missing Revision. Creation therefore does not require a cross-medium transaction or a new apply journal state.

## On-disk formats

A book outline is a Markdown file with version-one Frontmatter:

```markdown
---
novel:
  schema: 1
  id: outline_...
  type: planning.outline
  level: book
  title: 全书大纲
---

作者可采用任意 Markdown 结构。
```

A volume outline adds `parent` and uses `level: volume`. A chapter plan uses `type: planning.chapter-outline` and a `parent` naming the chapter Asset. The typed content values contain only the discriminator, outline level where applicable, and Markdown body. Frontmatter owns hierarchy; the body remains unconstrained authored text.

## Alternatives considered

**Keep the fixed goal/conflict/turn tree and add a free-notes field.** This still makes the repository's method primary and free writing secondary. Agents would continue optimizing for form completion instead of the author's planning language.

**Store the complete hierarchy inside one outline document.** This avoids parent references but makes a volume difficult to address, revise, open, or supply independently. Separate Assets give book and volume outlines their own stable identity and Revision while the Explorer reconstructs the two-level view.

**Encode chapter-plan methodology as required fields.** The suggested method is valuable for templates and prompts, but it is neither universal nor stable enough to be a persistence contract. Required fields would reject valid author- and Agent-designed formats.

**Let Agents create files through generic write tools.** This would bypass type validation, parent constraints, Revision creation, workbench invalidation, and safe path ownership. `novel_create` keeps creation inside the same domain boundary as reads and ChangeSets.

**Make Agent creation a proposed ChangeSet.** A multi-file creation proposal would require a broader journal and review model. Version one immediately creates only new, uniquely named Assets and retains ChangeSets for mutations that can overwrite current authored content.

## Acceptance criteria

- Book and volume outlines are freeform Markdown Assets and render as a two-level Explorer hierarchy.
- The workbench can create, open, rename, edit, save, and revision-check both outline levels without method-specific fields.
- `novel_create`, `novel_get`, and `novel_propose_changes` let an Agent create, read, and propose revision-bound modifications to both outline levels.
- Every chapter can open one freeform chapter plan in a theme-aware right drawer from the manuscript status bar; the optional starter template never affects validation.
- Agents can create, read, and propose modifications to a chapter plan by addressing its chapter parent.
- Default `web` and `headless` compositions do not load the capability.
- Real Novel Studio composition tests and a keyless browser snapshot cover creation, editing, context, proposal presentation, and the chapter-plan drawer.

## Risks

Freeform Markdown gives up field-level validation, field-level Diff, and automatic reasoning over canonical goal/conflict/turn properties. Search and later skills must interpret prose or opt into voluntary conventions. Stable Asset identity, parent relationships, immutable Revisions, exact selections, and ChangeSets remain machine-readable, so future structured planning types can coexist without re-constraining this one.
