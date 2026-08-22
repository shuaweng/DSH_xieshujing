# @deepseek-ai/dsh-experimental-novel-studio

[English](README.md) | 中文

## 用途

这个实验包是用于 Host 与浏览器项目发现的显式 Novel Studio Profile 组合包。调用方可以借此把 Novel Repository Service Definition、本地提供方、只读发现 Remote 与独立 Client adapter 加入 Web 组合，同时不改变已发布的 `web` 或 `headless` Profile template。

## 行为

- 应在现有 base 与 Web App 组合包之后组合本包；其 patch 会插入 `@deepseek-ai/dsh-experimental-novel-repository-local` 提供方、`@deepseek-ai/dsh-experimental-novel-repository-remote` Host Consumer 与 `@deepseek-ai/dsh-experimental-novel-repository-client`。
- 显式 Novel 组合可以通过 `ctx.novelRepository` 发现作者创建的有效 `novel.yaml`。Host Consumer 发布严格的 `novelRepository/discover` Remote，Client adapter 挂载其生成的 contribution；返回值仅包含浏览器安全的 descriptor。
- 默认 `web` 与 `headless` 组合不会装载 Novel repository 提供方。
- 本包不注册 `novel-studio` Profile template，也不替换 `ui-layout`；Novel 组合仍保留与普通 Web Profile 相同的 Web App frame。

## 模型体验

### Profile bundle 组合

#### 模型看到的内容

本组合包向浏览器调用方暴露 `novelRepository/discover`，但返回的 descriptor 不会加入模型上下文；它不贡献提示词或面向模型的工具。

#### Token 影响

组合包本身不会增加提示词或工具 schema token。

#### KV Cache 影响

本组合包不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **没有已发布的 Profile 入口**：调用方必须在 base 与 Web App 组合包之后显式组合本包；没有内置 `novel-studio` template 或命令。
- **没有 Novel 工作台 UI**：本包保留普通 Web layout；Client adapter 只挂载项目发现能力，不注册专用 Novel runtime、编辑器、资产导航或 Context Tray。
- **没有面向模型的 Novel 集成**：`novelRepository/discover` 只面向浏览器；Novel 工具、提示词上下文、Session Log 记录与 ChangeSet 呈现均已延后。
- **没有资产或持久化层**：本组合包不实现 SQLite、索引、Revision、ChangeSet、文件监听或崩溃恢复。
