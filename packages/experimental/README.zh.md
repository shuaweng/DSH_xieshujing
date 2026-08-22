# experimental/：私有实验性包

[English](README.md) | 中文

本组包含使用仓库真实运行时、但不进入正式发布的原型与内部专用 Cordis 插件。组内包均为私有包，不承诺稳定性或支持，但仍须满足与发布包相同的工程、安全、文档、生命周期、测试和快照要求。

| 包 | 职责 | ctx key |
|---|---|---|
| `agent-team/` | 隐式 root Agent Teams roster、持久 peer mailbox、共享任务 DAG 与运行时协调 | `ctx.agentTeams` |
| `novel-context/` | 精确 Revision 引用、规范 Composer mention 与持久模型可见 Novel 上下文 | `ctx.novelContextResolver` |
| `novel-repository/` | 与提供方无关的 Novel Project、Asset、Revision、Selection 与 ChangeSet seam | `ctx.novelRepository` |
| `novel-repository-local/` | 文件权威资产、不可变 SQLite 历史与可恢复 ChangeSet 应用 | — |
| `novel-repository-remote/` | 按 Agent 作用域寻址的浏览器读取、保护保存、选区与 ChangeSet 审阅 | `ctx.novelRepositoryRemote` |
| `novel-repository-client/` | 生成的 Novel Repository Remote 的浏览器挂载 | — |
| `novel-studio/` | 显式私有 Profile overlay 与安全 Novel Workbench Preset | `ctx.novelStudioPaths` |
| `novel-workbench/` | Profile 所属正文浏览器、编辑器、Context Tray、对话与 Diff 审阅 | `ctx.layout` |
| `tool-novel/` | 面向正式 Novel 资产的精确读取与仅提案模型工具 | — |
| `tool-agent-team/` | 按 Agent 作用域提供的 Agent Teams 模型工具与协作指引 | — |

[子树规则](AGENTS.md)规定依赖隔离、发布排除与 promotion。
