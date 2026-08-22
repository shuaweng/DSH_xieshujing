# 小说工作台基础

[English](novel-workbench.md) | 中文

实验性小说工作台基础声明 Novel Project（小说项目），通过 `ctx.novelRepository` 暴露项目发现能力，并在显式 Profile 层中组合本地文件系统提供方、只读 Host Remote Consumer 与 Client-only 挂载。它不会自动把 Novel 内容加入模型上下文，也不注册 Novel 专属的面向模型工具、提示词 contribution 或 Session 事件。Client adapter 为浏览器挂载项目发现能力，但不贡献专用工作台 UI。完整的权威划分与提交决策由[小说工作台 Agent Note（Agent 决策记录）](../../.agents/notes/proposed/architecture/2026-08-22-novel-workbench-domain-and-commit-protocol.zh.md)负责。

## 项目声明

Novel Project 是包含普通 UTF-8 `novel.yaml` 文件的 Workspace 根目录。该清单是项目标识、格式版本、标题和命名内容根目录的权威；它不是资产清单，也不枚举作者文件。

```yaml
kind: novel-project
schema: 1
id: project_01
title: White Harbor
contentRoots:
  manuscript: manuscript
```

Schema 版本 1 要求 `kind: novel-project`、整数 `schema: 1`、没有首尾空白的非空 id、非空标题，以及包含 `manuscript` 且不超过 32 个条目的 `contentRoots` mapping（映射）。内容根目录名称使用小写 kebab case（短横线命名），每个值都是非空路径字符串；每个声明的内容根必须已经作为目录存在。本地提供方拒绝所有 YAML 解析错误或 warning（警告），包括重复键和 alias（别名），也拒绝无效 UTF-8、编码前或解码后的控制字符、不支持的 schema 版本、超过大小限制的清单、悬空或不是普通文件的标记、缺失或非目录内容根、悬空链接，以及逃出项目根目录的规范化内容根。缺少 `novel.yaml` 表示该目录不是 Novel Project，此时返回 `undefined`；清单存在但声明无效时，系统抛出具有稳定错误码的 `NovelRepositoryError`。

## `ctx.novelRepository`

[`@deepseek-ai/dsh-experimental-novel-repository`](../../packages/experimental/novel-repository) 定义与提供方无关的 `NovelRepository` 服务。`discoverProject(root, signal?)` 接收一个 [`FsTarget`](filesystem.zh.md)，校验一个候选根目录，并返回 `NovelProjectSnapshot`，其中包含声明的 schema、品牌化项目 id、标题、规范的根目录与清单目标，以及每个内容根目录的规范目标。

[`@deepseek-ai/dsh-experimental-novel-repository-local`](../../packages/experimental/novel-repository-local) 是本地提供方。它通过 `ctx.fs` 完成全部路径解析和 containment（范围包含）检查；仅有进程 `cwd` 不能证明路径处于项目内。`manifestMaxBytes` 可配置，默认值为 64 KiB，且不能超过运行时最大 buffer 长度与最大字符串长度中的较小值。项目发现是无状态的只读操作：提供方既不缓存项目目录，也不创建项目文件。

[`@deepseek-ai/dsh-experimental-novel-repository-remote`](../../packages/experimental/novel-repository-remote) 是实验性只读 Host Consumer。其 `ctx.novelRepositoryRemote` 服务发布严格的 `novelRepository/discover` Remote。现有 Gateway 身份策略负责解析被寻址的 Agent；本包不增加授权机制。该 Remote 通过 `ctx.fs` 解析这个 Agent Session 的工作目录，再把校验委托给 `ctx.novelRepository`。Session 没有工作目录时会以项目根目录无效失败。清单不存在时返回 `undefined`；发现项目时返回对浏览器安全的 `NovelProjectDescriptor`，其中包含 schema、稳定项目 id、标题，以及根目录、清单和各命名内容根目录的显示路径。`descriptorMaxBytes` 限制以 UTF-8 编码的完整 descriptor JSON，默认值为 256 KiB，且不能超过运行时最大字符串长度。显示路径只用于定位和展示内容，绝不取代清单持有的项目 id，也不授予写入权限。

