# experimental/：私有实验性包

[English](README.md) | 中文

本组包含使用仓库真实运行时、但不进入正式发布的原型与内部专用 Cordis 插件。组内包均为私有包，不承诺稳定性或支持，但仍须满足与发布包相同的工程、安全、文档、生命周期、测试和快照要求。

| 包 | 职责 | ctx key |
|---|---|---|
| `agent-team/` | 隐式 root Agent Teams roster、持久 peer mailbox、共享任务 DAG 与运行时协调 | `ctx.agentTeams` |
| `novel-repository/` | 与提供方无关的 Novel Project 发现 seam 和公共 Host 词汇 | `ctx.novelRepository` |
| `novel-repository-local/` | 有界本地 `novel.yaml` 校验与规范内容根目录解析 | — |
| `novel-repository-remote/` | 按 Agent 作用域寻址的只读项目发现 Host Remote | `ctx.novelRepositoryRemote` |
| `novel-repository-client/` | 生成的 Novel Repository Remote 的浏览器挂载 | — |
| `novel-studio/` | 在 Web App 之后挂载 Novel Project 发现能力的显式私有 Profile bundle | — |
| `tool-agent-team/` | 按 Agent 作用域提供的 Agent Teams 模型工具与协作指引 | — |

[子树规则](AGENTS.md)规定依赖隔离、发布排除与 promotion。
