# Agent Note: Keep shell workbenches outside native conversation tracks

Status: implemented

English | [中文](2026-08-31-shell-workbench-native-conversation-split.zh.md)

## Problem

`shell.overlay` spans the complete AppFrame. A workbench that positions itself with a fixed left inset cannot know the responsive DSH sidebar width, while the native conversation remains laid out as a flexible full-center column. After the shell layout changed, the Novel workbench began before the Composer ended and visibly covered the conversation. Increasing a package-local inset only moves the collision between sidebar states and viewport sizes.

## Decision

Keep the shipped AppFrame and its `shell.overlay` seat as the only application shell. DSH 0.1.2 exposes no public shell-column contribution API, so the Novel plugin owns a narrow compatibility adapter inside its overlay component. While the workbench is visible, the adapter finds the overlay's rendered shell parent, reads the native sidebar track, and places temporary data attributes plus package-namespaced CSS variables on that shell. One package-owned global rule then maps the existing grid to sidebar, Agent conversation, and workbench tracks.

The adapter observes only the shell's inline grid style and size, follows responsive sidebar changes, and clamps the requested Agent width when the authored canvas would become too narrow. Closing or unmounting the workbench disconnects both observers and removes every attribute and CSS variable. No host package, private layout service, or Session state is changed.

## Alternatives considered

**Increase the Novel overlay's fixed inset.** One constant cannot represent expanded, collapsed, and auto-collapsed sidebar states. It would also keep the conversation centered under the overlay rather than making the two surfaces participate in one layout.

**Add a private layout method to DSH core.** This produced the cleanest runtime contract in the source fork, but an installable third-party plugin cannot require patched `ui-layout` types and implementations. A future public shell-column API should replace the compatibility adapter when DSH ships one.

**Replace the shipped root with a Novel-specific frame.** A competing root would duplicate sidebar, conversation, settings, details, and Session behavior, turning the plugin into a parallel application shell. The additive overlay plus native layout reservation preserves DSH ownership.

## Consequences

Opening the Novel workbench now makes the Agent conversation a real left column and starts the authored surface after the resolved DSH sidebar plus that column. Closing it restores the ordinary DSH layout without persisted geometry. The solution is distributable against stock DSH 0.1.2 because it changes no host runtime package, but it is intentionally a version-scoped compatibility seam: shell markup or grid-contract changes require a focused adapter update. Simultaneous shell overlays must still coordinate at the shell-seat level rather than stacking incompatible widths.
