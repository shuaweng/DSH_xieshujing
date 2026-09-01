# Agent Note: Keep branded library and bootstrap surfaces continuous

Status: implemented

English | [中文](2026-09-01-continuous-library-canvas.zh.md)

## Problem

The WriteBookWhale library artwork was painted by a fixed-aspect-ratio pseudo-element near the top of the page. Its lower edge became visible whenever the library content was taller than the artwork. The uninitialized-project form also retained the normal book Asset explorer even though there were no Assets to navigate, reducing the available form canvas and introducing unrelated chrome.

## Decision

The library owns one background across its complete scrollable surface. The warm paper overlay and branded artwork are background layers on the scrolling root instead of a bounded hero decoration, so content length cannot expose a separate white region.

When the canvas contains the project bootstrap surface, the workbench grid collapses the Asset explorer track to zero and hides both the explorer and its toggle. The bootstrap artwork and form remain the only Novel workbench surfaces until initialization succeeds.

## Alternatives considered

**Extend the original hero decoration farther down the page.** A larger fixed height would only move the visible seam and would fail again as the book list grows.

**Keep the empty explorer available for consistency.** The explorer has no valid navigation role before initialization and competes with the bootstrap composition, so initialized and uninitialized projects use different chrome.

## Consequences

The library retains one visual material from the first viewport through the end of the book list. New projects receive the full workbench canvas without presenting empty Asset navigation, while initialized projects retain the existing collapsible explorer.
