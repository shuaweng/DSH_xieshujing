---
description: "Human-and-Agent Novel Studio UI for browsing, editing, reviewing, restoring, and contextualizing typed Assets."
kind: "package-reference"
---

# @deepseek-ai/dsh-experimental-novel-workbench

English | [中文](README.zh.md)

## Summary

This experimental Client Consumer contributes **Xieshujing**, an Agent-native Novel Studio surface, to the shipped DSH shell: typed authored Assets, a registry-driven canvas, compact exact Agent references, conversation, and reviewable ChangeSets in one preset-scoped workbench.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="behavior"></a>
## Behavior

- The shipped `ui-layout` remains the sole root and layout-service owner. This package contributes a pure `novel` surface to its selector-routed `shell.workbench` chain and declares `novel.explorer` plus `novel.canvas` only beneath that elected surface. No cross-plugin React component import or competing root is used.
- The whole workbench is preset-scoped. Only an exact `novel-workbench` choice receives the icon-only Novel Studio toggle in `conversation.input.left`, beside the native access/plan controls; its accessible name and hover title retain the full action label. A started Session reads its committed summary, while a blank Composer reads the same read-only staged selection as the Agent-preset chooser. The Session still starts in the ordinary DSH frame; the author can open or close the workbench without changing preset or authored data. Switching to any other preset immediately restores the ordinary frame and removes the toggle.
- The desktop composition places the Agent conversation on the left and the manuscript explorer plus authored canvas on the right, while preserving the native collapsible DSH Session sidebar at the outer edge. An accessible drag separator (also adjustable with arrow keys) previews a CSS track at animation-frame cadence and commits one clamped width on release, so the authored workbench does not re-render for every pointer event.
- The native DSH sidebar remains available and can collapse or expand for session search and navigation. Switching Sessions does not replace the elected Novel surface; changing to an ineligible preset closes it.
- The elected surface opens on a minimal library home. It reuses the native DSH Workspace registry to discover Novel Projects across unrelated folders, skips ordinary Workspaces, and shows book count, current manuscript characters, local-day net character growth, one continue-writing target, and the book list. The header has no account affordance; **New novel** returns to the native DSH new-Session/Workspace flow. Every book uses one package-owned generated cover ground with its live title overlaid, and the optional `novel.yaml` `description` replaces a fabricated progress meter. Opening a row calls native `connectWorkspace()` (which reuses an eligible blank conversation or creates one), opens that Session, and then lets the existing explorer resolve the stable chapter id. Failures remain visible on the home instead of becoming rejected click promises. No separate Novel-library database or whole-disk scan exists.
- Xieshujing's B5 visual identity is package-owned PNG artwork: a pen-nib-tailed whale, Ink Navy and Warm Paper palette, a transparent horizontal lockup, sized marks for the Composer and explorer, an application icon, a restrained home hero, and the shared default cover ground. The library home carries the hero at low contrast, the explorer uses the horizontal lockup, and the Composer toggle uses the small application icon. These assets change presentation only and add no model input.
- The explorer discovers the active Session's Novel Project, presents a logical Book guidance group plus stable Manuscript and Book Outline → Volume Outline branches (including empty branches), creates editable chapters and missing project-singleton Book guidance Assets, opens exact Revision-bound typed Asset documents, and can collapse independently from the DSH Session sidebar. The canonical Book Outline stays Agent/tool-owned and singular; each visible Book Outline offers a scoped Volume Outline action beneath it. Existing externally authored singleton conflicts remain visible and deletable for recovery instead of taking down the whole explorer. Deletion uses a workbench-owned, theme-aware confirmation dialog and retains authored files plus history. Manuscript chapters support native drag reordering with an optimistic preview, authoritative Remote confirmation, and rollback on failure. Hierarchy comes from semantic type and parent ids rather than file paths.
- When the exact Session root has no `novel.yaml`, the explorer and Context Tray enter a neutral uninitialized state and issue no Asset or context-workset requests. The canvas asks for a book title plus an optional concise synopsis, initializes through the same Remote/Repository operation available to the Agent tool, and then refreshes into the normal Asset surface; malformed existing manifests remain explicit errors.
- `ctx.novelAssetRenderers` owns effect-scoped exact-type editor, selection-description, optional reader-presentation, and Diff contributions. Keystrokes update only the browser-local dirty draft; they do not call the Repository or create durable Revisions. The shared canvas publishes that draft only at an explicit Save or a semantic Context Commit Barrier such as reference, analysis, finalization, or Revision navigation. It refuses an Asset whose renderer is absent instead of presenting a misleading generic editor.
- The shipped manuscript renderer edits a chapter title and body in one guarded Revision save, captures simple UTF-16 ranges, counts non-whitespace authored characters, and opts into a full-height centered paper surface. The workbench-wide bottom bar and its six coordinated skins/typeface/font-size controls are shared by every Asset renderer; only chapters add character count and the chapter-outline action.
- The workbench-wide bottom bar opens a Skills drawer for author-visible Skills contributed by the current Novel Preset. Each toggle writes a per-Session complete disabled set: a disabled Skill disappears from the Agent's next Skill Catalog, cannot be loaded through the `skill` tool or explicit invocation, and remains available in other conversations.
- The chapter header lists immutable Revisions with their origin and timestamp. Opening a historical Revision keeps the same renderer and analysis controls but makes title/body read-only. **Restore this version** opens a same-renderer current-versus-selected comparison and requires explicit confirmation; success creates a new current Revision, labels its restore lineage, reports stale proposed ChangeSets that became conflicted, and warns chapter authors to review Story State instead of rolling Canon back silently.
- Chapter-only review and `NOAI` actions live in the bottom bar. Each opens a right drawer for the exact displayed Revision. NOAI runs a deterministic scan immediately; opening review is inert and shows any existing report, and only the explicit **Start review** / rerun action starts the fixed read-only reviewer. One successful report per kind is retained for each Revision, so moving through history also moves through its matching reports.
- The chapter header can mark the exact Revision on screen final. An eligible Agent-draft/author-final comparison opens a preference drawer with before/after evidence; the candidate changes nothing until the author accepts it into the exact Book Style Profile through a ChangeSet. Rejection remains auditable.
- `@deepseek-ai/dsh-experimental-novel-asset-outline` contributes freeform `planning.outline` and `planning.chapter-outline` renderers. Book guidance and planning Assets default to rendered Markdown reading views and switch explicitly to unrestricted source editing with exact text selection/Diff. A ChangeSet may preview one title change together with one body change. The manuscript status bar places the supplied chapter-plan icon immediately before skin controls; it opens a right drawer bound one-to-one to the current chapter, where authors can freely write, save, or reference a Chapter Outline. The practical emotion/hooks/rhythm/four-beat starter is optional and inserts ordinary editable Markdown.
- Agent-created Assets return a replayable creation card and refresh the authoritative explorer. Human and Agent creation both use the same typed Remote/Repository path; neither invents a filesystem path.
- The Novel Agent can call `novel_present` with `open-workbench` or `close-workbench`. Its durable tool-result metadata drives the same browser-local `ctx.layout` selection as the Composer toggle; ordinary Agent prose never controls layout and presentation never mutates an Asset.
- “Reference selection to Agent” first saves a dirty typed draft, stops safely if that save fails, then freezes the selection. Composer inserts the visible reference at the current caret or replaces the current Composer selection instead of appending it. It displays only `@[the first ten characters…]`; its hidden occurrence retains the complete canonical `dsh-novel:` mention and serializes that exact value for the Agent on submit.
- The preset-scoped `conversation.input.dock` adds a compact coordinate tray aligned to the Composer. Its live follow item stores the visible Asset identity and resolves the current saved head when the next task compiles; pinned search results remain exact Revision coordinates. Returning to the library home replaces automatic Asset follow with a bounded, replayable snapshot of the visible totals and at most 24 book summaries, while preserving same-project explicit pins. That snapshot grants no access to another Book's Assets. A dirty editor still points at the last saved head and visibly asks for save. Explicit selection references separately send the canonical exact coordinate plus the full selected text.
- `novel_propose_changes` tool results render a durable inline Diff card. Accept and Reject call Session-owned Remote methods; Accept refreshes the explorer and canvas from authoritative repository state.
- The workbench resolves the conversation service lazily after its slot owner mounts, avoiding a client-plugin dependency cycle while still using DSH's ordinary Composer draft state.

