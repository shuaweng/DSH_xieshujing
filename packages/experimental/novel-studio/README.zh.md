# @deepseek-ai/dsh-experimental-novel-studio

[English](README.md) | 中文

## 用途

这个实验包是显式 Novel Studio Profile bundle。它组合文件优先 Novel Repository、持久上下文、安全模型工具、浏览器 Remote 和 Agent 原生工作台，而不修改已发布的 `web` 或 `headless` Profile template。

## 行为

- 应在现有 base 与 Web App 组合包之后加入本 bundle。它会先插入 Host Asset 类型注册表、独立的自由策划/全书指导 Host/Client contribution 与 `novel-repository-local`，随后加入 context、绑定 Revision 的分析服务、Remote、独立 Client adapter 和 `novel-workbench`。
- 普通 `ui-layout` 始终是唯一根与布局服务拥有者。Novel Workbench 通过按 selector 路由的 `shell.workbench` chain 贡献按 preset 限定的 `novel` surface，因此原生 DSH 侧栏、对话、详情、设置、模型选择、工具渲染与 Session service 仍保持权威。
- 包自带的 `novel-workbench` Agent Preset 组合 Novel persona，并包含需用户批准的 `novel_initialize_project`、`novel_list`、`novel_search`、`novel_create`、`novel_get`、显式只读的 `novel_get_analysis`、`novel_propose_changes` 与 `novel_present`；不包含通用 shell 或文件系统修改工具。
- 同一 Preset 通过标准按需 `skill` 工具挂载十个包内自包含写作/审稿 Skill：新书启动、大纲/beat 设计、章节执行、文风改写、文风审查、场景推进、对白诊断、精确 Revision 章节审稿、草稿/定稿偏好提取与定稿正文 Story State 提取。每个 Skill 声明一个闭集 `novelContextPolicy`；Skill 可以教授方法并选择有边界的上下文策略，但不能扩大 Novel 工具权限。
- 绑定 Revision 的分析服务为工作台提供确定性 NOAI 扫描、固定 one-shot 审稿人、偏好 worker 与 Story State worker。它们都只收到冻结的有界材料、`skill` 工具与严格 Schema，且不拥有 Asset 修改权限；只有面向用户的 Host 流程可以保留定稿，并通过 ChangeSet 应用已采纳候选。
- `NovelStudioPaths` 发布包内 Preset 根，因此 `agent-presets` 不需要仓库相对路径即可选择它。
- 默认 `web` 与 `headless` 组合仍不包含 Novel Repository、上下文解析器、Novel Remote、工作台或 Novel 工具。本包仍不添加已发布的全局 Profile template；调用方把它安装到显式 Profile 中。

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
pnpm dsh --profile novel-studio --port 3080
```

## 模型体验

### Novel Workbench Preset

#### 模型看到的内容

根模型看到 Novel persona、八个稳定 Novel 工具 Schema、标准 `skill` loader 及其紧凑十 Skill 目录，以及一份为当前显式任务编译的精确 V3 Context Manifest。普通 Turn 只保留显式材料和可见 Context Tray 坐标；持久分析报告不会自动注入，作者询问时根 Agent 可通过 `novel_get_analysis` 读取绑定精确章节 Revision 的报告。被选中的章节 Skill 可在确定关系中加入已确认 Story State。审稿与定稿会把单独编译的冻结材料交给专用子 Agent；浏览器布局状态永远不会进入模型上下文。

#### Token 影响

Preset 会加入 persona、八个 Novel Schema、一个 Skill Schema 与紧凑 Skill 目录摘要。只有被调用时，Skill 正文、显式读取的报告与策略选中的创作文本才会增加本次请求 token。精确重复项会折叠；包括 Story State 在内的可选关联文本达到编译预算后降级为坐标，而不是截断或永久注入。NOAI 扫描不消耗 token；审稿与每个适用的定稿提取器各使用有边界的子 Agent 请求。

#### KV Cache 影响

Preset 组合与 Skill 目录在页面和选区变化时保持稳定。Skill 正文作为普通工具结果记录，不追加到 system prefix；请求局部 Novel 上下文跟在直接用户消息之后，因此不改变更早的可复用前缀。

## 已知限制与暂缓事项

- **没有已发布 Profile 入口**：调用方必须在 base 与 Web App 之后显式安装本 bundle；没有内建 `novel-studio` CLI template 或路由切换器。
- **当前资产范围**：Host 与 Client 注册表已安装 `manuscript.chapter`、自由 `planning.outline`、绑定章节的 `planning.chapter-outline`，以及项目级唯一 `book.brief` / `book.style-profile` / `book.story-state`，并支持一个活动类型化选区和单操作 ChangeSet；人物、灵感、关系与大纲结构编辑仍暂缓。
- **只有人工审阅的定稿学习**：用户可以把精确章节 Revision 标记为定稿，并审阅草稿/定稿偏好候选；没有自动提升、偏好 RAG、跨书作者画像、排序或模型训练。
- **没有语义搜索或实时文件事件**：已有有边界的词法 Asset 检索；关系、语义排序、文件监听和浏览器失效事件流尚未实现。
- **只有首批 Context Compiler 策略**：任务选择保持显式，关系扩展保持确定。Story State 仍是精确自由文本；语义检索、策略摘要、按模型 token 预算和 Scene Contract 后续可以接在编译器接缝后，而无需改变 V3 冻结 Manifest 的回放契约。
- **仅首批 Skill**：目前改造十个高频启动、写作、诊断、审稿、偏好与状态提取方法。旧的直接文件 Novel Skills 有意不挂载到 Workbench Preset；更多方法会随目标 Asset 类型落地而按 Asset 语义迁移。
- **没有通用编排**：固定只读审稿人已经落地，但可编辑 Role Profile、Task Blackboard、`novel_delegate` 和多 Agent 工作流尚未实现。
