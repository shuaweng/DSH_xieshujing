# @deepseek-ai/dsh-experimental-tool-novel

[English](README.md) | 中文

## 用途

这个实验性 Consumer 为 Novel Agent 提供精确读取和仅提案修改工具，而不向正式小说 Asset 开放通用文件写入。

## 行为

- `novel_list` 在所属 Session 工作目录发现 Novel Project，并返回带有规范、精确 Revision `dsh-novel:` 引用的当前类型化 Asset 目录。它只暴露身份和元数据，不返回作者内容。
- `novel_get` 接收规范引用，只读取已保留 Revision，并返回 Asset 类型、该类型注册的提案说明和精确模型投影。
- `novel_propose_changes` 接收一个精确 Asset、基础 Revision、类型定义的 operation 信封和摘要。已注册 Host 定义会校验并补全这些操作，再由 Repository 持久创建单资产 `ChangeSet`；绝不应用提案。
- 提案结果携带可 JSON 序列化的 `novel-change-set` 展示元数据，因此浏览器可以从 Session 回放恢复审阅卡片。
- 本包加入一段简短 system prompt，说明 Revision 权威和仅提案语义。它不注册 shell、SQL、通用读取或通用写入工具。
- 三个工具都要求所属 Agent Session，并遵守该 Session 工作目录与绑定 Novel Project 规则。

## 模型体验

### 小说资产工具

#### 模型看到什么

模型看到 `novel_list`、`novel_get` 和 `novel_propose_changes` Schema，以及简洁的小说工作台工具说明。工具结果说明发现了资产、读取了精确内容或创建了提案；绝不声称文件已经修改。

#### Token 影响

固定工具说明和三个 Schema 带来稳定的 prompt 开销。`novel_list` 返回紧凑目录元数据，`novel_get` 结果大小受引用文本预算约束并增加一个数值长度；提案结果只包含紧凑的 id、状态和摘要字段。

#### KV Cache 影响

使用 Novel Workbench Preset 的每个 Session 都拥有稳定工具目录，因此切换页面或选区不会改变 system prefix 中的工具 Schema。

## 已知限制与延期工作

- **仅目录发现** — `novel_list` 可以列出当前 Asset 身份；全文搜索、relations、create、present 和 delegation 工具尚未实现。
- **只内置一种 operation adapter** — 工具由类型驱动，但当前只安装章节 `replace-text` 输入；多范围和多资产 ChangeSet 尚未实现。
- **没有应用权威** — 只有浏览器 Remote 可以接受或拒绝提案；模型不能提交修改。
- **没有语义搜索** — 模型可以通过 `novel_list` 发现规范章节引用，但相关内容检索仍需要未来的搜索 Consumer。
