# @deepseek-ai/dsh-experimental-novel-asset-outline

[English](README.md) | 中文

## 用途

这个实验性 Asset 类型包为小说工作台贡献自由写作的策划表面。它刻意把语义身份、层级与写作方法分开：Repository 只约束“大纲 → 卷纲”和“章节 → 章纲”的关系，作者与 Agent 可以在每个正文中自行选择任意 Markdown 结构。

## 行为

- `planning.outline` 是声明的 `planning` 内容根下的 UTF-8 Markdown Asset。Frontmatter 保存 schema、稳定 id、类型、标题与 `level: book | volume`；Markdown 正文完全自由。
- 大纲没有父级。卷纲必须通过 `novel.parent` 指向大纲。继续嵌套、跨类型父级、父级缺失与循环关系都会失败关闭。
- `planning.chapter-outline` 是自由 Markdown，其 `novel.parent` 必须指向一个 `manuscript.chapter`。每章最多只能拥有一个章纲。
- 情绪目标、场面钥匙、钩子分布、15/35/35/15 节奏和起承转合只是工作台提供的可选引导。它们不是持久化字段，也不是校验要求。
- 人类保存可以修改标题和完整正文。冻结选区复用精确 UTF-16 文本范围 selector，并通过 quote hash 绑定到一个已保留 Revision。
- 两种类型都通过 ChangeSet 接受一个精确 `replace-text` 操作。类型定义会在物化前校验 offset 与 quote hash，并保留身份、父级和无关 Frontmatter。
- Client contribution 把两种类型渲染为不受模板限制的写作表面，并展示精确文本 Diff。共享 Explorer 提供两层大纲导航；正文 Canvas 提供章节本地章纲侧栏。

```markdown
---
novel:
  schema: 1
  id: outline-main
  type: planning.outline
  title: 全书大纲
  level: book
---

# 作者喜欢的任何结构

可以写散文、列表、标题、表格，或者作者自己的方法。
```

```markdown
---
novel:
  schema: 1
  id: volume-one
  type: planning.outline
  title: 第一卷卷纲
  level: volume
  parent: outline-main
---

本卷逐步升级白港谜案，最终以灯塔熄灭收束。
```

```markdown
---
novel:
  schema: 1
  id: chapter-one-plan
  type: planning.chapter-outline
  title: 第一章章纲
  parent: chapter-one
---

本章只写雨夜抵达，以无人应答的敲门声收尾。
```

## 模型体验

### 自由策划上下文与操作

#### 模型看到什么

`novel_list` 暴露两种类型的创建契约与规范精确 Revision 引用。`novel_create` 可以创建大纲、卷纲或绑定章节的章纲；`novel_get` 返回精确自由正文；`novel_propose_changes` 创建可审阅的精确文本替换，而不会直接应用。

#### Token 影响

安装这些类型不会增加类型专属工具 Schema。稳定 Novel 工具只在目录/读取结果中增加类型创建和提案说明；只有读取或注入引用时，作者正文才进入 token。

#### KV Cache 影响

在大纲、卷纲和章纲表面之间切换不会改变工具目录或 system prompt 前缀，只有请求局部的 Asset 引用与正文变化。

## 已知限制与延期工作

- **基础 Markdown 编辑**：富 Markdown 装饰、Block、评论和作为可复用 Asset 管理的模板尚未实现。
- **单次精确替换**：多范围提案、自动 rebase 和结构合并尚未实现。
- **只约束两层大纲**：幕、阶段或自定义层级暂时应写在自由 Markdown 内，等出现有证据的语义需求再升级。
- **每章一个章纲**：备选方案与分支章纲尚未实现。
- **没有搜索索引**：目前可通过目录与精确引用发现策划 Asset；全文搜索和关系搜索尚未实现。
