# Agent Note：将小说历史 Revision 恢复为新的当前 head

Status: implemented

[English](2026-08-27-novel-revision-restore.md) | 中文

## 问题

Novel Studio 会保留每一份作者 Revision，也已经允许作者查看历史正文、大纲、指导资产、报告、定稿、偏好证据和 Story State 候选。但当一次 Agent 改写或后续人工编辑不如旧版时，只能查看并不足够。作者需要可靠地回到已知内容状态，同时不能破坏让 Agent 修改保持安全的证据和血缘。

如果把 current 指针直接倒退，较新的 Revision 会从普通历史父链中消失，Session 与报告引用会变得含糊，旧提案甚至可能重新显得可用。如果绕过 Repository 直接覆盖文件，则会丢失恢复来源、绕过乐观并发保护，并让本应失效的待处理 ChangeSet 继续显示为可应用。

## 决策

`restoreAssetRevision()` 接收精确当前 `baseRevisionId`、精确已保留 `sourceRevisionId` 与获授权 Session 身份。它校验两个 Revision 属于同一 Project 和 Asset，拒绝恢复已经是 current 的版本，通过 Asset 已注册类型在当前路径重新解析精确源字节，校验当前目录关系，再在当前文件系统版本保护下发布这些字节。

成功后创建新的当前 Revision，其 parent 是恢复前的当前 Revision。普通 origin 仍为 `user-edit`，可选 `restoredFromRevisionId` 与 `restoredBySessionId` 则记录被选择的历史来源和授权 Session。任何 Revision 都不会被删除、重排或变为可变对象。新的 head 以后仍可被另一轮恢复替代，因此恢复与保存、ChangeSet apply 共享同一条线性的作者历史。

记录新 Revision 与 current head 的同一个 SQLite 事务会把该 Asset 所有仍为 `proposed` 的 ChangeSet 改成 `conflicted`。即使某个提案的文本碰巧类似恢复来源，它仍然基于另一份 head 身份；静默复活或 rebase 会削弱精确 Revision 契约。已经 applied、rejected 或 conflicted 的 ChangeSet 保持不变。

绑定 Revision 的分析报告、定稿、偏好候选与 Story State 候选继续留在产生它们的精确历史 Revision 上。它们是证据，不是应删除的缓存。恢复章节也不会自动回滚项目级单例 Story State，因为后续章节可能已依赖其中的已确认事实。当项目存在 Story State Asset 时，恢复结果只设置 `storyStateReviewRecommended`，由工作台展示明确的复查提醒。

浏览器只在只读历史 Revision 上提供恢复入口。它使用同一个已注册 Asset renderer 展示当前版与选中历史版对照，并要求用户明确确认。成功后，画布打开新创建的当前 Revision，标记其恢复来源，报告多少待处理提案因此进入冲突，并在需要时展示 Story State 复查提醒。

## 权威与恢复

- 作者项目文件仍是当前内容的权威；保留的精确字节与恢复血缘存放在 `.novel/history.sqlite` schema version seven。
- Revision 列表只读取不可变 metadata，不读取每一份已保留正文 BLOB。编辑器键盘输入保留为浏览器本地草稿，字节完全相同的保存则在 Repository 边界保持幂等，因此输入过程与重复的空保存屏障都不会膨胀永久历史。
- 被寻址 Agent Session 通过 Remote Consumer 提供恢复权威与 sandbox policy。模型没有恢复工具，无法确认这个仅限作者的动作。
- 发布同时使用当前 `FsVersion` 和精确 base Revision，因此并发保存或外部编辑会拒绝恢复，而不是被覆盖。
- 文件系统写入必然发生在 SQLite 事务之前。若进程恰好在这个窄窗口失败，恢复出的作者字节仍然安全，下一次协调会记录一条 `external-edit` Revision，但预期恢复来源无法自动重建。

## 已考虑的替代方案

**把 current Revision 指针直接倒退。** 拒绝，因为它破坏追加式血缘、遮蔽后续工作，并使持久 Session 引用含糊。

**删除被选版本之后的全部 Revision。** 拒绝，因为报告、定稿、Agent 轨迹与作者决策都是持久证据，未来比较或再次恢复时仍可能有用。

**把待处理 ChangeSet 自动 rebase 到恢复文本。** 拒绝，因为类型化精确操作有意在过期时失败。未来可以由显式三方合并产生新提案，但恢复本身不能猜测。

**随章节正文自动回滚 Story State。** 拒绝，因为 Story State 是经过审阅的项目 Canon，后续章节可能已经依赖它。安全做法是检查影响，而不是隐藏的多 Asset 修改。

**把恢复开放成模型工具。** 拒绝，因为选择哪份作者历史成为当前内容，即使数据仍保留，在意图上也属于高风险动作。它保持为浏览器中的显式作者操作。

## 验证

- Repository 测试覆盖把精确已保留字节恢复成新 head、保留线性 parent 链与恢复来源、原子冲突待处理提案、保留历史分析报告、为章节推荐 Story State 复查，以及拒绝陈旧 base 或其他 Asset 的源 Revision。
- Schema 迁移测试覆盖版本一至版本六升级到版本七，在加入可空恢复来源字段时保留已有记录。
- Remote 测试证明恢复权威来自被寻址 Agent Session，且浏览器 descriptor 只包含有边界、浏览器安全的效果。
- 工作台测试覆盖历史只读模式、版本对照、显式确认、权威刷新、恢复标签、冲突提案反馈与 Story State 复查消息。
- 草稿边界测试证明连续键盘输入不会调用保存或推进当前 Revision；Repository 测试则证明未变化的语义保存仍只保留一个 Revision。
- 真实 keyless Novel Studio composition 快照覆盖装配后的恢复流程与持久 ChangeSet 冲突，而不是独立组件近似。
- 受影响 TypeScript 工程、生成 Remote 契约、作用域内文档配对、聚焦测试、契约 lint 与无密钥组装工作台快照共同通过。仓库级静态审计仍会报告 PR14 范围外既有的工作区与文档语料漂移；本次改动没有给这些报告类别新增失败。

## 后果

恢复安全且可审计，但有意不把所有派生产物重新变成 current。作者可能需要对新 Revision 重跑 NOAI 或章节审查，并检查 Story State 影响。历史报告仍可在原版本上查看，基于旧 head 的提案则变成显式冲突。文件先于数据库提交的窄崩溃窗口能保住内容，但会丢失恢复血缘；若要消除最后这个限制，需要增加类似 ChangeSet apply 的恢复 journal 与恢复协议。
