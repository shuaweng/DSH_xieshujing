<p align="center">
  <img src="assets/xieshujing-logo.png" alt="WriteBookWhale" width="260">
</p>

# WriteBookWhale (写书鲸)

WriteBookWhale is a native novel-writing workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Authors and agents operate the same addressable, revisioned novel assets through DSH Presets, Skills, Tools, Sessions, and Subagents.

[中文](README.md)

## Highlights

- File-first projects with manuscript chapters, free-form outlines, volume and chapter outlines, book brief, style profile, and Story State.
- Precise Novel references shared by the workbench and conversation context.
- Typed Novel Tools, reviewable ChangeSets, revision history, restoration, strict chapter review, and deterministic NOAI scanning.
- Bundled writing, revision, review, preference-extraction, and Story State Skills.
- A neutral `novel-workbench` Preset contribution that does not replace the host Profile's default Preset.

## Requirements

- Node.js `^22.19.0 || >=24.0.0`
- DeepSeek Harness release family `{{DSH_VERSION}}`
- A working DSH Web Profile

## Install

Pin a release tag:

```sh
dsh plugin --profile web add \
  github:shuaweng/DSH_xieshujing#v{{PLUGIN_VERSION}}
dsh --profile web
```

Select the Novel Workbench Preset after DSH starts. Installation adds one bundle to the selected Profile and leaves every other Profile unchanged.

## Remove

```sh
dsh plugin --profile web remove @xieshujing/dsh-plugin
```

Removal does not delete Novel Project files or their `.novel/` history data.

See [COMPATIBILITY.md](COMPATIBILITY.md) before upgrading DSH and [SECURITY.md](SECURITY.md) for vulnerability reports.

## License

[MIT](LICENSE). This distribution includes work derived from MIT-licensed DeepSeek Harness; see [NOTICE.md](NOTICE.md).
