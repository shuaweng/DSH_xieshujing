# @deepseek-ai/dsh-experimental-novel-repository-local

[English](README.md) | 中文

## 用途

这个实验包提供 `ctx.novelRepository` 的本地文件系统实现。它通过一份有大小边界、有版本的 `novel.yaml` 发现 Novel Project，并经组合后的 `ctx.fs` 服务解析清单声明的内容根。

## 行为

- 候选根必须是目录。缺少 `novel.yaml` 时返回 `undefined`；清单存在但非法（包括标记为悬空链接）时，则以类型化的 `NovelRepositoryError` 失败。
- 完整 UTF-8 清单受 `manifestMaxBytes` 限制，该值默认是 64 KiB，必须为正的安全整数，且不能超过运行时最大 buffer 长度与最大字符串长度中的较小值。NUL 字节、解码后的控制字符，以及包括重复键和 alias 在内的所有 YAML 解析错误或 warning 都会被拒绝。
- Schema `1` 要求 `kind: novel-project`、非空 `id` 与 `title` 字符串，以及包含 `manuscript` 条目且总条目数不超过 32 的 `contentRoots` mapping。内容根名称采用小写 kebab-case。
- 提供方通过 `ctx.fs` 解析每条已声明的内容根路径，并要求位于项目内的规范化目标已作为目录存在。内容根缺失、不是目录、为悬空链接或其规范化目标位于项目根之外时，都会拒绝该项目。

## 模型体验

### 本地项目发现

#### 模型看到的内容

`LocalNovelRepository` 的任何内容都不会加入模型上下文；消费方只能通过 repository service 获得 Host 侧项目快照。

#### Token 影响

清单解析与目标解析不会增加提示词或工具 schema token。

#### KV Cache 影响

该提供方不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **仅支持清单发现**：该提供方不会扫描资产、解析资产 Frontmatter、建立索引，也不会创建 Revision 与 ChangeSet。
- **校验内容根但不扫描**：每个目标必须已作为项目内目录存在，但发现过程不会枚举其中的文件。
- **没有实时同步或修复**：发现是无状态调用，没有文件监听、缓存刷新、迁移或自动清单修复；只接受 schema `1`。
- **没有 SQLite、Remote、专用 Client UI 或模型工具**：持久化、传输、工作台界面与面向模型的 Novel 工具均不属于该提供方。
