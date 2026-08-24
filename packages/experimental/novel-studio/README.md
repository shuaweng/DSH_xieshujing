# @deepseek-ai/dsh-experimental-novel-studio

English | [中文](README.zh.md)

## Purpose

This experimental package is the explicit Novel Studio Profile bundle. It composes the file-backed Novel Repository, durable context, safe model tools, browser Remote, and Agent-native workbench without changing the shipped `web` or `headless` Profile templates.

## Behavior

- Add this bundle after the existing base and Web App bundles. It inserts the Host Asset-type registry, the independent `planning.outline` Host/Client contribution, and `novel-repository-local`, followed by context, Remote, the separate Client adapter, and `novel-workbench`.
- The ordinary `ui-layout` remains the sole root and layout-service owner. Novel Workbench contributes a preset-scoped `novel` surface through its selector-routed `shell.workbench` chain, so native DSH sidebar, conversation, details, settings, model selection, tool rendering, and Session services stay authoritative.
- A package-owned `novel-workbench` Agent Preset combines a Novel persona with `novel_list`, `novel_create`, `novel_get`, `novel_propose_changes`, and `novel_present`; generic shell and filesystem mutation tools are absent.
- `NovelStudioPaths` publishes the package-owned Preset root so `agent-presets` can select it without a repository-relative path.
- The default `web` and `headless` compositions remain free of the Novel Repository, context resolver, Novel Remote, workbench, and Novel tools. This package still does not add a shipped global Profile template; callers install it into an explicit Profile.

## Source checkout launch

A source checkout uses an explicitly initialized `novel-studio` Profile. A standalone `--patch packages/experimental/novel-studio/cordis.patch.yml` is invalid because a patch can alter rows but cannot install the packages named by new rows. Link Web App first, Novel Studio second, and then the private runtime packages because pnpm `link:` does not install a linked package's workspace dependencies:

```sh
pnpm dsh plugin --profile novel-studio add link:./packages/bundle/web-app
pnpm dsh plugin --profile novel-studio add link:./packages/experimental/novel-studio
pnpm dsh plugin --profile novel-studio add \
  link:./packages/experimental/novel-repository \
  link:./packages/experimental/novel-asset-outline \
  link:./packages/experimental/novel-context \
  link:./packages/experimental/novel-repository-client \
  link:./packages/experimental/novel-repository-local \
  link:./packages/experimental/novel-repository-remote \
  link:./packages/experimental/novel-workbench \
  link:./packages/experimental/tool-novel
pnpm dsh --profile novel-studio --port 3080
```

## Model Experience

### Novel Workbench Preset

#### What the model sees

The model sees the Novel persona, the stable Novel tool schemas, and exact referenced material only when a user sends a canonical workbench mention. Browser layout state is never added to model context; catalog discovery occurs only when the model calls `novel_list`.

#### Token effect

The Preset adds its persona, a short Novel tool section, and three tool schemas. Referenced authored text adds request-local tokens within the configured context budget.

#### KV Cache effect

The Preset composition is stable across page and selection changes. Request-local Novel context follows the direct user message and therefore does not change earlier reusable prefixes.

## Known Limitations and Deferred Work

- **No shipped Profile entry** — callers must explicitly install this bundle after base and Web App; there is no built-in `novel-studio` CLI template or route switcher.
- **MVP asset scope** — the Host and Client registries install `manuscript.chapter` and `planning.outline`, one active type-defined selection, and one-operation ChangeSets. Characters, ideas, relations, and structural outline edits remain deferred.
- **No search or live file events** — asset search, relations, file watching, and browser invalidation streams are deferred.
- **No orchestration** — Role Profiles, Task Blackboard, `novel_delegate`, and multi-Agent workflows are deferred.
