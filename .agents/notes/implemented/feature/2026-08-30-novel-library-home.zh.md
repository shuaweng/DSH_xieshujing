# Agent Note: 小说书库首页

Status: implemented

[English](2026-08-30-novel-library-home.md) | 中文

## Problem

一个 Novel Project 会刻意绑定一个 Session 工作目录，但作者可能把不同小说放在互不相关的文件夹里。如果让首页扫描某个父目录或整台电脑，就会制造第二套项目发现权威、扩大文件系统访问范围，而且仍会漏掉该目录树之外的书。

反复保存 Revision 也使“今日写了多少字”不能通过累加 Revision 大小来计算：同一份章节文字会被重复计数很多次。

## Decision

首页复用 DSH 原生 Workspace 注册表作为书库注册表。每个已登记 Workspace 提供一个现有 Session 地址，Novel Repository Remote 通过该 Session 根目录探测 `novel.yaml`；非小说 Workspace 自动略过。项目文件、Repository 所有权和 Agent 工具仍与以前一样严格绑定 Session 根目录。

对于每个发现的项目，浏览器读取当前 `manuscript.chapter` head 与保留的 Revision 元数据。总字数是当前 head 中排除空白后的字符数。今日数据使用净增量：当前章节字符数减去浏览器本地零点之前最后一份保留 Revision 的字符数。因此反复保存与 Agent 提案不会把数字虚增。

被选中的小说 surface 会从浏览器本地 `home` 页面开始，页面只包含三个汇总数字、一个继续创作动作和已登记书本列表。每个列表项和继续创作目标都复用一张包内所有的封面底图，并实时叠加书名。可选且有边界的 `novel.yaml` `description` 提供小说简介。缺少简介时只显示浏览器占位，不伪造进度数据。

打开书本时先使用 `ctx.workspaces.connectWorkspace()` 与 `ctx.sessions.open()`，再让既有 Explorer 根据稳定 Asset id 打开目标。`connectWorkspace()` 会刻意复用该 Workspace 下合格的空白对话，或者创建一个；工作台不会发明第二套 Session 生命周期。客户端插件明确依赖原生 `workspaces` 服务，切换失败也会在首页显示。顶部“新建小说”动作通过 DSH 原生控制器关闭工作台并清空活动 Session，把作者带回已有的新 Session/Workspace 流程，而不是打开第二套项目选择器。

首页可见时，Context Tray 会把自动章节跟随替换为一份有边界的 `library-home` surface：汇总数字，以及最多 24 本可见书籍的标题、截断简介、章节数、字数和继续创作标题。工作集与冻结 V3 source 仍保留当前 Session 的 Project id。这只是首页已经可见的展示元数据，不是能力令牌：它不会授予另一部书的 Remote 或 Repository 读取权，也不会复制那些书的作者 Asset。重新进入书本后，surface 会移除并恢复普通 Asset 跟随。

## Alternatives considered

**从配置的书库根目录扫描文件系统。** 如果不扩大递归访问，它无法表达任意文件夹；同时还会重复 DSH 原生 Workspace 注册表。

**建立小说专属全局注册表。** 这会在 DSH Workspace/Session 之外形成独立的导航与持久化王国。

**累加今天创建的所有 Revision。** 实现便宜，却会把改写和反复保存当作新增正文，奖励版本抖动而不是创作产出。

**把封面和简介放进小说专属全局注册表。** 这会让首页成为书本身份的所有者，并与每个 Session 根目录中的 `novel.yaml` 产生漂移。共享封面只是展示资源；简介仍随书存储。

## Consequences

首页只会看到作者已经登记为 DSH Workspace 的跨文件夹书本。它不扫描整盘，也不改变 Session 作用域。它的有界可见摘要通过既有 Novel Context 工作集和 Session Log 冻结，但不会建立跨项目 Asset 权威。版本一项目 Manifest 增加一个可选 `description`；旧清单继续有效，浏览器与需批准的初始化工具共用同一请求。

首版复用现有 Remote 读取；存在日初基线时，每章最多需要读取当前版和一份基线版。未来可以在 Repository 中增加汇总投影来优化成本，而无需改变首页契约或制造新真相源。当天删除的章节与当天首次导入的旧稿，会按当前状态变化反映，而不会试图重建键盘输入历史。
