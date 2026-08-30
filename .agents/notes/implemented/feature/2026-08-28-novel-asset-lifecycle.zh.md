# Agent Note: 小说资产生命周期

Status: implemented

[English](2026-08-28-novel-asset-lifecycle.md) | 中文

## Problem

作者可以创建和重排工作台 Asset，却无法移除误建或废弃的 Asset。物理删除会绕过与提供方无关的文件系统能力、丢失恢复证据，并让一次误点击无法撤销。把创建控件放在 Asset 行之间，也会混淆集合操作与文档本身。

## Decision

`novel.yaml` 记录可选的 `deletedAssetIds`。`NovelRepository.deleteAsset()` 要求精确的当前 Revision，通过 `FsVersion` 保护的 Manifest 替换把所选 Asset 及其语义后代加入墓碑序列、从已存顺序中移除其 id，并把尚未应用的提案标为冲突。当前目录扫描、搜索、浏览器导航和 Agent 工具都会排除墓碑 Asset，同时保留作者文件与不可变 Revision 历史。

删除是仅供浏览器作者使用且需要在跟随主题的工作台弹窗中明确确认的操作，不是模型工具。Explorer 把创建操作放进集合标题，把低干扰删除控件放在已有行上。`planning.outline` 声明 `rootSingleton`，因此一个项目只有一份无父级书纲，同时仍允许多份卷纲作为子级存在。Explorer 不创建互相竞争的全书大纲，而是在规范根书纲下提供“新建卷纲”。

## Alternatives considered

**物理移除 Asset 文件。** 文件系统能力没有删除原语；绕过该能力会避开沙箱策略、消除恢复能力，并产生依赖具体提供方的行为。

**把删除开放给小说 Agent。** 模型驱动删除会增加与写作无关的权限，并让提示误差具有破坏性；删除权限只属于作者。

**允许多份无父级书纲并由界面挑选一份。** Agent 工具和其他消费方仍然无法获得唯一的规范规划来源。根级单例 cardinality 在保留卷纲的同时拒绝含糊的全书真相。

## Consequences

已删除 Asset 会立即从人和 Agent 的当前视图中消失，同时不破坏作者字节或已保留历史。删除书纲会通过同一语义后代规则把卷纲移出当前目录；删除章节也会移除其章纲。

Manifest 墓碑序列会随删除增长，当前界面也没有恢复命令。未来的回收站视图可以重新发布墓碑身份而不改变删除契约；物理垃圾回收需要独立且明确的保留策略。
