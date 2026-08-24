# @deepseek-ai/dsh-experimental-novel-repository-local

[English](README.md) | 中文

## 用途

这个实验包提供 `ctx.novelRepository` 的本地文件系统实现。项目文件是当前作者内容的权威来源，`.novel/history.sqlite` 则保留精确字节的不可变 Revision。

## 行为

- 候选根必须是目录。缺少 `novel.yaml` 时返回 `undefined`；清单存在但非法（包括标记为悬空链接）时，则以类型化的 `NovelRepositoryError` 失败。
- 完整 UTF-8 清单受 `manifestMaxBytes` 限制，该值默认是 64 KiB，必须为正的安全整数，且不能超过运行时最大 buffer 长度与最大字符串长度中的较小值。NUL 字节、解码后的控制字符，以及包括重复键和 alias 在内的所有 YAML 解析错误或 warning 都会被拒绝。
- Schema `1` 要求 `kind: novel-project`、非空 `id` 与 `title` 字符串，以及总条目数不超过 32 的 `contentRoots` mapping。内置章节定义要求存在 `manuscript` 条目；内容根名称采用小写 kebab-case。
- 提供方通过 `ctx.fs` 解析每条已声明的内容根路径，并要求位于项目内的规范化目标已作为目录存在。内容根缺失、不是目录、为悬空链接或其规范化目标位于项目根之外时，都会拒绝该项目。
- 已注册 Asset 定义选择声明过的内容根、接受的扩展名、创建行为和语义父级规则。Markdown Frontmatter 会把每个候选文件分派给 `ctx.novelAssetTypes`；未知类型、扩展名不匹配、重复 id、非法父级、层级循环和扫描期间发生变化的文件都会失败关闭。内置章节定义使用 `manuscript` 下的 Markdown；策划 contribution 使用可选 `planning` 下的自由 Markdown。
- 精确 UTF-8 文件字节会被哈希，并作为不可变 Revision 快照写入私有 SQLite 数据库。文件重命名不改变 Asset 身份和当前 Revision；外部字节变化会生成 `external-edit` Revision。未知或损坏的历史 schema 会被拒绝，绝不自动重置。
- 类型化创建会在已注册内容根内生成稳定 Asset id 与安全文件名，校验父级、单例与深度规则，以 `createIfAbsent` 发布并保留首个 Revision。作者保存会让已注册定义物化并重新解析完整候选字节，再同时使用当前 `FsVersion` 和基础 Revision 拒绝陈旧发布。内置文本定义保留身份/父级 Frontmatter，并在完整 code-point 边界上校验 UTF-16 范围。
- 历史 Schema 版本三会在 ChangeSet 中保存目标 Asset 类型，并保留 apply journal。持久操作由这个精确的已注册定义解码和物化；提案仍不写文件，审阅仍归 Session 所有。
- 应用会先把精确前后字节与哈希记录为 `applying`，再执行带保护的文件发布，最后记录 `agent-apply` Revision 和终态。项目重开时，after hash 会完成提交，before hash 会重试已授权写入，第三种 hash 会把 ChangeSet 标为 `conflicted` 而不覆盖文件。
- 保存和 apply 恢复发布会把调用方的逐调用 sandbox policy 传给 `ctx.fs`；提供方不会用自身进程目录替代 Session 工作区边界。
- 版本一和版本二历史数据库会原地迁移到版本三。不支持的较新数据库或损坏数据库仍会明确失败，绝不重置。

## 模型体验

### 本地项目发现

#### 模型看到的内容

`LocalNovelRepository` 的任何内容都不会加入模型上下文；消费方只能通过 repository service 获得 Host 侧项目快照。

#### Token 影响

清单解析与目标解析不会增加提示词或工具 schema token。

#### KV Cache 影响

该提供方不会改变消息顺序或可复用的 KV-cache 前缀。

## 已知限制与暂缓事项

- **单 Host 写入方**：写入只在一个提供方进程内串行化；文件监听、跨进程锁与协同编辑均暂缓。
- **仅显式协调**：当前文件会在列出、读取和保存边界上重新协调；没有 watcher 或自动修复。
- **完整快照**：每个 Revision 保存完整字节；保留、压缩与导出策略均暂缓。
- **单资产恢复**：多资产事务、自动 rebase、模糊重定位和三方合并尚未实现。
- **无跨进程锁**：带保护的 `FsVersion` 会阻止一次陈旧发布，但第二个 Host 进程不在支持的写入模型内。
