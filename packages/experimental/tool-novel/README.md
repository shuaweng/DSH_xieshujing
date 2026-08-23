# @deepseek-ai/dsh-experimental-tool-novel

English | [中文](README.zh.md)

## Purpose

This experimental Consumer gives a Novel Agent exact-read and proposal-only mutation tools without exposing generic filesystem writes for formal manuscript assets.

## Behavior

- `novel_list` discovers the Novel Project at the owning Session working directory and returns its current typed Asset catalog with canonical exact-Revision `dsh-novel:` references. It exposes identities and metadata, not authored content.
- `novel_get` accepts canonical references, reads only retained Revisions, and returns the Asset type plus its registered proposal instructions and exact model projection.
- `novel_propose_changes` accepts one exact Asset, base Revision, type-defined operation envelope, and summary. The registered Host definition validates and enriches those operations before the Repository durably creates a single-asset `ChangeSet`; it never applies the proposal.
- Proposal results carry JSON-serializable `novel-change-set` presentation metadata so the browser can restore a review card from Session replay.
- The package adds a short system-prompt section explaining Revision authority and proposal-only semantics. It registers no shell, SQL, generic read, or generic write tools.
- All three tools require an owning Agent Session and use its working directory and Session-bound Novel Project rules.

## Model Experience

### Novel asset tools

#### What the model sees

The model sees the `novel_list`, `novel_get`, and `novel_propose_changes` schemas plus a concise Novel-workbench tool section. Tool results state whether assets were discovered, exact content was read, or a proposal was created; they never claim a file mutation.

#### Token effect

The fixed tool section and three schemas add a stable prompt cost. `novel_list` returns compact catalog metadata, `novel_get` result size follows the referenced text budget plus one numeric length, and proposal results contain compact ids, status, and summary fields.

#### KV Cache effect

The tool catalog is stable for every Session using the Novel Workbench Preset, so changing pages or selections does not change the system-prefix tool schemas.

## Known Limitations and Deferred Work

- **Catalog discovery only** — `novel_list` lists current Asset identities, while full-text search, relations, create, present, and delegation tools are deferred.
- **One shipped operation adapter** — the tool is type-driven, but only one chapter `replace-text` input is installed; multi-range and multi-asset ChangeSets are deferred.
- **No apply authority** — only the browser Remote can accept or reject a proposal; the model cannot commit it.
- **No semantic search** — the model can discover canonical chapter references with `novel_list`, but related-content retrieval still requires a future search Consumer.
