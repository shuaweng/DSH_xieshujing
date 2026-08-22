# Novel workbench foundation

English | [中文](novel-workbench.zh.md)

The experimental Novel workbench foundation declares a Novel Project, exposes project discovery through `ctx.novelRepository`, and composes a local-filesystem provider, a read-only Host Remote Consumer, and a Client-only mount in an explicit Profile layer. It does not automatically add Novel content to model context and registers no Novel-specific model tool, prompt contribution, or Session event. The Client adapter mounts browser project discovery but contributes no dedicated workbench UI. The full authority and commit decisions are owned by the [Novel workbench Agent Note](../../.agents/notes/proposed/architecture/2026-08-22-novel-workbench-domain-and-commit-protocol.md).

## Project declaration

A Novel Project is a Workspace root containing a regular UTF-8 `novel.yaml`. The manifest is the authority for project identity, format version, title, and named content roots; it is not an asset manifest and does not enumerate authored files.

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
```

Schema version 1 requires `kind: novel-project`, integer `schema: 1`, a non-empty id without surrounding whitespace, a non-empty title, and a `contentRoots` mapping containing `manuscript` and no more than 32 entries. Content-root names use lowercase kebab case and every value is a non-empty path string. Each declared root must already exist as a directory. The local provider rejects every YAML parser error or warning, including duplicate keys and aliases, as well as invalid UTF-8, encoded or decoded control characters, unsupported schema versions, oversized manifests, a dangling or non-file marker, missing or non-directory content roots, dangling links, and canonical roots that escape the project root. An absent `novel.yaml` means the directory is not a Novel Project and returns `undefined`; a present but invalid declaration raises `NovelRepositoryError` with a stable error code.

## `ctx.novelRepository`

[`@deepseek-ai/dsh-experimental-novel-repository`](../../packages/experimental/novel-repository) defines the provider-neutral `NovelRepository` service. `discoverProject(root, signal?)` accepts an [`FsTarget`](filesystem.md), validates one candidate root, and returns a `NovelProjectSnapshot` containing the declared schema, branded project id, title, canonical root and manifest targets, and canonical targets for each content root.

[`@deepseek-ai/dsh-experimental-novel-repository-local`](../../packages/experimental/novel-repository-local) is the local provider. It performs all path resolution and containment checks through `ctx.fs`; a process `cwd` alone never establishes containment. `manifestMaxBytes` is configurable, defaults to 64 KiB, and cannot exceed the smaller of the runtime's maximum buffer and string lengths. Discovery is stateless and read-only: the provider neither caches a project catalog nor creates project files.

[`@deepseek-ai/dsh-experimental-novel-repository-remote`](../../packages/experimental/novel-repository-remote) is the experimental read-only Host Consumer. Its `ctx.novelRepositoryRemote` service publishes the strict `novelRepository/discover` Remote. The existing Gateway identity policy resolves the addressed Agent; this package adds no authorization mechanism. The Remote resolves that Agent Session's working directory through `ctx.fs` and delegates validation to `ctx.novelRepository`. A Session without a working directory fails as an invalid project root. The call returns `undefined` when the manifest is absent or a browser-safe `NovelProjectDescriptor` containing schema, stable project id, title, and display paths for the root, manifest, and named content roots. `descriptorMaxBytes` limits the complete descriptor JSON encoded as UTF-8, defaults to 256 KiB, and cannot exceed the runtime's maximum string length. Display paths locate content for presentation; they never replace the manifest-owned project id or authorize a write.

[`@deepseek-ai/dsh-experimental-novel-repository-client`](../../packages/experimental/novel-repository-client) is the Client-only adapter. It mounts the Host package's generated `./remote` contribution through `ctx.remote.$mount()` and withdraws that contribution with its Cordis fiber. Keeping the mount separate prevents Host-only Agent and filesystem types from entering the Client compiler aggregate.

## Current limits

`novel.yaml` is the only Novel-specific authored value this foundation reads. Discovery performs no writes and creates no `.novel` directory, database, catalog, cache, or other project state. Proposed future authority and commit semantics remain design decisions in the linked Agent Note rather than contracts of this implemented subsystem.

The Repository does not yet scan content roots, parse asset Frontmatter, assign Asset or Revision identities, persist history, create or apply ChangeSets, freeze selections, add model context to the Session log, or expose Novel tools or dedicated Client UI. Consequently, discovering a project does not make any manuscript file an addressable Novel Asset.

## Profile isolation

[`@deepseek-ai/dsh-experimental-novel-studio`](../../packages/experimental/novel-studio) is a private bundle used as the third layer of an explicitly initialized Profile, after `@deepseek-ai/dsh-base` and `@deepseek-ai/dsh-web-app`. Its patch inserts the local Novel Repository provider, the Host Remote Consumer, and the Client adapter. It does not replace `ui-layout` or change the existing Session-scoped `novel` Agent Preset.

The default `web` and `headless` Profile templates do not include experimental Novel packages. A source checkout or explicitly prepared Profile must make the private bundle resolvable and list all three layers in that order; without the third layer, the ordinary Web composition has no `ctx.novelRepository` provider.

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxnovelrepository--novelrepository-abstract-seam"></a>

### `ctx.novelRepository` — `NovelRepository` (abstract seam)

Provider-neutral access to validated Novel Project declarations.

```ts cordis-catalog
/**
 * Discover and validate the Novel Project rooted at one filesystem target.
 * @param root - Canonical candidate project directory from the active filesystem provider.
 * @param signal - Optional cancellation for all provider I/O.
 * @returns the validated project, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the root or present manifest is invalid or unsupported.
 */
abstract discoverProject(root: FsTarget, signal?: AbortSignal): Promise<NovelProjectSnapshot | undefined>
```

Types: [FsTarget](filesystem.md)

Source: [`packages/experimental/novel-repository/src/index.ts`](../../packages/experimental/novel-repository/src/index.ts)

<a id="ctxnovelrepositoryremote--novelrepositoryremote"></a>

### `ctx.novelRepositoryRemote` — `NovelRepositoryRemote`

Project browser projection consuming the provider-neutral repository service.

```ts cordis-catalog
/**
 * Discover a project at the addressed Agent's Session working directory.
 * @param agent - addressed Agent whose working directory bounds discovery.
 * @param signal - caller cancellation.
 * @returns browser-safe project values, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the Session has no working directory or discovery fails.
 */
@Remote('discover') async discover(agent: Agent, signal: AbortSignal): Promise<NovelProjectDescriptor | undefined>
```

Types: [Agent](core.md)

Source: [`packages/experimental/novel-repository-remote/src/index.ts`](../../packages/experimental/novel-repository-remote/src/index.ts)
<!-- END GENERATED cordis-surface -->
