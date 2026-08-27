# Agent Note: 小说资产顺序

[English](2026-08-27-novel-asset-order.md) | 中文

Status: implemented

## Problem

项目路径顺序虽然稳定，却不能表达作者期望的章节次序。把顺序编码进章节文件名或章节 Revision，会让叙事组织依赖物理路径，或让仅修改元数据的操作污染正文历史。

## Decision

`novel.yaml` 拥有可选的 `assetOrder` 映射，以精确 Asset 类型为键，以稳定 Asset id 的完整序列为值。映射缺失时继续采用确定的项目路径顺序；当前 Asset 若不在已存序列中，则按项目路径排在已列成员之后。

`NovelRepository.reorderAssets()` 接收一个已注册类型，以及该类型全部当前 Asset id 的无重复完整序列。本地 Provider 校验完整集合，通过 `FsVersion` 保护替换 Manifest，并返回已提交顺序的目录。重排不改写 Asset 文件，也不创建 Asset Revision。

浏览器 Explorer 只为 `manuscript.chapter` 开启原生行拖动。它先乐观更新可见目录，通过 Remote Consumer 持久化完整章节序列；成功时采用服务端返回目录，失败时恢复原顺序。`listAssets()` 仍是浏览器导航与 `novel_list` 共同使用的排序来源。

## Alternatives considered

**在每个章节 Frontmatter 中保存顺序字段。** 顺序虽然与章节相邻，但一次拖动会造成多次作者文件写入和章节 Revision，崩溃还可能留下重复或不完整的排序值。

**用数字前缀重命名章节文件。** 稳定 Asset id 能跨重命名保留，但物理组织会变成变更协议，而且多文件重命名不具备原子性。

**只把顺序放在 `.novel` SQLite 或浏览器状态中。** 这能避免写作者文件，却会失去 Git 可移植性；项目迁移后，人和 Agent 还会看到不同顺序。

## Consequences

章节顺序可以跨刷新、重启、文件改名与仓库迁移保留，同时不改变章节历史。通用的类型键映射以后可以支持其他扁平 Asset 列表，不必改变 Manifest 字段。

外部并发修改 `novel.yaml` 时，重排会被拒绝而不是覆盖。新建 Asset 在下一次重排记录完整当前集合前，会确定地排在已存序列之后。协同序列编辑和多用户合并辅助仍不属于单 Host 写入模型。
