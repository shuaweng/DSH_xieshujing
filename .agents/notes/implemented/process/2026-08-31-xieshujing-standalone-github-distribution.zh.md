# Agent Note：写书鲸独立 GitHub 分发

状态：已实现

[English](2026-08-31-xieshujing-standalone-github-distribution.md) | 中文

## 问题

写书鲸已经拥有经过验证的单包产物，但干净 DSH 安装仍无法从其公共 GitHub 仓库安装。公共仓库的 `main` 分支只有占位 README，权威实现仍位于 DeepSeek Harness monorepo。基于源码的 Git 安装还会要求安装时编译与 pnpm build 批准；把整个 monorepo 当作产品仓库，则会给用户错误的所有权与升级边界。

## 决策

公共 `main` 分支是为 `@xieshujing/dsh-plugin` 生成的预构建包仓库；monorepo 集成历史继续保留在独立的 `dsh-integration` 分支。`.tgz` 产物与独立仓库树都由 `scripts/package-xieshujing-plugin.ts` 的同一个函数暂存，因此两种输出无法悄然产生不同的依赖或 Bundle 边界。生成仓库也会携带产品 README 与真实工作台截图，让公共产品介绍和它描述的运行时进入同一份版本化产物。

生成仓库有意在其 `node_modules` 子树中携带九个私有 Novel 实现包。这些包在 `.gitattributes` 中标为 vendored；DSH、Cordis、Agent、Session 与 Client 框架包继续作为 peer dependency，由宿主 Profile 提供。仓库包含已构建的 `lib` 输出，不包含 `prepare`、`postinstall` 或其他安装时执行。GitHub tag 会运行验证 workflow，并把完全相同的 npm tarball 附加到 GitHub Release。

GitHub 安装会固定到 release tag 或 commit，兼容性文档则固定匹配的 DSH release family。中立 Bundle 不会修改目标 Profile 的默认 Preset。移除插件只会移除运行时 contribution，永远不会删除作者创建的 Novel Project 文件。

## 验证

打包测试会导出公共目录树，并检查仓库元数据、Node engine、安装 script 缺失、渲染后的安装命令、双语产品文档、品牌资产、截图集、workflow 与分发验证器。release 验证器会检查没有 `workspace:` 依赖泄漏、每个内置 Novel 包都存在、门面 patch 指向 `@xieshujing/dsh-plugin`，且不存在安装时 lifecycle script。release 验收会把精确 GitHub commit 安装到隔离的 DSH Profile，检查解析后的配置，再移除插件；不使用浏览器自动化。

## 考虑过的替代方案

**把整个 DeepSeek Harness fork 作为公共 `main`。** 拒绝，因为用户会为一个中立插件克隆和更新整套框架 fork，而产品仓库也会把无关上游历史表现成产品自身的所有权。

**在 Git 安装期间从 TypeScript 构建。** 拒绝，因为 pnpm 有意要求批准依赖 build script，干净消费者不应安装 monorepo 工具链，且安装时构建会让 Git 安装偏离已经验证的 release 产物。

**仓库只提交 release tarball。** 拒绝，因为 DSH 文档中的 `github:` 插件源安装的是包仓库，而不是 README 旁的一份不透明资产。带 tag 的 tarball 仍作为备选下载，但 `main` 本身必须可安装。

## 后果

公共 `main` 分支更大且包含生成代码；私有 Novel 实现代码也会变得可见，尽管其包边界仍不公开。该代价换来确定性、无 script 的 Git 安装，并让仓库本身与发布的 npm 包目录一致。源码改动继续发生在 integration 分支并重新生成 `main`；贡献者不应在 `main` 手工修改生成的 runtime 文件。

在兼容矩阵证明更宽范围前，每个 release 仍与明确的 DSH release family 绑定。GitHub 是第一条受支持的分发渠道；未来加入 npm 发布时，不需要改变插件边界或 Novel Project 格式。
