# @deepseek-ai/dsh-experimental-tool-novel

English | [中文](README.zh.md)

## Purpose

This experimental Consumer gives a Novel Agent exact-read and proposal-only mutation tools without exposing generic filesystem writes for formal manuscript assets.

## Behavior

- `novel_get` accepts canonical `dsh-novel:` references and reads only their retained Revisions through `NovelContextResolver`.
- `novel_propose_changes` accepts one exact chapter, base Revision, quote-hashed UTF-16 range, replacement, and summary. It validates the reference and durably creates a single-asset `ChangeSet`; it never applies the proposal.
- Proposal results carry JSON-serializable `novel-change-set` presentation metadata so the browser can restore a review card from Session replay.
- The package adds a short system-prompt section explaining Revision authority and proposal-only semantics. It registers no shell, SQL, generic read, or generic write tools.
- Both tools require an owning Agent Session and use the Session-bound Novel Project rules enforced by the context resolver.

## Model Experience

### Novel asset tools

#### What the model sees

The model sees the `novel_get` and `novel_propose_changes` schemas plus a concise Novel-workbench tool section. Tool results state whether exact assets were read or a proposal was created; they never claim a file mutation.

#### Token effect

The fixed tool section and two schemas add a stable prompt cost. `novel_get` result size follows the referenced text budget; proposal results contain compact ids, status, and summary fields.

#### KV Cache effect

The tool catalog is stable for every Session using the Novel Workbench Preset, so changing pages or selections does not change the system-prefix tool schemas.

## Known Limitations and Deferred Work

- **Two tools only** — list, search, relations, create, present, and delegation tools are deferred.
- **One operation** — proposals support one `replace-text` operation over one chapter; multi-range and multi-asset ChangeSets are deferred.
- **No apply authority** — only the browser Remote can accept or reject a proposal; the model cannot commit it.
- **No automatic context discovery** — the model must use canonical references supplied by the user or returned by a future search Consumer.
