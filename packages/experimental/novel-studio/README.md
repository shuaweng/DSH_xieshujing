# @deepseek-ai/dsh-experimental-novel-studio

English | [中文](README.zh.md)

## Purpose

This experimental package is the explicit Novel Studio Profile bundle. It composes the file-backed Novel Repository, durable context, safe model tools, browser Remote, and Agent-native workbench without changing the shipped `web` or `headless` Profile templates.

## Behavior

- Add this bundle after the existing base and Web App bundles. It inserts the Host Asset-type registry, the independent freeform planning/guidance Host/Client contribution, and `novel-repository-local`, followed by context, Revision-bound analysis, Remote, the separate Client adapter, and `novel-workbench`.
- The ordinary `ui-layout` remains the sole root and layout-service owner. Novel Workbench contributes a preset-scoped `novel` surface through its selector-routed `shell.workbench` chain, so native DSH sidebar, conversation, details, settings, model selection, tool rendering, and Session services stay authoritative.
- A package-owned `novel-workbench` Agent Preset combines a Novel persona with `novel_list`, `novel_search`, `novel_create`, `novel_get`, `novel_propose_changes`, and `novel_present`; generic shell and filesystem mutation tools are absent.
- The same Preset mounts eight package-owned, self-contained writing/review Skills through the standard on-demand `skill` tool: outline/beat design, chapter execution, style rewrite, style audit, scene drive, dialogue diagnostics, exact-Revision chapter review, and draft/final preference extraction. Each Skill declares a closed `novelContextPolicy`; Skills teach method and select bounded context policy but cannot widen Novel tool authority.
- The Revision-bound analysis service gives the workbench deterministic NOAI scanning, a fixed one-shot reviewer, and a fixed one-shot preference worker. Both receive only frozen bounded material, the `skill` tool, and a strict schema; neither has Asset mutation authority. The user-facing Host flow alone can retain finalization and apply an accepted candidate through a ChangeSet.
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
  link:./packages/experimental/novel-analysis \
  link:./packages/experimental/novel-context \
  link:./packages/experimental/novel-repository-client \
  link:./packages/experimental/novel-repository-local \
  link:./packages/experimental/novel-repository-remote \
  link:./packages/experimental/novel-workbench \
  link:./packages/experimental/tool-novel \
  link:./packages/skill/skill-filesystem \
  link:./packages/skill/tool-skill
pnpm dsh --profile novel-studio --port 3080
```

## Model Experience

### Novel Workbench Preset

#### What the model sees

The root model sees the Novel persona, six stable Novel tool schemas, the standard `skill` loader and its compact eight-Skill catalog, plus one exact V3 Context Manifest compiled for the current explicit task. Ordinary turns retain only explicit material and visible Context Tray coordinates. A selected writing, outline, rewrite, or review Skill can add only its deterministic typed relations—such as the Chapter Outline, Book Brief, or Book Style Profile—under that Skill's closed policy. These Assets are request-local rather than hidden always-on context. Review and eligible explicit finalization give separately compiled frozen material only to their dedicated children; browser layout state never enters model context.

#### Token effect

The Preset adds its persona, six Novel schemas, one Skill schema, and compact Skill catalog summaries. A loaded Skill body and policy-selected authored text add request-local tokens only when used. Exact duplicates are folded; optional related text degrades to coordinates at the compiler budget rather than being truncated or permanently injected. NOAI button scans spend no tokens; chapter review and an eligible explicit finalization each spend one bounded child request.

#### KV Cache effect

The Preset composition and Skill catalog are stable across page and selection changes. Skill bodies are logged as ordinary tool results rather than appended to the system prefix; request-local Novel context follows the direct user message and therefore does not change earlier reusable prefixes.

## Known Limitations and Deferred Work

- **No shipped Profile entry** — callers must explicitly install this bundle after base and Web App; there is no built-in `novel-studio` CLI template or route switcher.
- **Current asset scope** — the Host and Client registries install `manuscript.chapter`, freeform `planning.outline`, chapter-bound `planning.chapter-outline`, and project-singleton `book.brief` / `book.style-profile`, with one active type-defined selection and one-operation ChangeSets. Characters, ideas, relations, and structural outline edits remain deferred.
- **Review-gated finalization learning only** — the user may mark an exact chapter Revision final and review a draft/final preference candidate. There is no automatic promotion, preference RAG, cross-book author profile, ranking, or model training.
- **No semantic search or live file events** — bounded lexical Asset search is shipped; relations, semantic ranking, file watching, and browser invalidation streams are deferred.
- **First Context Compiler policies only** — task selection is explicit and relation expansion is deterministic. Story State, semantic retrieval, policy-owned summaries, model-specific token budgeting, and Scene Contracts can extend the compiler seam later without changing V3 frozen-manifest replay.
- **First Skill tranche only** — eight high-frequency writing, diagnostic, review, and preference-extraction methods are adapted. The legacy direct-file Novel Skills are intentionally not mounted in the Workbench Preset, and additional methods will be migrated against Asset semantics as their target types land.
- **No general orchestration** — the fixed read-only reviewer is shipped, while editable Role Profiles, Task Blackboard, `novel_delegate`, and multi-Agent workflows are deferred.
