<p align="center">
  <img src="assets/xieshujing-logo.png" alt="WriteBookWhale" width="260">
</p>

# WriteBookWhale (写书鲸)

WriteBookWhale is a native novel-writing workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Authors and agents operate the same addressable, revisioned novel assets through DSH Presets, Skills, Tools, Sessions, and Subagents.

English | [中文](README.md)

## Highlights

- File-first projects with manuscript chapters, free-form outlines, volume and chapter outlines, book brief, style profile, and Story State.
- Precise Novel references shared by the workbench and conversation context.
- Agents read, create, and propose edits through typed Novel Tools; manuscript changes use ChangeSets and Revisions instead of bypassing the workbench with direct file writes.
- Bundled chapter execution, scene drive, dialogue diagnostics, style rewriting, strict review, preference extraction, and Story State extraction Skills.
- Revision restore, chapter review, NOAI scanning, finalization, and bounded writing-preference learning.
- A neutral `novel-workbench` Preset contribution that does not replace the host Profile's default Preset.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- DeepSeek Harness release family `0.1.2-alpha.2`
- A working DSH Web Profile

WriteBookWhale currently tracks DSH prereleases. Check the [compatibility matrix](COMPATIBILITY.md) before upgrading DSH.

## Install

Pin a release tag:

```sh
dsh plugin --profile web add \
  github:shuaweng/DSH_xieshujing#v0.1.2-alpha.6
dsh --profile web
```

Select the Novel Workbench Preset after DSH starts. Installation adds one bundle to the selected Profile and leaves every other Profile unchanged.

## Upgrade and remove

Upgrade by running `add` again with the new tag:

```sh
dsh plugin --profile web add \
  github:shuaweng/DSH_xieshujing#v0.1.2-alpha.6
```

Remove the plugin:

```sh
dsh plugin --profile web remove @xieshujing/dsh-plugin
```

Removal only deletes the plugin dependency and bundle layer from the Profile. Novel Project `novel.yaml`, Markdown, YAML, and `.novel/` history data remain in the directory selected by the user.

## Data and permissions

WriteBookWhale writes Novel Assets only inside the Novel Project selected by the current Session. The default Novel Preset does not expose a general shell or arbitrary file-writing tools to the Agent; authored manuscript and planning content changes flow through typed Novel Tools, Revisions, and ChangeSets.

## Feedback

Open a [GitHub Issue](https://github.com/shuaweng/DSH_xieshujing/issues) with reproduction steps, the DSH version, the WriteBookWhale version, and relevant error logs. Follow [SECURITY.md](SECURITY.md) for vulnerability reports.

## License

[MIT](LICENSE). This distribution includes work derived from MIT-licensed DeepSeek Harness; see [NOTICE.md](NOTICE.md).
