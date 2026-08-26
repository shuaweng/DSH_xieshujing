# @deepseek-ai/dsh-experimental-tool-novel

English | [中文](README.zh.md)

## Purpose

This experimental Consumer gives a Novel Agent typed discovery/creation, exact-read, and proposal-only mutation tools without exposing generic filesystem writes for formal Novel Assets.

## Behavior

- `novel_initialize_project` accepts the author-visible book title. An existing valid Novel Project returns unchanged; an absent project requires explicit user approval before the Repository creates default content roots and publishes `novel.yaml`. Invalid or existing manifests are never overwritten.
- `novel_list` discovers the Novel Project at the owning Session working directory and returns its current typed Asset catalog with semantic parent ids, canonical exact-Revision `dsh-novel:` references, and every registered type's creation contract. It exposes identities and metadata, not authored content.
- `novel_search` accepts a title/content clue, optional exact type allowlist, and bounded result count. It returns current exact-Revision references and excerpts; discovery alone does not inject or mutate an Asset.
- `novel_create` accepts one registered type, title, optional semantic parent, and type-owned JSON content. A new `manuscript.chapter` carries its complete prose body in the same call and has no semantic parent. The Repository generates the stable id and safe path, validates hierarchy rules, publishes the new authored file, and returns its exact first Revision. Creation results carry replayable `novel-asset-created` presentation metadata.
- `novel_get` accepts canonical references, reads only retained Revisions, and returns the Asset type plus its registered proposal instructions and exact model projection.
- `novel_propose_changes` accepts one exact Asset, base Revision, type-defined operation envelope, and summary. The registered Host definition validates and enriches those operations before the Repository durably creates a single-asset `ChangeSet`; it never applies the proposal.
- After a chapter proposal is durable, the Novel analysis service materializes its candidate in memory and runs the deterministic NOAI rules. Material findings are returned as bounded deferred model context, so the Agent must acknowledge likely template-language hotspots before replying; the feedback is logged with the turn and never creates or applies a second proposal.
- `novel_present` accepts only `open-workbench` or `close-workbench`. It changes browser presentation through replayable `novel-presentation` metadata and never reads, creates, or mutates an Asset.
- Proposal results carry JSON-serializable `novel-change-set` presentation metadata so the browser can restore a review card from Session replay.
- The package adds a short system-prompt section explaining Revision authority and proposal-only semantics. It registers no shell, SQL, generic read, or generic write tools.
- The four Asset tools require an owning Agent Session and use its working directory, resolved sandbox policy, and Session-bound Novel Project rules. `novel_present` is a presentation-only action available through the same Novel preset.

## Model Experience

### Novel asset tools

#### What the model sees

The model sees the `novel_initialize_project`, `novel_list`, `novel_search`, `novel_create`, `novel_get`, `novel_propose_changes`, and `novel_present` schemas plus a concise Novel-workbench tool section. Tool results distinguish initialization, discovery, durable creation, exact reads, proposal-only changes, and presentation-only frame actions; a proposal never claims that an existing file changed. A materially risky chapter candidate adds a short logged NOAI notice after the tool result.

#### Token effect

The fixed tool section and seven schemas add a stable prompt cost. Initialization returns only compact project identity and status fields; `novel_list` returns compact catalog metadata and creation instructions, `novel_search` returns bounded excerpts, `novel_get` result size follows the referenced text budget plus one numeric length, and creation/proposal/presentation results contain compact ids or status fields. Only a material chapter warning adds up to five deterministic findings.

#### KV Cache effect

The tool catalog is stable for every Session using the Novel Workbench Preset, so changing pages or selections does not change the system-prefix tool schemas.

## Known Limitations and Deferred Work

- **Lexical discovery only** — `novel_search` provides bounded title/model-text matching; semantic search, relations, Asset navigation/focus, and delegation tools are deferred. `novel_present` currently controls only the whole frame.
- **One title and one exact text operation** — a shipped text Asset may combine `update-title` with one body operation in the same proposal. Chapters use `insert-text` or `replace-text`, so an existing empty chapter can be named and receive prose atomically without a placeholder. Freeform planning and book-guidance types use `replace-text`; multi-range and multi-asset ChangeSets are deferred.
- **No apply authority** — only the browser Remote can accept or reject a proposal; the model cannot commit it.
- **No automatic retrieval** — search results are not silently inserted into model context; the Agent must choose an exact result and read it with `novel_get`.
