# experimental/ — private experimental packages

English | [中文](README.zh.md)

This group contains prototypes and internal-only Cordis plugins that use the repository's real runtime without joining an official release. Its packages are private, carry no stability or support promise, and retain the same engineering, security, documentation, lifecycle, testing, and snapshot requirements as release packages.

| Package | Role | ctx key |
|---|---|---|
| `agent-team/` | Implicit-root Agent Teams roster, durable peer mailbox, shared task DAG, and runtime coordination | `ctx.agentTeams` |
| `novel-repository/` | Provider-neutral Novel Project discovery seam and public Host vocabulary | `ctx.novelRepository` |
| `novel-repository-local/` | Bounded local `novel.yaml` validation and canonical content-root resolution | — |
| `novel-repository-remote/` | Agent-scoped read-only Host Remote for project discovery | `ctx.novelRepositoryRemote` |
| `novel-repository-client/` | Browser mount for the generated Novel Repository Remote | — |
| `novel-studio/` | Explicit private Profile bundle that mounts Novel Project discovery after Web App | — |
| `tool-agent-team/` | Scoped model-facing Agent Teams tools and collaboration guidance | — |

The [subtree rules](AGENTS.md) define dependency isolation, release exclusion, and promotion.
