# @deepseek-ai/dsh-experimental-novel-repository-client

English | [中文](README.zh.md)

## Purpose

This experimental Client adapter mounts the generated Novel Repository Remote for browser plugins while keeping the Host Consumer in its own compiler aggregate. It is an opt-in infrastructure row of the Novel Studio composition and contributes no workbench UI.

## Behavior

- The browser `./client` plugin consumes `ctx.remote` and mounts `@deepseek-ai/dsh-experimental-novel-repository-remote/remote`.
- Disposing the Cordis fiber withdraws the complete generated contribution, including the `novelRepository/discover` method.
- The Node loader entry has no Host behavior. The existing Gateway identity policy and `@deepseek-ai/dsh-experimental-novel-repository-remote` retain Agent resolution and project discovery respectively.
- Keeping the adapter in the Client aggregate prevents Host-only Agent and filesystem target types from entering browser compilation.

## Model Experience

### Project discovery mount

#### What the model sees

Nothing from `ctx.remote.novelRepository` is added to model context. The adapter mounts that browser API and registers no prompt contribution or model-facing tool.

#### Token effect

The adapter adds no prompt or tool-schema tokens.

#### KV Cache effect

The adapter does not change message ordering or reusable KV-cache prefixes.

## Known Limitations and Deferred Work

- **No workbench UI** — the adapter mounts project discovery but renders no project picker, explorer, editor, Context Tray, or error state.
- **Discovery only** — the mounted contract cannot list assets, read Frontmatter, expose revisions, or submit ChangeSets.
- **Generated Host artifact required** — the Host build must generate the Remote contribution before Client compilation and bundling.
- **Explicit composition required** — the supported Novel Studio composition installs the adapter, and custom Cordis compositions may install it directly; default Web and headless Profiles do not include it.
