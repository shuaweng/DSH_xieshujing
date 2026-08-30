# Agent Note: 小说书库首页

Status: implemented

[English](2026-08-30-novel-library-home.md) | 中文

## Problem

一个 Novel Project 会刻意绑定一个 Session 工作目录，但作者可能把不同小说放在互不相关的文件夹里。如果让首页扫描某个父目录或整台电脑，就会制造第二套项目发现权威、扩大文件系统访问范围，而且仍会漏掉该目录树之外的书。

反复保存 Revision 也使“今日写了多少字”不能通过累加 Revision 大小来计算：同一份章节文字会被重复计数很多次。

## Decision

首页复用 DSH 原生 Workspace 注册表作为书库注册表。每个已登记 Workspace 提供一个现有 Session 地址，Novel Repository Remote 通过该 Session 根目录探测 `novel.yaml`；非小说 Workspace 自动略过。项目文件、Repository 所有权和 Agent 工具仍与以前一样严格绑定 Session 根目录。

对于每个发现的项目，浏览器读取当前 `manuscript.chapter` head 与保留的 Revision 元数据。总字数是当前 head 中排除空白后的字符数。今日数据使用净增量：当前章节字符数减去浏览器本地零点之前最后一份保留 Revision 的字符数。因此反复保存与 Agent 提案不会把数字虚增。

被选中的小说 surface 会从浏览器本地 `home` 页面开始，页面只包含三个汇总数字、一个继续创作动作和已登记书本列表。打开书本时先使用 `ctx.workspaces.connectWorkspace()` 与 `ctx.sessions.open()`，再让既有 Explorer 根据稳定 Asset id 打开目标。跨文件夹内容不会因此注入模型 Prompt。

## Alternatives considered

**从配置的书库根目录扫描文件系统。** 如果不扩大递归访问，它无法表达任意文件夹；同时还会重复 DSH 原生 Workspace 注册表。

**建立小说专属全局注册表。** 这会在 DSH Workspace/Session 之外形成独立的导航与持久化王国。

**累加今天创建的所有 Revision。** 实现便宜，却会把改写和反复保存当作新增正文，奖励版本抖动而不是创作产出。

## Consequences

首页只会看到作者已经登记为 DSH Workspace 的跨文件夹书本。它不扫描整盘，也不改变 Session 作用域、模型上下文、工具或项目 Manifest。

首版复用现有 Remote 读取；存在日初基线时，每章最多需要读取当前版和一份基线版。未来可以在 Repository 中增加汇总投影来优化成本，而无需改变首页契约或制造新真相源。当天删除的章节与当天首次导入的旧稿，会按当前状态变化反映，而不会试图重建键盘输入历史。
