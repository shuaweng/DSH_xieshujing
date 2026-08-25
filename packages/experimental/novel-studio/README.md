# @deepseek-ai/dsh-experimental-novel-studio

English | [中文](README.zh.md)

## Purpose

This experimental package is the explicit Novel Studio Profile bundle. It composes the file-backed Novel Repository, durable context, safe model tools, browser Remote, and Agent-native workbench without changing the shipped `web` or `headless` Profile templates.

## Behavior

- Add this bundle after the existing base and Web App bundles. It inserts the Host Asset-type registry, the independent freeform planning/guidance Host/Client contribution, and `novel-repository-local`, followed by context, Revision-bound analysis, Remote, the separate Client adapter, and `novel-workbench`.
- The ordinary `ui-layout` remains the sole root and layout-service owner. Novel Workbench contributes a preset-scoped `novel` surface through its selector-routed `shell.workbench` chain, so native DSH sidebar, conversation, details, settings, model selection, tool rendering, and Session services stay authoritative.
- A package-owned `novel-workbench` Agent Preset combines a Novel persona with `novel_list`, `novel_search`, `novel_create`, `novel_get`, `novel_propose_changes`, and `novel_present`; generic shell and filesystem mutation tools are absent.
- The same Preset mounts seven package-owned, self-contained writing/review Skills through the standard on-demand `skill` tool: outline/beat design, chapter execution, style rewrite, style audit, scene drive, dialogue diagnostics, and exact-Revision chapter review. Skills teach method but cannot widen Novel tool authority.
- The Revision-bound analysis service gives the workbench deterministic NOAI scanning and a fixed one-shot reviewer. The reviewer is the first product-owned Subagent role: it receives frozen chapter/guidance context, only the `skill` tool, and a strict report schema; it has no Asset mutation authority.
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

The root model sees the Novel persona, six stable Novel tool schemas, the standard `skill` loader and its compact seven-Skill catalog, plus exact material chosen explicitly or retained in the visible Context Tray. It loads a method only when the task needs it. For relevant outline/writing/review tasks, the persona or loaded method explicitly discovers and reads the current exact Revision of a present `book.brief` or `book.style-profile`; these are visible tool reads, not hidden always-on context. A requested review gives frozen exact material to the dedicated child only; browser layout state never enters model context.

#### Token effect

The Preset adds its persona, six Novel schemas, one Skill schema, and compact Skill catalog summaries. A loaded Skill body and explicit or retained authored text add request-local tokens only when used. NOAI button scans spend no tokens; chapter review spends one bounded child request.

#### KV Cache effect

The Preset composition and Skill catalog are stable across page and selection changes. Skill bodies are logged as ordinary tool results rather than appended to the system prefix; request-local Novel context follows the direct user message and therefore does not change earlier reusable prefixes.

## Known Limitations and Deferred Work

- **No shipped Profile entry** — callers must explicitly install this bundle after base and Web App; there is no built-in `novel-studio` CLI template or route switcher.
- **Current asset scope** — the Host and Client registries install `manuscript.chapter`, freeform `planning.outline`, chapter-bound `planning.chapter-outline`, and project-singleton `book.brief` / `book.style-profile`, with one active type-defined selection and one-operation ChangeSets. Characters, ideas, relations, and structural outline edits remain deferred.
- **No finalization or learning loop** — book guidance records explicit author-confirmed rules only. Marking a Revision final and learning preferences from draft/final diffs are deferred.
- **No semantic search or live file events** — bounded lexical Asset search is shipped; relations, semantic ranking, file watching, and browser invalidation streams are deferred.
- **First Skill tranche only** — seven high-frequency writing, diagnostic, and review methods are adapted. The legacy direct-file Novel Skills are intentionally not mounted in the Workbench Preset, and additional methods will be migrated against Asset semantics as their target types land.
- **No general orchestration** — the fixed read-only reviewer is shipped, while editable Role Profiles, Task Blackboard, `novel_delegate`, and multi-Agent workflows are deferred.
