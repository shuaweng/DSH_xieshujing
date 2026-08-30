# Agent Note：具备 effect 生命周期的 Agent Preset 根目录

状态：已实现

[English](2026-08-30-effect-scoped-agent-preset-roots.md) | 中文

## 问题

可安装包已经可以通过具备 effect 生命周期的注册表贡献工具、服务、UI 与 Novel Asset 类型，但 Agent Preset 此前只有部署方拥有的 `agent-presets.config.roots`。Profile patch 行会替换插件的整个配置对象，因此两个包若各自 patch `roots`，后安装的一方可能静默抹掉另一方。Novel Studio bundle 还会替换 `default`，使安装一个领域插件改变宿主 Profile 中全部未指定 Preset 的新会话。

把包内 Preset 复制到用户可写根目录虽然能避开配置冲突，却会拆散所有权：升级和卸载都无法区分包材料与用户创作副本。从 Profile patch 解析包目录也会使可复用 bundle 依赖仓库相对路径。

## 决策

`AgentPresets.registerRoot()` 接收稳定 owner id 与一个只读 `system` 根目录。注册 effect 归调用插件所有，因此插件卸载会移除该根目录。部署配置根目录保持最高优先级，存活的包根目录随后按稳定 owner id 排序，Harness home 的 `user` 根目录仍然排在最后。重复的存活 owner id 会同步失败，而不会把激活时序变成隐藏的优先级规则。

已配置根目录在服务构造时冻结。多步创作调用会在解析和写入前快照当前组合根目录，因此插件在一次调用期间卸载也无法改变其写入目的地。包贡献只能是 system 根目录，绝不会成为可写创作目的地。

Novel Studio 现在通过这道接缝注册包内 Preset。其可安装 bundle 不再 patch `roots` 或 `default`。单独的 `dedicated-profile.patch.yml` 表达产品策略：只有明确专用于写作的 Profile 才让未指定 Preset 的新会话默认采用 `novel-workbench`；通用 Profile 安装同一 bundle 后仍可保留 `standard`。

## 测试

`packages/preset/agent-presets/tests/user-root.spec.ts` 证明贡献 Preset 只在调用方 fiber 存活时可见，配置/包/用户根目录优先级确定，包贡献不会让 roster 变得可创作，重复 owner id 会明确失败。

`packages/experimental/novel-studio/tests/bundle.spec.ts` 证明 bundle 在运行时注册包根目录、不 patch `agent-presets`、保留 Web Profile 默认值，并导出一份可独立解析的专用 Profile 层。

## 考虑过的替代方案

**继续 patch `agent-presets.config.roots`。** 拒绝，因为 Profile 配置 patch 最终只有一个对象，不是 contribution 合并协议；最后安装的包可能移除之前的全部根目录。

**安装时把包内 Preset 复制到 `<dshHome>/.agent-presets`。** 拒绝，因为复制后的包文件与用户材料无法区分，每次升级都要迁移，卸载后的归属含糊，而且它会携带 `user` 信任而非包信任。

**由包激活顺序决定根目录优先级。** 拒绝，因为启动时序与依赖变化会改变重复 Preset id 的胜者。稳定 owner id 排序使结果可复现；不同包仍应选择全局唯一的 Preset id。

**让可安装 bundle 设置 `default: novel-workbench`。** 拒绝，因为安装一个领域插件不应静默改变无关的新会话。默认选择属于部署或用户策略，不属于包能力注册。

## 后果

Agent Preset 现在与工具、UI contribution 和 Novel Asset 类型拥有相同的 DSH 原生所有权形态：包拥有可撤销注册，Profile 拥有产品策略。第三方包可以装入现有 Web Profile，而不覆盖其他包的 Preset 根目录，也不接管其默认值。

包卸载时，运行中的会话不受影响，因为它们已经加入一个常驻 Preset 代际；贡献消失后，新的发现与新会话不再解析该包的 Preset。

这只是组合边界，还不是公共分发产物。Novel Studio 仍保持 private 与 workspace 版本，之后的包装工作还需提供品牌门面包、可发布依赖图、兼容性声明、pack 验证与干净安装测试。
