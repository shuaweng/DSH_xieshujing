# @deepseek-ai/dsh-experimental-novel-studio

[English](README.md) | 中文

## 用途

这个实验包是显式 Novel Studio Profile overlay。它组合文件优先 Novel Repository、持久上下文、安全模型工具、浏览器 Remote 和 Agent 原生工作台，而不修改已发布的 `web` 或 `headless` Profile template。

## 行为

- 应在现有 base 与 Web App 组合包之后组合本 overlay。它插入 `novel-repository-local`、`novel-context`、`novel-repository-remote`、独立 Client adapter 和 `novel-workbench`。
- overlay 只禁用普通 `ui-layout` entry，并把 Novel workbench 安装为唯一根占位者。原生 DSH 侧栏、对话、详情、设置、模型选择、工具渲染和 Session service 仍安装在该根声明的插槽中。
- 包自带的 `novel-workbench` Agent Preset 组合 Novel persona，且只包含 `novel_get` 和 `novel_propose_changes`；不包含通用 shell 或文件系统修改工具。
- `NovelStudioPaths` 发布包内 Preset 根，因此 `agent-presets` 不需要仓库相对路径即可选择它。
- 默认 `web` 与 `headless` 组合仍不包含 Novel Repository、上下文解析器、Novel Remote、工作台或 Novel 工具。本包仍不添加已发布的全局 Profile template；调用方通过 Cordis overlay 显式启用。

## 模型体验

### Novel Workbench Preset

#### 模型看到的内容

模型看到 Novel persona、稳定的 `novel_get` 与 `novel_propose_changes` Schema，以及仅在用户发送规范工作台引用时加入的精确资料。浏览器 discovery 和布局状态永远不会进入模型上下文。

#### Token 影响

Preset 会加入 persona、简短 Novel 工具说明和两个工具 Schema。被引用创作文本会在配置的上下文预算内增加本次请求 token。

#### KV Cache 影响

Preset 组合在页面和选区变化时保持稳定。请求局部 Novel 上下文跟在直接用户消息之后，因此不改变更早的可复用前缀。

## 已知限制与暂缓事项

- **没有已发布 Profile 入口**：调用方必须在 base 与 Web App 之后显式组合本 overlay；没有内建 `novel-studio` CLI template 或路由切换器。
- **MVP 资产范围**：只支持 `manuscript.chapter`、一个活动文本选区和单操作 ChangeSet。
- **没有搜索或实时文件事件**：资产搜索、关系、文件监听和浏览器失效事件流尚未实现。
- **没有编排**：Role Profile、Task Blackboard、`novel_delegate` 和多 Agent 工作流尚未实现。
