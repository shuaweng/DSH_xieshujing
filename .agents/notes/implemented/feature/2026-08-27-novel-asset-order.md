# Agent Note: Novel Asset order

Status: implemented

English | [中文](2026-08-27-novel-asset-order.zh.md)

## Problem

Project-path order is stable but does not express an author's intended chapter sequence. Encoding order in chapter filenames or chapter Revisions would couple narrative organization to physical paths or create prose-history noise for a metadata-only action.

## Decision

`novel.yaml` owns an optional `assetOrder` mapping from exact Asset type to a complete sequence of stable Asset ids. Missing mappings retain deterministic project-path order, and current Assets absent from a stored sequence sort after its listed members by project path.

`NovelRepository.reorderAssets()` accepts one registered type and every current Asset id of that type exactly once. The local provider validates the complete set, replaces the manifest with an `FsVersion` guard, and returns the catalog in committed order. Reordering does not rewrite Asset files or create Asset Revisions.

The browser explorer enables native row dragging only for `manuscript.chapter`. It updates the visible catalog optimistically, persists the complete chapter sequence through the Remote Consumer, adopts the returned catalog on success, and restores the prior sequence on failure. `listAssets()` remains the shared ordering source for browser navigation and `novel_list`.

## Alternatives considered

**Store an order field in every chapter Frontmatter.** This keeps order beside each chapter but turns one drag into several authored-file writes and chapter Revisions, and a crash can leave duplicate or partial ranks.

**Rename chapter files with numeric prefixes.** Stable Asset ids survive renames, but physical organization becomes a mutation protocol and multi-file renames are not atomic.

**Store order only in `.novel` SQLite or browser state.** This avoids authored-file writes but loses Git portability and gives humans and Agents different project order after moving the project.

## Consequences

Chapter order survives refresh, restart, file rename, and repository transfer without changing chapter history. The generic type-keyed mapping can later support other flat Asset lists without changing the manifest field.

Concurrent external edits to `novel.yaml` reject the reorder instead of overwriting them. A newly created Asset is deterministically placed after the stored sequence until a subsequent reorder records the complete current set. Concurrent collaborative sequence editing and multi-user merge assistance remain outside the single-Host writer model.
