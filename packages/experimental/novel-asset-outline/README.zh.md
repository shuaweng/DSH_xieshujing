# @deepseek-ai/dsh-experimental-novel-asset-outline

[English](README.md) | 中文

## 用途

这个实验性 Asset 类型包为精确的 `planning.outline` Asset 提供完整 Host 与 Client 行为。它证明 Novel 注册表可以增加一个结构化创作对象，而无需把大纲分支写进 Repository、Remote API、工作台画布或模型工具。

## 行为

- `planning.outline` Asset 是声明的 `planning` 内容根下的严格 UTF-8 YAML。`novel` mapping 保存 schema、稳定 Asset id、精确类型和标题；`nodes` 保存由稳定资产内 node id 组成的有序树。
- 节点必须包含 `id`、`title` 与 `children`，可选作者字段为 `summary`、`goal`、`conflict` 和 `turn`。重复 id、未知节点字段、YAML warning、alias、控制字符、非法 UTF-8、超过 5,000 个节点或超过 64 层嵌套都会失败关闭。
- 人类保存可以修改大纲标题与上述五个节点字段。序列化会在 YAML 库能够保留时保留无关顶层数据和注释；节点局部格式与注释不属于兼容性承诺。
- 冻结选区是 `{ kind: "outline-node", nodeId, nodeHash }`。hash 把选中节点值绑定到一个已保留 Revision。
- 第一种操作是 `update-outline-node`。它只更新一个既有节点的字段，不能创建、删除、重排、移动父级或改变节点身份。
- Client contribution 把同一类型化值渲染为层级树与字段检查器，捕获节点选区供 Agent 引用，并展示字段级 ChangeSet Diff。

```yaml
novel:
  schema: 1
  id: outline-main
  type: planning.outline
  title: Main Outline
nodes:
  - id: act-one
    title: Act One
    summary: The protagonist reaches White Harbor.
    children:
      - id: opening
        title: Opening
        goal: Establish the rain-soaked harbor.
        children: []
```

## 模型体验

### 结构化大纲上下文与操作

#### 模型看到的内容

`novel_get` 为完整大纲或一个选中节点返回确定性 JSON。稳定 Novel 工具保持不变；类型专属说明会描述精确 `update-outline-node` 形状与限制。

#### Token 影响

安装该类型不会增加工具 Schema。只有模型读取大纲或收到精确大纲节点引用时才会增加 token。

#### KV Cache 影响

切换活动节点或大纲编辑器不会改变工具目录或 system prompt 前缀，只有请求局部的引用内容变化。

## 已知限制与暂缓事项

- **仅字段更新**：节点创建、删除、排序、移动父级、批量编辑与结构 Diff 均暂缓。
- **尚未链接正文节点**：章节引用、Scene/Beat 对象、关系索引与跨 Asset 校验均暂缓。
- **尚无其他规划视图**：卡片、表格、时间线与拖拽未来都应是同一类型化值的投影视图。
- **面向 YAML 源文件**：往返保存保留语义内容和无关顶层值，但节点局部注释与手工格式可能变化。
