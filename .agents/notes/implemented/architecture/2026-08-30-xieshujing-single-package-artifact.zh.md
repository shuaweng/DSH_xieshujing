# Agent Note：写书鲸单包安装产物

状态：已实现

[English](2026-08-30-xieshujing-single-package-artifact.md) | 中文

## 问题

Novel Studio 已经是 DSH 原生 bundle，但从源码 checkout 启动时仍需同时链接门面与九个私有实验实现包。这些包使用 `workspace:` 依赖范围，离开当前 monorepo 后无法解析。若把每个内部包都独立发布，不仅会把偶然的实现图变成公开承诺，还会迫使用户安装多个包，并在过早阶段锁定 GitHub 与 registry 的仓库结构。

把全部 DSH 框架依赖复制进一个自包含 bundle 同样不安全。这样可能在宿主 Profile 旁再加载一套 Cordis、Agent、Session 或 Client runtime，割裂 DSH service 与 UI module-table entry 所依赖的运行时身份。

## 决策

`scripts/package-xieshujing-plugin.ts` 会暂存一个品牌化的 `@xieshujing/dsh-plugin` npm 包。它复制已构建的门面 payload，把九个私有 Novel 实现包作为 npm bundled dependency 携带进来，将其中的 `workspace:` 范围改写为具体兼容版本，并把 `cordis.patch.yml` 中的门面行改写成品牌包名。

DSH 框架、服务与 UI 包仍作为 peer dependency，由目标 Profile 提供；只有普通第三方库和被内置的 Novel 包成为根 dependencies。源码包继续保持 private，并保留仓库原生的 `@deepseek-ai/dsh-experimental-*` 名称；公开安装边界是品牌门面，而不是对整个仓库做大范围换命名空间。

无论从源码还是从暂存产物运行，包内 Preset 根目录 owner 都使用稳定门面 id `@xieshujing/dsh-plugin`。安装仍保持中立：它贡献 `novel-workbench`，但不修改目标 Profile 的默认 Preset；单独的 dedicated patch 继续表示明确的产品策略。

`pnpm run pack:xieshujing` 会在 `.artifacts/xieshujing-plugin` 下生成确定性的本地 tarball。该命令不发布，也不访问 GitHub。PR-C 复用同一个暂存函数导出独立公共 GitHub 仓库，并加入外部安装门禁；npm registry 发布仍属于后续发布边界。

## 测试

`scripts/package-xieshujing-plugin.spec.ts` 会暂存门面，拒绝遗留的 `workspace:` 范围，验证 DSH runtime 仍是 peer，检查全部私有实现包均已内置，检查 npm 的精确 pack 文件清单，并证明品牌 Bundle 行以及代表性的 Host、Client、Remote 产物都存在。

`packages/experimental/novel-studio/tests/bundle.spec.ts` 验证运行时 Preset contribution 使用稳定品牌 owner，同时源码 bundle 仍保持中立。`packages/experimental/novel-analysis/tsdown.config.ts` 还让此前已经声明的 `noai` 公共入口成为真实构建产物，使打包在扫描器不完整时明确失败，而不是静默发出残缺包。

## 考虑过的替代方案

**分别发布全部实验包。** PR-B 拒绝，因为这会把内部接缝变成永久公开包，使安装变成多步骤，并要求在产物边界尚未验证前就先取得 registry 所有权。

**现在就移动或重命名整套 Novel 包图。** 拒绝，因为仓库规则要求实验包在 DeepSeek 命名空间下保持私有，而大范围换 scope 会把分发工程与庞大的源码迁移混在一起。

**把每项依赖都打进一个 JavaScript 文件。** 拒绝，因为 DSH 框架身份必须与宿主共享。内联 Cordis、Agent、Session 或 Client runtime 会制造重复的 service 与 module 身份。

**本地打包前先建立 GitHub。** 拒绝，因为远程仓库无法证明包闭包完整。经过验证的 tarball 才是发布输入；GitHub 与 npm 应在后续 PR 中分发已知产物，而不是过早定义产物。

## 后果

开发者现在可以构建一个 `.tgz`，通过现有 DSH 插件命令安装写书鲸，不再需要链接十个源码包。tarball 携带的是 Novel 实现闭包，而不是第二套 DSH。卸载门面会移除其插件行与 Preset contribution，但作者创建的 Novel Project 文件仍是普通用户数据，不会随插件消失。

该产物通过 peer 范围有意与匹配的 DSH release family 绑定。PR-C 会通过 GitHub 分发完全相同的包目录、记录支持的 DSH 矩阵并验证外部安装；npm 发布仍暂缓。因此，PR-B 继续负责包边界决策，PR-C 则负责公共仓库与 release 流程。
