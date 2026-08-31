# Agent Note: WriteBookWhale single-package artifact

Status: implemented

English | [中文](2026-08-30-xieshujing-single-package-artifact.zh.md)

## Problem

Novel Studio was already a DSH-native bundle, but its source-checkout launch required linking the facade plus nine private experimental implementation packages. Those packages use `workspace:` dependency ranges and cannot be resolved outside this monorepo. Publishing every internal package independently would expose an accidental implementation graph, force users to install several packages, and prematurely bind the project to a GitHub and registry layout.

A self-contained bundle that copied all DSH framework dependencies would be equally unsafe. It could load a second Cordis, Agent, Session, or Client runtime beside the host Profile and split the identities that DSH services and UI module-table entries rely on.

## Decision

`scripts/package-xieshujing-plugin.ts` stages one branded `@xieshujing/dsh-plugin` npm package. It copies the built facade payload, carries the nine private Novel implementation packages as npm bundled dependencies, rewrites their `workspace:` ranges to concrete compatible versions, and rewrites the facade row in `cordis.patch.yml` to the branded package name.

DSH framework, service, and UI packages remain peer dependencies supplied by the destination Profile. Only ordinary third-party libraries and the bundled Novel packages are root dependencies. The source packages remain private and retain their repository-native `@deepseek-ai/dsh-experimental-*` names; the public installation boundary is the branded facade rather than a repo-wide rescope.

The package's Preset root owner is the stable facade id `@xieshujing/dsh-plugin`, whether running from source or from the staged artifact. Installation remains neutral: it contributes `novel-workbench` but does not change the destination Profile's default Preset. A separate dedicated patch remains an explicit product policy.

`pnpm run pack:xieshujing` writes a deterministic local tarball under `.artifacts/xieshujing-plugin`. The command does not publish or contact GitHub. PR-C reuses the same staging function to export the standalone public GitHub repository and adds external installation gates; npm registry publication remains a later release boundary.

## Testing

`scripts/package-xieshujing-plugin.spec.ts` stages the facade, rejects remaining `workspace:` ranges, verifies DSH runtime packages stay peers, checks all private implementation packages are bundled, inspects npm's exact pack file list, and proves the branded Bundle row and representative Host/Client/Remote artifacts are present.

`packages/experimental/novel-studio/tests/bundle.spec.ts` verifies the runtime Preset contribution uses the stable branded owner while the source bundle remains neutral. `packages/experimental/novel-analysis/tsdown.config.ts` also makes the previously declared `noai` public entry an actual built artifact, so packing fails rather than silently shipping an incomplete scanner.

## Alternatives considered

**Publish all experimental packages separately.** Rejected for PR-B because it turns internal seams into permanent public packages, makes installation multi-step, and requires registry ownership before the artifact boundary is proven.

**Move or rename the full Novel package graph now.** Rejected because repository rules keep experimental packages private under the DeepSeek namespace, and a broad rescope would mix distribution engineering with a large source migration.

**Bundle every dependency into one JavaScript file.** Rejected because DSH framework identity must be shared with the host. Inlining Cordis, Agent, Session, or Client runtime packages would create duplicate service and module identities.

**Require GitHub before local packaging.** Rejected because a remote repository does not prove package closure. The verified tarball is the release input; GitHub and npm should distribute that known artifact in a later PR rather than define it prematurely.

## Consequences

A developer can now build one `.tgz` and install WriteBookWhale through the existing DSH plugin command instead of linking ten source packages. The tarball is roughly the Novel implementation closure, not a second DSH installation. Uninstalling the facade removes its plugin rows and Preset contribution while authored Novel Project files remain ordinary user data.

The artifact is intentionally version-coupled to the matching DSH release family through peer ranges. PR-C distributes this exact package tree through GitHub, documents the supported DSH matrix, and validates external installation; npm publication is still deferred. PR-B therefore remains the package-boundary decision, while PR-C owns its public repository and release process.
