# Agent Note: Novel Asset lifecycle

Status: implemented

English | [中文](2026-08-28-novel-asset-lifecycle.zh.md)

## Problem

An author can create and reorder workbench Assets but cannot remove mistaken or obsolete Assets. Physical deletion would bypass the provider-neutral filesystem capability, discard recovery evidence, and make an accidental click irreversible. Creation controls placed among Asset rows also blur the distinction between a collection action and a document.

## Decision

`novel.yaml` records optional `deletedAssetIds`. `NovelRepository.deleteAsset()` requires the exact current Revision, adds the selected Asset and semantic descendants to that tombstone sequence through an `FsVersion`-guarded manifest replacement, removes their ids from stored order, and conflicts outstanding proposals. Current catalog scans, search, browser navigation, and Agent tools exclude tombstoned Assets while authored files and immutable Revision history remain retained.

Deletion is a browser-only author action with explicit confirmation in a theme-aware workbench dialog; it is not a model tool. The explorer places creation actions in collection headers and places a low-noise delete control on existing rows. `planning.outline` declares `rootSingleton`, so a project contains one parentless book outline while multiple volume outlines remain valid children. The explorer never creates a competing book outline; it scopes Volume Outline creation beneath the canonical root.

## Alternatives considered

**Physically unlink Asset files.** The filesystem capability has no deletion primitive, and bypassing it would evade sandbox policy, eliminate recovery, and create provider-specific behavior.

**Expose deletion to the Novel Agent.** Model-driven deletion would add authority unrelated to writing and make prompt mistakes destructive; the author remains the only deletion actor.

**Allow several parentless book outlines and pick one in the UI.** This leaves Agent tools and other consumers without one canonical planning source. Root singleton cardinality keeps volume outlines without accepting ambiguous book truth.

## Consequences

Deleted Assets disappear immediately from current human and Agent views without destroying authored bytes or retained history. Deleting a book outline also removes its volume outlines from the current catalog, and deleting a chapter removes its chapter plan through the same semantic-descendant rule.

The manifest tombstone sequence grows with deletions and the current UI has no restore command. A future trash view can republish a tombstoned identity without changing the deletion contract; physical garbage collection requires a separate, explicit retention policy.
