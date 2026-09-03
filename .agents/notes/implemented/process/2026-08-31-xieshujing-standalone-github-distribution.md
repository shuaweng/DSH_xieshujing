# Agent Note: WriteBookWhale standalone GitHub distribution

Status: implemented

English | [中文](2026-08-31-xieshujing-standalone-github-distribution.zh.md)

## Problem

WriteBookWhale already had a verified one-package artifact, but a clean DSH installation still could not install it from its public GitHub repository. The public repository's `main` branch contained only a placeholder README, while the authoritative implementation remained inside the DeepSeek Harness monorepo. A source-based Git install would also require install-time compilation and pnpm build approval, and exposing the entire monorepo as the product repository would give users the wrong ownership and upgrade boundary.

## Decision

The public `main` branch is a generated, prebuilt package repository for `@xieshujing/dsh-plugin`; the monorepo integration history remains on the separate `dsh-integration` branch. `scripts/package-xieshujing-plugin.ts` owns both outputs: the `.tgz` artifact and the standalone repository tree are staged by the same function, so they cannot silently acquire different dependency or Bundle boundaries. The generated repository also carries the product README and its real workbench screenshots, keeping the public product presentation in the same versioned artifact as the runtime it describes.

The generated repository intentionally carries the nine private Novel implementation packages under its `node_modules` subtree. Those packages are marked vendored in `.gitattributes`; DSH, Cordis, Agent, Session, and Client framework packages remain peer dependencies supplied by the host Profile. The repository contains built `lib` output and no `prepare`, `postinstall`, or other install-time execution. A GitHub tag runs a verification workflow and attaches the exact npm tarball to a GitHub Release.

GitHub installation is pinned to a release tag or commit, and the compatibility document pins the matching DSH release family. The neutral Bundle does not change the destination Profile's default Preset. Removing the plugin removes its runtime contribution but never deletes authored Novel Project files.

## Verification

The packaging test exports the public tree and checks its repository metadata, Node engine, absence of install scripts, rendered installation command, bilingual product documentation, brand assets, screenshot set, workflow, and distribution verifier. The release verifier checks that no `workspace:` dependency escaped, every bundled Novel package exists, the facade patch points at `@xieshujing/dsh-plugin`, and no install-time lifecycle script exists. Release acceptance installs the exact GitHub commit into an isolated DSH Profile, inspects the resolved configuration, and removes the plugin again without browser automation.

## Alternatives considered

**Use the whole DeepSeek Harness fork as public `main`.** Rejected because users would clone and update an entire framework fork even though WriteBookWhale is a neutral plugin, and the product repository would expose unrelated upstream history as product ownership.

**Build from TypeScript during Git installation.** Rejected because pnpm deliberately requires approval for dependency build scripts, clean consumers should not need the monorepo toolchain, and an install-time build would make Git installation differ from the verified release artifact.

**Commit only a release tarball.** Rejected because DSH's documented `github:` plugin source installs a package repository, not an opaque asset stored beside a README. A tagged tarball remains available as an alternative download, but `main` itself must be installable.

## Consequences

The public `main` branch is larger and contains generated code, and internal Novel implementation code is visible even though its package boundaries remain private. That cost buys deterministic, script-free Git installation and makes the repository itself match the released npm package tree. Source changes continue in the integration branch and regenerate `main`; contributors must not hand-edit generated runtime files on `main`.

Each release remains coupled to an explicit DSH release family until a compatibility matrix proves broader ranges. GitHub provides the first supported distribution channel; npm publication can be added later without changing the plugin boundary or Novel Project format.
