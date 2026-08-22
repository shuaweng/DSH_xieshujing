# @deepseek-ai/dsh-experimental-novel-studio

English | [中文](README.zh.md)

## Purpose

This experimental package is the explicit Novel Studio Profile bundle for Host and browser project discovery. It lets a caller add the Novel Repository Service Definition, its local provider, its read-only discovery Remote, and the separate Client adapter to a Web composition without changing the shipped `web` or `headless` Profile templates.

## Behavior

- Compose this bundle after the existing base and Web App bundles; its patch inserts the `@deepseek-ai/dsh-experimental-novel-repository-local` provider, the `@deepseek-ai/dsh-experimental-novel-repository-remote` Host Consumer, and `@deepseek-ai/dsh-experimental-novel-repository-client`.
- The explicit Novel composition can discover a valid authored `novel.yaml` through `ctx.novelRepository`. The Host Consumer publishes the strict `novelRepository/discover` Remote, while the Client adapter mounts its generated contribution and exposes only a browser-safe descriptor.
- The default `web` and `headless` compositions remain free of the Novel repository provider.
- This package does not register a `novel-studio` Profile template and does not replace `ui-layout`; the Novel composition retains the same Web App frame as the ordinary Web Profile.

## Model Experience

### Profile bundle composition

#### What the model sees

The bundle exposes `novelRepository/discover` to browser callers, but the returned descriptor is not added to model context; it contributes no prompt or model-facing tool.

#### Token effect

The bundle itself adds no prompt or tool-schema tokens.

#### KV Cache effect

The bundle does not change message ordering or reusable KV-cache prefixes.

## Known Limitations and Deferred Work

- **No shipped Profile entry** — callers must explicitly compose this bundle after the base and Web App bundles; there is no built-in `novel-studio` template or command.
- **No Novel workbench UI** — the package keeps the ordinary Web layout; the Client adapter only mounts project discovery and does not register a Novel runtime, editor, explorer, or Context Tray.
- **No model-facing Novel integration** — `novelRepository/discover` is browser-facing only; Novel tools, prompt context, Session Log records, and ChangeSet presentation are deferred.
- **No asset or persistence layer** — SQLite, indexing, revisions, ChangeSets, file watching, and crash recovery are not implemented by this bundle.
