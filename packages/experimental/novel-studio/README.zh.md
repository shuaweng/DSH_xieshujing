---
description: "组合 Repository、Context、Tools、Preset、Skills 与工作台 UI 的可安装 Novel Studio Profile 层。"
kind: "package-bundle"
---

# 写书鲸 — `@xieshujing/dsh-plugin`

[English](README.md) | 中文

## 概述

这个实验包是可安装、保持中立的 Novel Studio bundle。它组合文件优先 Novel Repository、持久上下文、安全模型工具、浏览器 Remote 和 Agent 原生工作台，但不改变宿主 Profile 的默认 Agent Preset。专门用于写作的 Profile 可以在其上另行叠加导出的 `dedicated-profile.patch.yml`。

源码包在当前 monorepo 中仍保持私有实验状态。受支持的公开边界是预构建的 `@xieshujing/dsh-plugin` 包：`pnpm run pack:xieshujing` 生成其 tarball，`pnpm run export:xieshujing-repository` 则通过同一个暂存函数生成独立 GitHub 仓库树。npm registry 发布仍刻意留到后续阶段。

## 目录

- [行为](#behavior)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="behavior"></a>
## 行为

- 应在现有 base 与 Web App 组合包之后加入本 bundle。它会先插入 Host Asset 类型注册表、独立的自由策划/全书指导 Host/Client contribution 与 `novel-repository-local`，随后加入 context、绑定 Revision 的分析服务、Remote、独立 Client adapter 和 `novel-workbench`。
- 普通 `ui-layout` 始终是唯一根与布局服务拥有者。Novel Workbench 通过按 selector 路由的 `shell.workbench` chain 贡献按 preset 限定的 `novel` surface，因此原生 DSH 侧栏、对话、详情、设置、模型选择、工具渲染与 Session service 仍保持权威。
- 包自带的 `novel-workbench` Agent Preset 组合 Novel persona，并包含需用户批准的 `novel_initialize_project`、`novel_list`、`novel_search`、`novel_create`、`novel_get`、显式只读的 `novel_get_analysis`、`novel_propose_changes` 与 `novel_present`；不包含通用 shell 或文件系统修改工具。
- 同一 Preset 通过标准按需 `skill` 工具挂载十个包内自包含写作/审稿 Skill：新书启动、大纲/beat 设计、章节执行、文风改写、文风审查、场景推进、对白诊断、精确 Revision 章节审稿、草稿/定稿偏好提取与定稿正文 Story State 提取。每个 Skill 声明一个闭集 `novelContextPolicy`；Skill 可以教授方法并选择有边界的上下文策略，但不能扩大 Novel 工具权限。章节执行与场景推进现在会从自由章纲、已确认 Story State、本书风格与必要前文提炼临时执行草案。普通场景直接推进；关键或高不确定场景可以比较 2–3 个短行动方案，等待用户选择或由 Agent 明确选择一项，随后仍默认只通过现有 ChangeSet 流程生成一个正文候选。
- 绑定 Revision 的分析服务为工作台提供确定性 NOAI 扫描、固定 one-shot 审稿人、偏好 worker 与 Story State worker。它们都只收到冻结的有界材料、`skill` 工具与严格 Schema，且不拥有 Asset 修改权限；只有面向用户的 Host 流程可以保留定稿，并通过 ChangeSet 应用已采纳候选。
- 历史作者 Revision 是只读证据。作者可以显式对照并把其中一版恢复为新的、受版本保护的当前 Revision；恢复绝不倒退历史，会把该 Asset 的陈旧提案标为冲突、保留绑定 Revision 的分析证据，并在章节 Canon 可能变化时要求复查 Story State。
- `NovelStudioPaths` 通过 `ctx.agentPresets.registerRoot()` 注册包内 Preset 根。该贡献的 effect 生命周期属于本 bundle，不会替换其他包的根目录配置，并在 bundle 卸载时消失。
- 安装本 bundle 不会改变宿主 Profile 的默认 Preset。默认 `web` 与 `headless` 组合仍不包含 Novel Repository、上下文解析器、Novel Remote、工作台或 Novel 工具。产品若明确把某一 Profile 专用于写作，可以应用 `dedicated-profile.patch.yml`，只把该 Profile 的无显式选择会话默认值改为 `novel-workbench`。

## 本地单包产物

先构建 Host 与 Client 两个 library face，再组装一个可安装 tarball：

```sh
npm run build:lib:host
npm run build:lib:client
pnpm run pack:xieshujing
```

产物位于 `.artifacts/xieshujing-plugin/xieshujing-dsh-plugin-<version>.tgz`。它在一个面向用户的 `@xieshujing/dsh-plugin` 门面中携带九个私有 Novel 实现包，而 DSH 框架与 UI 包仍是由目标 Profile 提供的 peer dependency，因而不会额外加载第二套 Cordis 或 Agent runtime。

只需一条插件命令即可把 tarball 安装到现有 Web Profile：

```sh
pnpm dsh plugin --profile web add \
  "$PWD/.artifacts/xieshujing-plugin/xieshujing-dsh-plugin-0.1.1-rc.2.tgz"
pnpm dsh --profile web --port 3082 --no-open
```

这种中立安装会增加 `novel-workbench` Preset 及其工作台 surface，但不会修改 Profile 默认 Preset。只有明确创建“纯写作 Profile”时才应用 `dedicated-profile.patch.yml`。打包命令完全在本地确定性执行，不访问 GitHub，也不向 npm 发布。

导出公共 GitHub 仓库所使用的同一份预构建目录树：

```sh
pnpm run export:xieshujing-repository
```

结果位于 `.artifacts/xieshujing-repository`。其中没有安装时 build 或 prepare script：生成的 `lib` payload 与九个私有 Novel 实现包已经就位，DSH 框架包则仍保持 peer dependency。这棵目录是公共仓库 `main` 分支的发布输入；monorepo 集成历史继续保留在独立的 integration 分支。

## 从源码 checkout 启动

源码 checkout 使用显式初始化的 `novel-studio` Profile。不能只传 `--patch packages/experimental/novel-studio/cordis.patch.yml`：patch 可以修改配置行，却不能安装新增配置行所引用的包。先链接 Web App，再链接 Novel Studio；由于 pnpm `link:` 不会安装被链接包的 workspace 依赖，还需链接私有运行时包：

```sh
pnpm dsh plugin --profile novel-studio add link:./packages/bundle/web-app
pnpm dsh plugin --profile novel-studio add link:./packages/experimental/novel-studio
pnpm dsh plugin --profile novel-studio add \
  link:./packages/experimental/novel-repository \
  link:./packages/experimental/novel-asset-outline \
  link:./packages/experimental/novel-analysis \
  link:./packages/experimental/novel-context \
  link:./packages/experimental/novel-repository-client \
  link:./packages/experimental/novel-repository-local \
  link:./packages/experimental/novel-repository-remote \
  link:./packages/experimental/novel-workbench \
  link:./packages/experimental/tool-novel \
  link:./packages/skill/skill-filesystem \
  link:./packages/skill/tool-skill
pnpm dsh --profile novel-studio \
  --patch "$PWD/packages/experimental/novel-studio/dedicated-profile.patch.yml" \
  --port 3080
```

最后的 `--patch` 是可选项。若把 Novel Studio 安装到通用 Profile 中就应省略它：`novel-workbench` Preset 仍可选择，但 `standard` 保持默认。专用 Profile 也可以把这份小 patch 一次性复制进自己的 `cordis.patch.yml`，之后继续不带该参数地运行 `pnpm dsh --profile novel-studio`。

<a id="model-experience"></a>
## 模型体验

### Novel Workbench Preset

#### 模型看到的内容

根模型看到 Novel persona、八个稳定 Novel 工具 Schema、标准 `skill` loader 及其紧凑十 Skill 目录，以及一份为当前显式任务编译的精确 V3 Context Manifest。普通 Turn 只保留显式材料和可见 Context Tray 坐标；持久分析报告不会自动注入，作者询问时根 Agent 可通过 `novel_get_analysis` 读取绑定精确章节 Revision 的报告。被选中的章节 Skill 可在确定关系中加入已确认 Story State。审稿与定稿会把单独编译的冻结材料交给专用子 Agent；浏览器布局状态永远不会进入模型上下文。

#### Token 影响

Preset 会加入 persona、八个 Novel Schema、一个 Skill Schema 与紧凑 Skill 目录摘要。只有被调用时，Skill 正文、显式读取的报告与策略选中的创作文本才会增加本次请求 token。精确重复项会折叠；包括 Story State 在内的可选关联文本达到编译预算后降级为坐标，而不是截断或永久注入。NOAI 扫描不消耗 token；审稿与每个适用的定稿提取器各使用有边界的子 Agent 请求。

#### KV Cache 影响

Preset 组合与 Skill 目录在页面和选区变化时保持稳定。Skill 正文作为普通工具结果记录，不追加到 system prefix；请求局部 Novel 上下文跟在直接用户消息之后，因此不改变更早的可复用前缀。

## 已知限制与暂缓事项
<a id="known-limitations-and-deferred-work"></a>

- **没有已发布 Profile 入口**：调用方必须在 base 与 Web App 之后显式安装本 bundle；没有内建 `novel-studio` CLI template 或路由切换器。导出的 dedicated patch 可以改变 Profile 默认值，但刻意不负责安装软件包。
- **GitHub 分发仍锁定 release family**：独立公共仓库分发的预构建包目录与带 tag 的 `.tgz` 和本地产物完全相同。npm registry 发布及更广兼容矩阵仍暂缓；当前 release 面向匹配的 DSH `0.1.1-rc.2` 包族。
- **当前资产范围**：Host 与 Client 注册表已安装 `manuscript.chapter`、自由 `planning.outline`、绑定章节的 `planning.chapter-outline`，以及项目级唯一 `book.brief` / `book.style-profile` / `book.story-state`，并支持一个活动类型化选区和单操作 ChangeSet；人物、灵感、关系与大纲结构编辑仍暂缓。
- **只有人工审阅的定稿学习**：用户可以把精确章节 Revision 标记为定稿，并审阅草稿/定稿偏好候选；没有自动提升、偏好 RAG、跨书作者画像、排序或模型训练。
- **没有语义搜索或实时文件事件**：已有有边界的词法 Asset 检索；关系、语义排序、文件监听和浏览器失效事件流尚未实现。
- **只有首批 Context Compiler 策略**：任务选择保持显式，关系扩展保持确定。Story State 仍是精确自由文本；Scene Execution V1 的草案是请求局部 Skill 指导，不是持久类型化 Contract。语义检索、策略摘要、按模型 token 预算和类型化 Scene Contract 后续可以接在编译器接缝后，而无需改变 V3 冻结 Manifest 的回放契约。
- **仅首批 Skill**：目前改造十个高频启动、写作、诊断、审稿、偏好与状态提取方法。旧的直接文件 Novel Skills 有意不挂载到 Workbench Preset；更多方法会随目标 Asset 类型落地而按 Asset 语义迁移。
- **没有通用编排**：固定只读审稿人已经落地，但可编辑 Role Profile、Task Blackboard、`novel_delegate` 和多 Agent 工作流尚未实现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
