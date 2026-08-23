# @deepseek-ai/dsh-experimental-tool-novel

English | [中文](README.zh.md)

## Purpose

This experimental Consumer gives a Novel Agent exact-read and proposal-only mutation tools without exposing generic filesystem writes for formal manuscript assets.

## Behavior

- `novel_list` discovers the Novel Project at the owning Session working directory and returns its current chapter catalog with canonical exact-Revision `dsh-novel:` references. It exposes identities and metadata, not manuscript bodies.
- `novel_get` accepts canonical `dsh-novel:` references, reads only their retained Revisions through `NovelContextResolver`, and returns each body's exact UTF-16 length for safe range selection.
- `novel_propose_changes` accepts one exact chapter, base Revision, UTF-16 range, replacement, and summary. It freezes and quote-hashes that range inside the Repository before durably creating a single-asset `ChangeSet`; it never applies the proposal.
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

- **Catalog discovery only** — `novel_list` lists current chapter identities, while full-text search, relations, create, present, and delegation tools are deferred.
- **One operation** — proposals support one `replace-text` operation over one chapter; multi-range and multi-asset ChangeSets are deferred.
- **No apply authority** — only the browser Remote can accept or reject a proposal; the model cannot commit it.
- **No semantic search** — the model can discover canonical chapter references with `novel_list`, but related-content retrieval still requires a future search Consumer.
