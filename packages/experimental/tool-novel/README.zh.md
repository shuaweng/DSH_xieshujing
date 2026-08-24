# @deepseek-ai/dsh-experimental-tool-novel

[English](README.md) | 中文

## 用途

这个实验性 Consumer 为 Novel Agent 提供类型化发现/创建、精确读取和仅提案修改工具，而不向正式 Novel Asset 开放通用文件写入。

## 行为

- `novel_list` 在所属 Session 工作目录发现 Novel Project，并返回带有语义父级 id、规范精确 Revision `dsh-novel:` 引用和各注册类型创建契约的当前类型化 Asset 目录。它只暴露身份和元数据，不返回作者内容。
- `novel_create` 接收一个已注册类型、标题、可选语义父级和类型拥有的 JSON 内容。Repository 生成稳定 id 与安全路径、校验层级规则、发布新作者文件，并返回精确首个 Revision。创建结果携带可回放的 `novel-asset-created` 展示元数据。
- `novel_get` 接收规范引用，只读取已保留 Revision，并返回 Asset 类型、该类型注册的提案说明和精确模型投影。
- `novel_propose_changes` 接收一个精确 Asset、基础 Revision、类型定义的 operation 信封和摘要。已注册 Host 定义会校验并补全这些操作，再由 Repository 持久创建单资产 `ChangeSet`；绝不应用提案。
- `novel_present` 只接收 `open-workbench` 或 `close-workbench`。它通过可回放的 `novel-presentation` metadata 改变浏览器展示，绝不读取、创建或修改 Asset。
- 提案结果携带可 JSON 序列化的 `novel-change-set` 展示元数据，因此浏览器可以从 Session 回放恢复审阅卡片。
- 本包加入一段简短 system prompt，说明 Revision 权威和仅提案语义。它不注册 shell、SQL、通用读取或通用写入工具。
- 四个 Asset 工具都要求所属 Agent Session，并遵守该 Session 工作目录、已解析 sandbox policy 与绑定 Novel Project 规则。`novel_present` 是通过同一小说 preset 提供的纯展示动作。

## 模型体验

### 小说资产工具

#### 模型看到什么

模型看到 `novel_list`、`novel_create`、`novel_get`、`novel_propose_changes` 与 `novel_present` Schema，以及简洁的小说工作台工具说明。工具结果会区分持久创建、精确读取、仅提案修改与纯展示 Frame 动作；提案绝不声称已有文件已经改变。

#### Token 影响

固定工具说明和五个 Schema 带来稳定的 prompt 开销。`novel_list` 返回紧凑目录元数据与创建说明，`novel_get` 结果大小受引用文本预算约束并增加一个数值长度；创建/提案/展示结果只包含紧凑 id 或状态字段。

#### KV Cache 影响

使用 Novel Workbench Preset 的每个 Session 都拥有稳定工具目录，因此切换页面或选区不会改变 system prefix 中的工具 Schema。

## 已知限制与延期工作

- **目录发现而非搜索** — `novel_list` 可以列出当前 Asset 身份与创建契约；全文搜索、relations、Asset 导航/聚焦与 delegation 工具尚未实现。`novel_present` 目前只控制整个 Frame。
- **只支持精确文本操作** — 当前章节、大纲和章纲类型使用一个精确 `replace-text`；多范围和多资产 ChangeSet 尚未实现。
- **没有应用权威** — 只有浏览器 Remote 可以接受或拒绝提案；模型不能提交修改。
- **没有语义搜索** — 模型可以通过 `novel_list` 发现规范类型化 Asset 引用，但相关内容检索仍需要未来的搜索 Consumer。
