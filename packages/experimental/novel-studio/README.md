# @deepseek-ai/dsh-experimental-novel-studio

English | [中文](README.zh.md)

## Purpose

This experimental package is the explicit Novel Studio Profile overlay. It composes the file-backed Novel Repository, durable context, safe model tools, browser Remote, and Agent-native workbench without changing the shipped `web` or `headless` Profile templates.

## Behavior

- Compose this overlay after the existing base and Web App bundles. It inserts `novel-repository-local`, `novel-context`, `novel-repository-remote`, the separate Client adapter, and `novel-workbench`.
- The overlay disables only the ordinary `ui-layout` entry and installs the Novel workbench as the sole root occupant. Native DSH sidebar, conversation, details, settings, model selection, tool rendering, and Session services remain installed in the slots declared by that root.
- A package-owned `novel-workbench` Agent Preset combines a Novel persona with only `novel_get` and `novel_propose_changes`; generic shell and filesystem mutation tools are absent.
- `NovelStudioPaths` publishes the package-owned Preset root so `agent-presets` can select it without a repository-relative path.
- The default `web` and `headless` compositions remain free of the Novel Repository, context resolver, Novel Remote, workbench, and Novel tools. This package still does not add a shipped global Profile template; callers opt in with its Cordis overlay.

## Model Experience

### Novel Workbench Preset

#### What the model sees

The model sees the Novel persona, the stable `novel_get` and `novel_propose_changes` schemas, and exact referenced material only when a user sends a canonical workbench mention. Browser discovery and layout state are never added to model context.

#### Token effect

The Preset adds its persona, a short Novel tool section, and two tool schemas. Referenced authored text adds request-local tokens within the configured context budget.

#### KV Cache effect

The Preset composition is stable across page and selection changes. Request-local Novel context follows the direct user message and therefore does not change earlier reusable prefixes.

## Known Limitations and Deferred Work

- **No shipped Profile entry** — callers must explicitly compose this overlay after base and Web App; there is no built-in `novel-studio` CLI template or route switcher.
- **MVP asset scope** — only `manuscript.chapter`, one active text selection, and one-operation ChangeSets are supported.
- **No search or live file events** — asset search, relations, file watching, and browser invalidation streams are deferred.
- **No orchestration** — Role Profiles, Task Blackboard, `novel_delegate`, and multi-Agent workflows are deferred.
