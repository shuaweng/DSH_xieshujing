# Agent Note: Keep new-book bootstrap inside the native DSH handoff

Status: implemented

English | [中文](2026-09-01-native-new-book-handoff.zh.md)

## Problem

The WriteBookWhale library home previously opened a new book by clearing the current Session. That sent users through DSH's generic new-session screen, discarded the selected Workspace and `novel-workbench` preset, and required both to be selected again manually. The bootstrap layout also collapsed too early and owned an inner scroll area, so the branded ink artwork appeared to stop halfway down a long form.

## Decision

The home-page new-book action completes a native DSH handoff before navigation. It asks `uiWorkspace` for a directory, registers that path through the Workspace Controller, connects a Session to the resulting Workspace, selects the `novel-workbench` preset through the Agent Presets remote, opens that Session, and then opens the Novel workbench on its uninitialized-project bootstrap surface. Cancelling the picker is a no-op, while failures remain on the library home and are shown there.

The bootstrap canvas owns vertical scrolling. Its split layout stretches the ink artwork for the full form height and remains split down to a 560-pixel workbench canvas. On narrower canvases the artwork becomes a full-surface branded background underneath a warm translucent layer instead of disappearing into a plain white lower half.

## Alternatives considered

**Clear the current Session and ask the user to select the Workspace and preset again.** This was the original behavior. It broke the user's new-book intent across multiple manual steps and allowed the workbench to reopen in the wrong mode.

**Initialize immediately in the directory without showing the bootstrap form.** This would make the transition shorter, but it would write a project before the user supplies the title and optional description and would remove the deliberate initialization review step.

**Maintain a plugin-private Workspace or Session registry.** That would avoid depending on DSH's controllers, but it would create a parallel ownership model that disagrees with the host's sidebar, Session history, permissions, and preset lifecycle.

## Consequences

New books retain DSH-native Workspace, Session, and preset ownership while arriving directly at the branded initialization form. The Novel workbench client now depends on the Workspace Controller and Agent Presets remote, and preset selection must succeed before the target Session is opened. Selecting a directory that is already registered reuses DSH's normal Workspace semantics rather than creating plugin-only state.
