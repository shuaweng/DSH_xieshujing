<p align="center">
  <img src="assets/xieshujing-logo.png" alt="写书鲸" width="260">
</p>

# 写书鲸

写书鲸是面向 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的原生小说创作工作台。作者和 Agent 共用同一套可定位、可版本化的小说资产，在 DSH 的 Preset、Skill、Tool、Session 和 Subagent 体系内完成写作、修改、审查与恢复。

[English](README.en.md)

## 能力

- 文件优先的小说项目，支持正文、全书大纲、卷纲、章纲、本书概述、本书风格与 Story State。
- 对话与工作台共享精确 Novel 坐标，当前资产和选区可直接交给 Agent。
- Agent 通过 Novel Tool 读取、创建和提议修改，正文变更使用 ChangeSet 和 Revision，不绕过工作台直接覆盖文件。
- 内置章节执行、场景推进、对话诊断、文风改写、严格审稿、偏好提取和 Story State 提取 Skill。
- 支持版本恢复、章节审查、NOAI 扫描、定稿与有边界的写作偏好学习。
- 安装后新增 `novel-workbench` Preset，不替换宿主 Profile 原有默认 Preset。

## 要求

- Node.js `^22.19.0 || >=24.0.0`
- DeepSeek Harness `0.1.2-alpha.2` 版本家族
- 已可正常启动的 DSH Web Profile

写书鲸目前跟随 DSH 预发布版本。升级 DSH 前请先查看 [兼容矩阵](COMPATIBILITY.md)。

## 安装

推荐锁定版本标签，避免后续提交在未确认时改变本机运行代码：

```sh
dsh plugin --profile web add \
  github:shuaweng/DSH_xieshujing#v0.1.2-alpha.2
dsh --profile web
```

启动后在 Agent Preset 中选择“小说工作台”，再打开写书鲸入口。安装只会向 `web` Profile 加入写书鲸 bundle，不会修改其他 Profile。

## 升级与卸载

升级时用新标签重新执行 `add`：

```sh
dsh plugin --profile web add \
  github:shuaweng/DSH_xieshujing#v0.1.2-alpha.2
```

卸载：

```sh
dsh plugin --profile web remove @xieshujing/dsh-plugin
```

卸载只移除 Profile 中的插件依赖和 bundle 层。小说项目的 `novel.yaml`、Markdown、YAML 与 `.novel/` 历史数据仍保留在用户选定的目录中。

## 数据和权限

写书鲸只将小说资产写入当前 Session 选定的 Novel Project。默认 Novel Preset 不向 Agent 暴露通用 shell 或任意文件写入工具；正文和策划内容通过类型化 Novel Tool、Revision 与 ChangeSet 修改。

## 问题反馈

请在 [GitHub Issues](https://github.com/shuaweng/DSH_xieshujing/issues) 中提交可复现步骤、DSH 版本、写书鲸版本和错误日志。安全问题请遵循 [SECURITY.md](SECURITY.md)。

## 许可证

[MIT](LICENSE)。写书鲸基于 MIT 许可的 DeepSeek Harness 构建，详见 [NOTICE.md](NOTICE.md)。
