# Agent Note: 让 Shell 工作台避开原生对话栏

Status: implemented

[English](2026-08-31-shell-workbench-native-conversation-split.md) | 中文

## 问题

`shell.overlay` 会跨越整个 AppFrame。工作台若用固定左侧 inset 定位，就无法知道响应式 DSH 侧栏的实际宽度；与此同时，原生对话仍按占满中间区域的弹性栏布局。Shell 布局升级后，Novel 工作台会在 Composer 结束前开始，直接盖住对话。只增大包内固定偏移，只会让碰撞在不同侧栏状态和视口宽度间移动。

## 决策

继续让原生 AppFrame 与 `shell.overlay` 座位充当唯一应用外壳。DSH 0.1.2 尚未公开 Shell 分栏贡献 API，因此 Novel 插件在 overlay 组件内部拥有一个很窄的兼容适配器。工作台可见时，适配器找到 overlay 已渲染的 Shell 父级，读取原生侧栏 track，并在该 Shell 上临时设置 data attribute 与包命名空间 CSS 变量；随后由一条包内全局规则把现有网格映射为“侧栏、Agent 对话、工作台”三列。

适配器只观察 Shell 的行内网格样式与尺寸，跟随响应式侧栏变化，并在创作画布会过窄时约束 Agent 宽度。关闭或卸载工作台会断开两类 observer，移除所有 attribute 和 CSS 变量。宿主包、私有布局服务与 Session 状态均不改变。

## 考虑过的替代方案

**增大 Novel overlay 的固定 inset。** 一个常量无法同时代表展开、收起与自动收起的侧栏状态；它也会让对话继续居中在 overlay 下方，而不是让两个 surface 共同参与一次布局。

**给 DSH Core 增加私有布局方法。** 这种方案在源码 fork 内拥有最干净的运行时契约，但可安装的第三方插件不能要求宿主带着修改后的 `ui-layout` 类型和实现。将来 DSH 若提供公开 Shell 分栏 API，应以它替换当前兼容适配器。

**用 Novel 专用 Frame 替换原生根。** 竞争根会重复侧栏、对话、设置、详情和 Session 行为，把插件变成平行应用外壳。可叠加 overlay 配合原生布局保留契约可以维持 DSH 权威。

## 后果

打开 Novel 工作台后，Agent 对话成为真实左栏，创作 surface 从解析后的 DSH 侧栏加对话栏之后开始。关闭时恢复普通 DSH 布局，不持久保存这份几何。由于它不改任何宿主运行时包，因此可以面向原版 DSH 0.1.2 分发；但它有意被视作版本限定的兼容接缝，Shell 标记或网格契约变化时必须集中更新适配器。若同时出现多个 Shell overlay，它们仍需在座位层协调，不能堆叠互相冲突的宽度。
