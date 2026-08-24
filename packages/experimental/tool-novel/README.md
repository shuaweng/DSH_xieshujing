# @deepseek-ai/dsh-experimental-tool-novel

English | [中文](README.zh.md)

## Purpose

This experimental Consumer gives a Novel Agent typed discovery/creation, exact-read, and proposal-only mutation tools without exposing generic filesystem writes for formal Novel Assets.

## Behavior

- `novel_list` discovers the Novel Project at the owning Session working directory and returns its current typed Asset catalog with semantic parent ids, canonical exact-Revision `dsh-novel:` references, and every registered type's creation contract. It exposes identities and metadata, not authored content.
- `novel_create` accepts one registered type, title, optional semantic parent, and type-owned JSON content. The Repository generates the stable id and safe path, validates hierarchy rules, publishes the new authored file, and returns its exact first Revision. Creation results carry replayable `novel-asset-created` presentation metadata.
- `novel_get` accepts canonical references, reads only retained Revisions, and returns the Asset type plus its registered proposal instructions and exact model projection.
- `novel_propose_changes` accepts one exact Asset, base Revision, type-defined operation envelope, and summary. The registered Host definition validates and enriches those operations before the Repository durably creates a single-asset `ChangeSet`; it never applies the proposal.
- `novel_present` accepts only `open-workbench` or `close-workbench`. It changes browser presentation through replayable `novel-presentation` metadata and never reads, creates, or mutates an Asset.
- Proposal results carry JSON-serializable `novel-change-set` presentation metadata so the browser can restore a review card from Session replay.
- The package adds a short system-prompt section explaining Revision authority and proposal-only semantics. It registers no shell, SQL, generic read, or generic write tools.
- The four Asset tools require an owning Agent Session and use its working directory, resolved sandbox policy, and Session-bound Novel Project rules. `novel_present` is a presentation-only action available through the same Novel preset.

## Model Experience

### Novel asset tools

#### What the model sees

The model sees the `novel_list`, `novel_create`, `novel_get`, `novel_propose_changes`, and `novel_present` schemas plus a concise Novel-workbench tool section. Tool results distinguish durable creation, exact reads, proposal-only changes, and presentation-only frame actions; a proposal never claims that an existing file changed.

#### Token effect

The fixed tool section and five schemas add a stable prompt cost. `novel_list` returns compact catalog metadata and creation instructions, `novel_get` result size follows the referenced text budget plus one numeric length, and creation/proposal/presentation results contain compact ids or status fields.

#### KV Cache effect

The tool catalog is stable for every Session using the Novel Workbench Preset, so changing pages or selections does not change the system-prefix tool schemas.

## Known Limitations and Deferred Work

- **Catalog discovery, not search** — `novel_list` lists current Asset identities and creation contracts; full-text search, relations, Asset navigation/focus, and delegation tools are deferred. `novel_present` currently controls only the whole frame.
- **Exact text operation only** — shipped chapter, outline, and chapter-outline types use one exact `replace-text`; multi-range and multi-asset ChangeSets are deferred.
- **No apply authority** — only the browser Remote can accept or reject a proposal; the model cannot commit it.
- **No semantic search** — the model can discover canonical typed Asset references with `novel_list`, but related-content retrieval still requires a future search Consumer.