[`@deepseek-ai/dsh-experimental-novel-repository-client`](../../packages/experimental/novel-repository-client) 是 Client-only adapter。它通过 `ctx.remote.$mount()` 挂载 Host 包生成的 `./remote` contribution，并随自身 Cordis fiber 撤销该 contribution。独立挂载避免 Host 专属 Agent 与文件系统类型进入 Client 编译 aggregate。

## 当前限制

`novel.yaml` 是当前基础读取的唯一 Novel 专属作者值。发现过程不执行写入，也不创建 `.novel` 目录、数据库、目录索引、缓存或其他项目状态。未来的权威划分与提交语义仍是上文 Agent Note 中的提议设计，并非该已实现子系统的约定。

Repository 尚不扫描内容根目录，不解析资产 Frontmatter，不分配 Asset 或 Revision 标识，不持久化历史，不创建或应用 ChangeSet，不冻结选区，不向 Session 日志加入模型上下文，也不暴露 Novel 工具或专用 Client UI。因此，发现项目不会让其中的任何正文文件自动成为可寻址 Novel Asset。

## Profile 隔离

[`@deepseek-ai/dsh-experimental-novel-studio`](../../packages/experimental/novel-studio) 是私有 bundle，用作显式初始化 Profile 的第三层，位于 `@deepseek-ai/dsh-base` 与 `@deepseek-ai/dsh-web-app` 之后。其 patch 插入本地 Novel Repository 提供方、Host Remote Consumer 与 Client adapter，不替换 `ui-layout`，也不更改现有的 Session 级 `novel` Agent Preset。

默认 `web` 与 `headless` Profile 模板不包含实验性 Novel 包。源码工作区或显式准备的 Profile 必须让私有 bundle 可解析，并按上述顺序列出三层；缺少第三层时，普通 Web 组合没有 `ctx.novelRepository` 提供方。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxnovelrepository--novelrepository-abstract-seam"></a>

### `ctx.novelRepository` — `NovelRepository` (abstract seam)

Provider-neutral access to validated Novel Project declarations.

```ts cordis-catalog
/**
 * Discover and validate the Novel Project rooted at one filesystem target.
 * @param root - Canonical candidate project directory from the active filesystem provider.
 * @param signal - Optional cancellation for all provider I/O.
 * @returns the validated project, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the root or present manifest is invalid or unsupported.
 */
abstract discoverProject(root: FsTarget, signal?: AbortSignal): Promise<NovelProjectSnapshot | undefined>
```

Types: [FsTarget](filesystem.zh.md)

Source: [`packages/experimental/novel-repository/src/index.ts`](../../packages/experimental/novel-repository/src/index.ts)

<a id="ctxnovelrepositoryremote--novelrepositoryremote"></a>

### `ctx.novelRepositoryRemote` — `NovelRepositoryRemote`

Project browser projection consuming the provider-neutral repository service.

```ts cordis-catalog
/**
 * Discover a project at the addressed Agent's Session working directory.
 * @param agent - addressed Agent whose working directory bounds discovery.
 * @param signal - caller cancellation.
 * @returns browser-safe project values, or `undefined` when `novel.yaml` is absent.
 * @throws {NovelRepositoryError} when the Session has no working directory or discovery fails.
 */
@Remote('discover') async discover(agent: Agent, signal: AbortSignal): Promise<NovelProjectDescriptor | undefined>
```

Types: [Agent](core.zh.md)

Source: [`packages/experimental/novel-repository-remote/src/index.ts`](../../packages/experimental/novel-repository-remote/src/index.ts)
<!-- END GENERATED cordis-surface -->
