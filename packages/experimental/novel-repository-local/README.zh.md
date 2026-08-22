# @deepseek-ai/dsh-experimental-novel-repository-local

[English](README.md) | 中文

## 用途

这个实验包提供 `ctx.novelRepository` 的本地文件系统实现。项目文件是当前作者内容的权威来源，`.novel/history.sqlite` 则保留精确字节的不可变 Revision。

## 行为

- 候选根必须是目录。缺少 `novel.yaml` 时返回 `undefined`；清单存在但非法（包括标记为悬空链接）时，则以类型化的 `NovelRepositoryError` 失败。
- 完整 UTF-8 清单受 `manifestMaxBytes` 限制，该值默认是 64 KiB，必须为正的安全整数，且不能超过运行时最大 buffer 长度与最大字符串长度中的较小值。NUL 字节、解码后的控制字符，以及包括重复键和 alias 在内的所有 YAML 解析错误或 warning 都会被拒绝。
- Schema `1` 要求 `kind: novel-project`、非空 `id` 与 `title` 字符串，以及包含 `manuscript` 条目且总条目数不超过 32 的 `contentRoots` mapping。内容根名称采用小写 kebab-case。
- 提供方通过 `ctx.fs` 解析每条已声明的内容根路径，并要求位于项目内的规范化目标已作为目录存在。内容根缺失、不是目录、为悬空链接或其规范化目标位于项目根之外时，都会拒绝该项目。
- 系统在可配置的目录深度、资产数量和字节上限内扫描 `manuscript`。Markdown 章节必须具有严格 YAML Frontmatter，其中包含 `novel.schema: 1`、稳定 `novel.id`、`novel.type: manuscript.chapter` 与标题。重复 id 或扫描期间发生变化的文件会以失败关闭处理。
- 精确 UTF-8 文件字节会被哈希，并作为不可变 Revision 快照写入私有 SQLite 数据库。文件重命名不改变 Asset 身份和当前 Revision；外部字节变化会生成 `external-edit` Revision。未知或损坏的历史 schema 会被拒绝，绝不自动重置。
- 作者保存只替换解析后的正文，保留精确 Frontmatter 前缀，并同时使用当前 `FsVersion` 和基础 Revision 拒绝陈旧写入。选区引用使用正文 UTF-16 偏移，拒绝切开代理对，并把引用哈希绑定到已保留 Revision。
- 历史 Schema 版本二保存 ChangeSet 和 apply journal。提案不会写文件；应用要求提案所属 Session、精确的当前基础 Revision 和一个经过验证的 `replace-text` 操作；拒绝同样归 Session 所有并进入终态。
- 应用会先把精确前后字节与哈希记录为 `applying`，再执行带保护的文件发布，最后记录 `agent-apply` Revision 和终态。项目重开时，after hash 会完成提交，before hash 会重试已授权写入，第三种 hash 会把 ChangeSet 标为 `conflicted` 而不覆盖文件。
- 第一版历史数据库会原地迁移到版本二。不支持的较新数据库或损坏数据库仍会明确失败，绝不重置。

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
