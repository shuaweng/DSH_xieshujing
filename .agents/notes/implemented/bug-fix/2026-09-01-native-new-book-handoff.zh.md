# Agent Note: 让新书初始化完整留在 DSH 原生交接链路中

Status: implemented

[English](2026-09-01-native-new-book-handoff.md) | 中文

## Problem

写书鲸首页过去通过清空当前 Session 来新建小说。这会把用户送回 DSH 的通用新会话页面，丢失已经选择的 Workspace 与 `novel-workbench` Preset，并要求用户再次手工选择两者。初始化布局也过早折叠且自行维护内部滚动，因此较长表单里的品牌水墨背景看起来只覆盖了上半段。

## Decision

首页的新建小说操作会在导航前完成一条 DSH 原生交接链路：通过 `uiWorkspace` 请求目录，使用 Workspace Controller 注册该路径，把一个 Session 连接到所得 Workspace，通过 Agent Presets remote 选择 `novel-workbench` Preset，打开该 Session，最后在未初始化项目的引导页上打开小说工作台。取消目录选择不会产生任何变化；失败时则留在书库首页并在那里展示错误。

初始化画布统一负责纵向滚动。左右分栏会让水墨背景随完整表单高度延伸，并在工作台画布宽度缩小到 560 像素前保持分栏。再窄时，水墨图会改为覆盖整个页面，并在上方叠加暖色半透明层，不再让页面下半段变成纯白。

## Alternatives considered

**清空当前 Session，再让用户重新选择 Workspace 和 Preset。** 这是原来的行为。它把一次明确的新建意图拆成多个手工步骤，也可能让工作台以错误模式重新打开。

**不显示初始化表单，直接在目录中初始化项目。** 这会缩短操作链路，但会在用户填写作品名和可选简介前就写入项目，并取消有意保留的初始化确认步骤。

**维护插件私有的 Workspace 或 Session 注册表。** 这可以减少对 DSH Controller 的依赖，却会产生一套与宿主侧边栏、Session 历史、权限和 Preset 生命周期不一致的平行所有权模型。

## Consequences

新书继续由 DSH 原生的 Workspace、Session 与 Preset 管理，同时会直接抵达带品牌视觉的初始化表单。小说工作台客户端因此新增了对 Workspace Controller 和 Agent Presets remote 的依赖，而且必须在打开目标 Session 前成功选择 Preset。选择已经注册过的目录时沿用 DSH 正常的 Workspace 语义，不创建插件私有状态。
