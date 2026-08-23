# @deepseek-ai/dsh-experimental-novel-workbench

English | [中文](README.zh.md)

## Purpose

This experimental Client Consumer provides the Agent-native Novel Studio root workbench: DSH session navigation, manuscript assets, an authored canvas, visible Agent context, conversation, and reviewable ChangeSets in one Profile-owned surface.

## Behavior

- The Novel Studio Profile disables the ordinary `ui-layout` root occupant. This package becomes the sole root occupant and declares the native `sidebar`, `conversation`, `details`, `shell.overlay`, `novel.explorer`, and `novel.canvas` slots.
- The desktop composition places the Agent conversation on the left and the manuscript explorer plus authored canvas on the right, while preserving the native collapsible DSH Session sidebar at the outer edge.
- The native DSH sidebar remains available and starts collapsed; it can expand for session search and navigation. Switching Sessions does not replace the root workbench component.
- The explorer discovers the active Session's Novel Project, lists reconciled `manuscript.chapter` assets, and opens exact Revision-bound chapter documents.
- The canvas edits only a chapter body. Save uses the displayed base Revision, preserves the active selection on success, and reports failures in the editor header. “Reference selection to Agent” first saves a dirty draft, stops safely if that save fails, then freezes the selected UTF-16 range and appends the returned Markdown `dsh-novel:` mention to the current Composer.
- The Context Tray discloses the current frozen selection and states that it enters the Session log when sent.
- `novel_propose_changes` tool results render a durable inline Diff card. Accept and Reject call Session-owned Remote methods; Accept refreshes the explorer and canvas from authoritative repository state.
- The workbench resolves the conversation service lazily after its slot owner mounts, avoiding a client-plugin dependency cycle while still using DSH's ordinary Composer draft state.

## Model Experience

### Workbench presentation

#### What the model sees

The Client package itself adds no model content. A user-created context mention is resolved by `@deepseek-ai/dsh-experimental-novel-context`, and model proposals are created by `@deepseek-ai/dsh-experimental-tool-novel`.

#### Token effect

The layout, editor, Context Tray, and review card add no tokens. Only mentions the user sends and the stable Novel tool schemas affect a model request.

#### KV Cache effect

Opening assets, editing drafts, reviewing ChangeSets, and toggling panels do not change the model tool catalog or system prompt.

## Known Limitations and Deferred Work

- **Chapter-only canvas** — outlines, characters, ideas, scenes, timelines, relations, and multiple editor tabs are deferred.
- **No live file events** — the explorer refreshes after in-workbench applies and repository calls reconcile external edits; there is no filesystem watcher or browser invalidation stream.
- **One active selection** — pinned context, multi-selection, block ids, annotations, and old-Revision badges are deferred.
- **Desktop-width layout** — panel resizing, mobile layout, route-level multi-workbench switching, and persisted panel geometry are deferred.
- **Basic text editor** — rich Markdown editing, syntax decorations, autosave cadence, import/export, and publishing views are deferred.
