# @deepseek-ai/dsh-experimental-novel-workbench

English | [中文](README.zh.md)

## Purpose

This experimental Client Consumer contributes an Agent-native Novel Studio surface to the shipped DSH shell: typed authored Assets, a registry-driven canvas, compact exact Agent references, conversation, and reviewable ChangeSets in one preset-scoped workbench.

## Behavior

- The shipped `ui-layout` remains the sole root and layout-service owner. This package contributes a pure `novel` surface to its selector-routed `shell.workbench` chain and declares `novel.explorer` plus `novel.canvas` only beneath that elected surface. No cross-plugin React component import or competing root is used.
- The whole workbench is preset-scoped. Only an exact `novel-workbench` choice receives the icon-only Novel Studio toggle in `conversation.input.left`, beside the native access/plan controls; its accessible name and hover title retain the full action label. A started Session reads its committed summary, while a blank Composer reads the same read-only staged selection as the Agent-preset chooser. The Session still starts in the ordinary DSH frame; the author can open or close the workbench without changing preset or authored data. Switching to any other preset immediately restores the ordinary frame and removes the toggle.
- The desktop composition places the Agent conversation on the left and the manuscript explorer plus authored canvas on the right, while preserving the native collapsible DSH Session sidebar at the outer edge. An accessible drag separator (also adjustable with arrow keys) previews a CSS track at animation-frame cadence and commits one clamped width on release, so the authored workbench does not re-render for every pointer event.
- The native DSH sidebar remains available and can collapse or expand for session search and navigation. Switching Sessions does not replace the elected Novel surface; changing to an ineligible preset closes it.
- The explorer discovers the active Session's Novel Project, presents stable Book → Manuscript and Book Outline → Volume Outline branches (including empty branches), creates freeform Book/Volume Outlines, opens exact Revision-bound typed Asset documents, and can collapse independently from the DSH Session sidebar. Hierarchy comes from semantic parent ids rather than file paths.
- `ctx.novelAssetRenderers` owns effect-scoped exact-type editor, selection-description, optional reader-presentation, and Diff contributions. The shared canvas owns guarded save, Context Commit Barrier, Agent reference insertion, and review authority; it refuses an Asset whose renderer is absent instead of presenting a misleading generic editor.
- The shipped manuscript renderer edits a chapter title and body in one guarded Revision save, captures UTF-16 ranges, counts non-whitespace authored characters, and opts into a full-height centered paper surface with six coordinated navigation/sidebar/workspace/paper/text/status-bar skins. A full-width workbench status bar owns character count plus skin, typeface, and font-size controls; the workbench viewport owns scrolling while technical type and path metadata stay out of the writing surface.
- `@deepseek-ai/dsh-experimental-novel-asset-outline` contributes freeform `planning.outline` and `planning.chapter-outline` renderers. Book and Volume Outlines are unrestricted Markdown writing surfaces with exact text selection/Diff. The manuscript status bar places the supplied chapter-plan icon immediately before skin controls; it opens a right drawer bound one-to-one to the current chapter, where authors can freely write, save, or reference a Chapter Outline. The practical emotion/hooks/rhythm/four-beat starter is optional and inserts ordinary editable Markdown.
- Agent-created Assets return a replayable creation card and refresh the authoritative explorer. Human and Agent creation both use the same typed Remote/Repository path; neither invents a filesystem path.
- The Novel Agent can call `novel_present` with `open-workbench` or `close-workbench`. Its durable tool-result metadata drives the same browser-local `ctx.layout` selection as the Composer toggle; ordinary Agent prose never controls layout and presentation never mutates an Asset.
- “Reference selection to Agent” first saves a dirty typed draft, stops safely if that save fails, then freezes the selection. Composer displays only `@[the first ten characters…]`; its hidden occurrence retains the complete canonical `dsh-novel:` mention and serializes that exact value for the Agent on submit.
- `novel_propose_changes` tool results render a durable inline Diff card. Accept and Reject call Session-owned Remote methods; Accept refreshes the explorer and canvas from authoritative repository state.
- The workbench resolves the conversation service lazily after its slot owner mounts, avoiding a client-plugin dependency cycle while still using DSH's ordinary Composer draft state.

## Model Experience

### Workbench presentation

#### What the model sees

The Client package itself adds no model content. A user-created context mention is resolved by `@deepseek-ai/dsh-experimental-novel-context`, and model proposals are created by `@deepseek-ai/dsh-experimental-tool-novel`.

#### Token effect

The layout, editor, reader controls, short reference label, and review card add no tokens. Only the full reference serialized on submit and the stable Novel tool schemas affect a model request.

#### KV Cache effect

Opening assets, editing drafts, reviewing ChangeSets, and toggling panels do not change the model tool catalog or system prompt.

## Known Limitations and Deferred Work

- **Three shipped renderers** — the canvas installs `manuscript.chapter`; the planning package adds `planning.outline` and `planning.chapter-outline`. Characters, ideas, scenes, timelines, relations, and multiple editor tabs are deferred.
- **No live file events** — the explorer refreshes after in-workbench applies and repository calls reconcile external edits; there is no filesystem watcher or browser invalidation stream.
- **One active selection** — pinned context, multi-selection, block ids, annotations, and old-Revision badges are deferred.
- **Desktop-first layout** — mobile layout, route-level multi-workbench switching, persisted panel geometry, and cross-browser synchronization of the transient open state are deferred.
- **Basic text editor** — rich Markdown editing, syntax decorations, autosave cadence, import/export, and publishing views are deferred.