<a id="model-experience"></a>
## Model Experience

### Workbench presentation

#### What the model sees

The Client package adds model content only through the visible Context Tray contract. Explicit mentions, Asset follow/pins, and the bounded library-home summary are inputs to `@deepseek-ai/dsh-experimental-novel-context`; its explicit task policy decides whether Asset references stay coordinates or gain bounded related material in the frozen V3 Manifest. Model proposals and explicit report reads are provided by `@deepseek-ai/dsh-experimental-tool-novel`. Opening chapter review uses no model; clicking Start review launches a bounded reviewer. Marking an eligible Revision final launches a separate bounded preference worker. Clicking NOAI uses no model.

#### Token effect

The layout, editor, controls, short reference label, tray chrome, and review card add no tokens. Workset coordinates and the capped library summary add bounded metadata; only explicit referenced text and stable Novel tool schemas add variable request content.

#### KV Cache effect

Opening assets, editing drafts, and reviewing ChangeSets do not change the model tool catalog or system prompt. Changing a Skill toggle appends durable per-Session settings and causes the next eligible pre-step to publish a replacement Skill Catalog; it does not alter tool schemas or another Session.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **Six shipped renderers** — the canvas installs `manuscript.chapter`; the planning package adds `planning.outline`, `planning.chapter-outline`, `book.brief`, `book.style-profile`, and `book.story-state`. Characters, ideas, scenes, timelines, relations, and multiple editor tabs are deferred.
- **No live file events** — the explorer refreshes after in-workbench applies and repository calls reconcile external edits; there is no filesystem watcher or browser invalidation stream.
- **One active text selection** — exact Asset pins, read-only historical Revisions, and explicit restore-as-new-head now exist, but pinned selections, multi-selection, block ids, annotations, named snapshots, and Revision deletion are deferred.
- **Desktop-first layout** — mobile layout, route-level multi-workbench switching, persisted panel geometry, and cross-browser synchronization of the transient open state are deferred.
- **Composed library summaries** — the homepage currently composes existing per-Session Repository reads. A dedicated Repository summary projection can later reduce reads without changing Workspace ownership or creating another registry. Only DSH-registered Workspaces with at least one retained Session are discoverable.
- **Basic text editor** — rich Markdown editing, syntax decorations, autosave cadence, import/export, and publishing views are deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
