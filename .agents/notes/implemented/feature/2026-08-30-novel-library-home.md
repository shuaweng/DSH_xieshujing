# Agent Note: Novel library home

Status: implemented

English | [中文](2026-08-30-novel-library-home.zh.md)

## Problem

A Novel Project is deliberately rooted at one Session working directory, while an author may keep books in unrelated folders. Making a homepage scan a parent folder or the whole machine would create a second project-discovery authority, broaden filesystem access, and still miss books outside that tree.

Repeated Revision saves also make “words written today” unsafe to calculate by summing Revision sizes: the same chapter text would be counted many times.

## Decision

The homepage reuses the native DSH Workspace registry as the library registry. Each registered Workspace contributes one existing Session address; the Novel Repository Remote probes that Session root for `novel.yaml`. Non-Novel Workspaces are skipped. Project files, repository ownership, and Agent tools remain Session-rooted exactly as before.

For each discovered project, the browser reads current `manuscript.chapter` heads and retained Revision metadata. Total characters are the non-whitespace characters in current heads. Today is a net delta: current chapter characters minus the characters in the latest retained Revision before the browser's local midnight. Repeated saves and Agent proposals therefore do not inflate the number.

The elected Novel surface starts on a browser-local `home` page with three totals, one continue-writing action, and the registered book list. Each row and the continue target reuse one package-owned cover ground with a live title overlay. The optional, bounded `novel.yaml` `description` supplies the book synopsis. A missing description receives only a browser fallback, never a fabricated progress value.

Opening a book uses `ctx.workspaces.connectWorkspace()` and `ctx.sessions.open()` before the existing explorer resolves the requested stable Asset id. `connectWorkspace()` deliberately reuses an eligible blank conversation for that Workspace or creates one; the workbench does not invent a second Session lifecycle. The client plugin explicitly requires the native `workspaces` service, and rejected activation remains visible on the homepage. The header's **New novel** action closes the workbench and clears the active Session through native DSH controllers, returning the author to the shipped new-Session/Workspace flow rather than opening a second project picker.

While the homepage is visible, the Context Tray replaces automatic chapter follow with one bounded `library-home` surface: totals plus at most 24 visible book titles, bounded synopses, chapter counts, character counts, and continue titles. The workset and frozen V3 source retain the active Session's Project id. This is presentation metadata already visible on the homepage, not a capability token: it grants no Remote or Repository access to other books and never copies their authored Assets. Returning to a book removes the surface and restores normal Asset follow.

## Alternatives considered

**Scan the filesystem from a configured library root.** This cannot represent arbitrary folders without broad recursive access and duplicates the native Workspace registry.

**Create a Novel-only global registry.** This would form an independent navigation and persistence kingdom beside DSH Workspace/Session state.

**Sum every Revision created today.** This is cheap but counts rewrites and repeated saves as new prose, rewarding version churn instead of authored output.

**Store covers and synopsis in a global Novel registry.** This would make the homepage the owner of book identity and create drift from each Session-rooted `novel.yaml`. The shared cover is a presentation resource; synopsis remains with its book.

## Consequences

The homepage sees books across folders only after the author has registered those folders as DSH Workspaces. It performs no whole-disk scan and does not change Session scoping. Its bounded visible summary is frozen through the existing Novel Context workset and Session Log; it does not establish cross-project Asset authority. The version-one project manifest gains one optional `description`; legacy manifests remain valid, and the browser and approval-gated initialization tool share the same request.

The first implementation composes existing Remote reads and may issue two document reads per chapter when a day-start baseline exists. A future repository summary projection can optimize that cost without changing the homepage contract or introducing another source of truth. Deleted chapters and prose imported for the first time today are reflected as current-state changes rather than reconstructed keystroke history.
