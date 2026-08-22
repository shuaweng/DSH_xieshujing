# @deepseek-ai/dsh-experimental-novel-repository

[English](README.md) | 中文

## 用途

这个实验包定义提供方无关的 `ctx.novelRepository` 能力 seam 和第一版 Novel Project 类型。它让 Host 消费方使用由清单持有的稳定项目身份，而不把文件系统路径、Session、浏览器状态或传输请求当作项目身份。

## 行为

- `NovelRepository.discoverProject()` 接收一个规范化的文件系统目录 target；只有该目录不存在 `novel.yaml` 时才返回 `undefined`。
- 已发现的 `NovelProjectSnapshot` 包含 schema `1`、稳定 `ProjectId`、作者可见标题、规范化项目与清单 target，以及规范化的具名内容根 target。
- 提供方通过稳定的 `NovelRepositoryError` code 报告非法根目录、格式错误或过大的清单、不支持的 schema 与路径逃逸，而不会猜测如何修复。
- 本包只负责 Service Definition、与提供方无关的公共值和错误类型。`@deepseek-ai/dsh-experimental-novel-repository-local` 等提供方负责清单 I/O 与校验；任何 Remote 或 UI 投影均由独立 Consumer 负责。

## 模型体验

### 项目发现服务

#### 模型看到的内容

`ctx.novelRepository` 的任何内容都不会加入模型上下文；本包既不注册提示词贡献，也不注册面向模型的工具。

#### Token 影响

Service Definition 与项目值不会增加提示词或工具 schema token。

#### KV Cache 影响

本包不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **仅支持发现**：该约定不会列出或解析资产、Frontmatter、关系、Revision 或 ChangeSet。
- **没有持久化或索引约定**：SQLite、历史、搜索、文件监听与崩溃恢复均不属于本包。
- **没有传输、Client UI 或模型工具**：Remote 投影、工作台展示、Session Log 或模型上下文集成，以及面向模型的 Novel 工具都属于独立 Consumer。
