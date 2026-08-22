# experimental/ — private experimental packages

English | [中文](README.zh.md)

This group contains prototypes and internal-only Cordis plugins that use the repository's real runtime without joining an official release. Its packages are private, carry no stability or support promise, and retain the same engineering, security, documentation, lifecycle, testing, and snapshot requirements as release packages.

| Package | Role | ctx key |
|---|---|---|
| `agent-team/` | Implicit-root Agent Teams roster, durable peer mailbox, shared task DAG, and runtime coordination | `ctx.agentTeams` |
| `novel-context/` | Exact Revision references, canonical Composer mentions, and durable model-visible Novel context | `ctx.novelContextResolver` |
| `novel-repository/` | Provider-neutral Novel Project, Asset, Revision, Selection, and ChangeSet seam | `ctx.novelRepository` |
| `novel-repository-local/` | File-authoritative assets, immutable SQLite history, and recoverable ChangeSet apply | — |
| `novel-repository-remote/` | Agent-scoped browser reads, guarded saves, selections, and ChangeSet review | `ctx.novelRepositoryRemote` |
| `novel-repository-client/` | Browser mount for the generated Novel Repository Remote | — |
| `novel-studio/` | Explicit private Profile overlay and safe Novel Workbench Preset | `ctx.novelStudioPaths` |
| `novel-workbench/` | Profile-owned manuscript explorer, editor, Context Tray, conversation, and Diff review | `ctx.layout` |
| `tool-novel/` | Exact-read and proposal-only model tools for formal Novel assets | — |
| `tool-agent-team/` | Scoped model-facing Agent Teams tools and collaboration guidance | — |

The [subtree rules](AGENTS.md) define dependency isolation, release exclusion, and promotion.
