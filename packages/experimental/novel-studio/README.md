---
description: "Installable Novel Studio profile layer that composes repository, context, tools, Preset, Skills, and workbench UI."
kind: "package-bundle"
---

# WriteBookWhale (写书鲸) — `@xieshujing/dsh-plugin`

English | [中文](README.zh.md)

## Summary

This experimental package is the installable, neutral Novel Studio bundle. It composes the file-backed Novel Repository, durable context, safe model tools, browser Remote, and Agent-native workbench without changing the host Profile's default Agent Preset. A dedicated writing Profile may layer the separately exported `dedicated-profile.patch.yml` on top.

The source package remains private and experimental inside this monorepo. The supported public boundary is the prebuilt `@xieshujing/dsh-plugin` package: `pnpm run pack:xieshujing` produces its tarball, while `pnpm run export:xieshujing-repository` produces the standalone GitHub repository tree from the same staging function. npm registry publication remains deferred.

## Table of Contents

- [Behavior](#behavior)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="behavior"></a>
## Behavior

- Add this bundle after the existing base and Web App bundles. It inserts the Host Asset-type registry, the independent freeform planning/guidance Host/Client contribution, and `novel-repository-local`, followed by context, Revision-bound analysis, Remote, the separate Client adapter, and `novel-workbench`.
- The ordinary `ui-layout` remains the sole root and layout-service owner. Novel Workbench contributes a preset-scoped surface through `shell.overlay`; a package-local DSH 0.1.2 compatibility adapter creates the temporary Agent/workbench split without patching host source, so DSH sidebar, conversation, details, settings, model selection, tool rendering, and Session services stay authoritative.
- A package-owned `novel-workbench` Agent Preset combines a Novel persona with approval-gated `novel_initialize_project`, `novel_list`, `novel_search`, `novel_create`, `novel_get`, explicit read-only `novel_get_analysis`, `novel_propose_changes`, and `novel_present`; generic shell and filesystem mutation tools are absent.
- The same Preset mounts ten package-owned, self-contained writing/review Skills through the standard on-demand `skill` tool: new-book bootstrap, outline/beat design, chapter execution, style rewrite, style audit, scene drive, dialogue diagnostics, exact-Revision chapter review, draft/final preference extraction, and finalized-prose Story State extraction. Each Skill declares a closed `novelContextPolicy`; Skills teach method and select bounded context policy but cannot widen Novel tool authority. Chapter execution and scene drive now derive a temporary execution draft from freeform chapter guidance, confirmed Story State, style, and necessary prior prose. Ordinary scenes proceed directly; key or uncertain scenes may compare 2–3 short action options, wait for the user's choice or select one explicitly, and still produce one prose candidate by default through the existing ChangeSet flow.
- The Revision-bound analysis service gives the workbench deterministic NOAI scanning, a fixed one-shot reviewer, a preference worker, and a Story State worker. They receive only frozen bounded material, the `skill` tool, and a strict schema; none has Asset mutation authority. The user-facing Host flow alone can retain finalization and apply an accepted candidate through a ChangeSet.
- Historical authored Revisions are read-only evidence. The author can explicitly compare and restore one as a new guarded current Revision; restore never rewinds history, conflicts stale proposals for that Asset, retains Revision-bound analysis evidence, and asks for Story State review when chapter Canon may have changed.
- The bundle patch contributes the package-owned Preset root through the shipped `agent-presets` configuration and resolves it from the installed facade package. It composes with shipped and user roots, does not require a private runtime registration API, and disappears when the plugin is removed from the Profile.
- Installing the bundle leaves the host Profile's default Preset unchanged. The default `web` and `headless` compositions also remain free of the Novel Repository, context resolver, Novel Remote, workbench, and Novel tools. A product that intentionally dedicates one Profile to writing can apply `dedicated-profile.patch.yml`, which changes only that Profile's unnamed-session default to `novel-workbench`.

## Local one-package artifact

Build both library faces, then assemble one installable tarball:

```sh
npm run build:lib:host
npm run build:lib:client
pnpm run pack:xieshujing
```

The result is written to `.artifacts/xieshujing-plugin/xieshujing-dsh-plugin-<version>.tgz`. It carries the nine private Novel implementation packages under one public-facing `@xieshujing/dsh-plugin` facade, while DSH framework and UI packages remain peer dependencies supplied by the target Profile. This avoids loading a second Cordis or Agent runtime.

Install the tarball into an existing Web Profile with one plugin command:

```sh
pnpm dsh plugin --profile web add \
  "$PWD/.artifacts/xieshujing-plugin/xieshujing-dsh-plugin-0.1.2-alpha.2.tgz"
pnpm dsh --profile web --port 3082 --no-open
```

This neutral installation adds the `novel-workbench` Preset and its workbench surface but leaves the Profile's default Preset unchanged. Apply `dedicated-profile.patch.yml` only when intentionally creating a writing-only Profile. The packing command is local and deterministic: it neither contacts GitHub nor publishes to npm.

Export the exact prebuilt tree used by the public GitHub repository:

```sh
pnpm run export:xieshujing-repository
```

The result is written to `.artifacts/xieshujing-repository`. It contains no install-time build or prepare script: the generated `lib` payload and the nine private Novel implementation packages are already present, while DSH framework packages remain peer dependencies. This tree is the release input for the public repository's `main` branch; the monorepo integration history remains on its separate integration branch.

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
pnpm dsh --profile novel-studio \
  --patch "$PWD/packages/experimental/novel-studio/dedicated-profile.patch.yml" \
  --port 3080
```

The final `--patch` is optional. Omit it when Novel Studio is installed into a general-purpose Profile: the `novel-workbench` Preset remains selectable, but `standard` stays the default. A dedicated Profile may instead copy the small patch into its own `cordis.patch.yml` once and then keep using `pnpm dsh --profile novel-studio` without the flag.

<a id="model-experience"></a>
## Model Experience

### Novel Workbench Preset

#### What the model sees

The root model sees the Novel persona, eight stable Novel tool schemas, the standard `skill` loader and its compact ten-Skill catalog, plus one exact V3 Context Manifest compiled for the current explicit task. Ordinary turns retain only explicit material and visible Context Tray coordinates. Persisted analysis reports are not automatically injected; when asked, the root Agent can read the report bound to an exact chapter Revision through `novel_get_analysis`. Selected chapter Skills can add the confirmed Story State alongside deterministic chapter relations. Review and finalization give separately compiled frozen material only to their dedicated children; browser layout state never enters model context.

#### Token effect

The Preset adds its persona, eight Novel schemas, one Skill schema, and compact Skill catalog summaries. A loaded Skill body, explicitly fetched report, and policy-selected authored text add request-local tokens only when used. Exact duplicates are folded; optional related text—including Story State—degrades to coordinates at the compiler budget rather than being truncated or permanently injected. NOAI scans spend no tokens; review and each applicable finalization extractor spend bounded child requests.

#### KV Cache effect

The Preset composition and Skill catalog are stable across page and selection changes. Skill bodies are logged as ordinary tool results rather than appended to the system prefix; request-local Novel context follows the direct user message and therefore does not change earlier reusable prefixes.

## Known Limitations and Deferred Work
<a id="known-limitations-and-deferred-work"></a>

- **No shipped Profile entry** — callers must explicitly install this bundle after base and Web App; there is no built-in `novel-studio` CLI template or route switcher. The exported dedicated patch changes a Profile default but intentionally does not install packages.
- **GitHub distribution is release-family pinned** — the standalone public repository distributes the same prebuilt package tree and tagged `.tgz` produced locally. npm registry publication and a broader compatibility matrix remain deferred. The current release targets the matching DSH `0.1.1-rc.2` package family.
- **Current asset scope** — the Host and Client registries install `manuscript.chapter`, freeform `planning.outline`, chapter-bound `planning.chapter-outline`, and project-singleton `book.brief` / `book.style-profile` / `book.story-state`, with one active type-defined selection and one-operation ChangeSets. Characters, ideas, relations, and structural outline edits remain deferred.
- **Review-gated finalization learning only** — the user may mark an exact chapter Revision final and review a draft/final preference candidate. There is no automatic promotion, preference RAG, cross-book author profile, ranking, or model training.
- **No semantic search or live file events** — bounded lexical Asset search is shipped; relations, semantic ranking, file watching, and browser invalidation streams are deferred.
- **First Context Compiler policies only** — task selection is explicit and relation expansion is deterministic. Story State is exact freeform text; the Scene Execution V1 draft is request-local Skill guidance rather than a durable typed contract. Semantic retrieval, policy-owned summaries, model-specific token budgeting, and typed Scene Contracts can extend the compiler seam later without changing V3 frozen-manifest replay.
- **First Skill tranche only** — ten high-frequency bootstrap, writing, diagnostic, review, preference, and state-extraction methods are adapted. The legacy direct-file Novel Skills are intentionally not mounted in the Workbench Preset, and additional methods will be migrated against Asset semantics as their target types land.
- **No general orchestration** — the fixed read-only reviewer is shipped, while editable Role Profiles, Task Blackboard, `novel_delegate`, and multi-Agent workflows are deferred.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
