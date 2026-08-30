# Agent Note: Effect-scoped Agent Preset roots

Status: implemented

English | [中文](2026-08-30-effect-scoped-agent-preset-roots.zh.md)

## Problem

An installable package can contribute tools, services, UI, and Novel Asset types through effect-scoped registries, but an Agent Preset previously had only deployment-owned `agent-presets.config.roots`. Profile patch rows replace a plugin's whole config object, so two packages that each patched `roots` could silently erase one another. The Novel Studio bundle also replaced `default`, which made installing a domain plugin change unnamed sessions across the host Profile.

Copying a package Preset into the user's writable root would avoid the config collision, but would split ownership: upgrades and uninstall could not tell package material from user-authored copies. Resolving package directories from a Profile patch also made a reusable bundle depend on repository-relative paths.

## Decision

`AgentPresets.registerRoot()` accepts a stable owner id and one read-only `system` root. The registration is an effect owned by the calling plugin, so unloading that plugin removes its root. Deployment-configured roots keep first precedence, live package roots follow in stable owner-id order, and the Harness-home `user` root remains last. A duplicate live owner id fails synchronously rather than making activation order a hidden precedence rule.

Configured roots are frozen at service construction. Multi-step authoring calls snapshot the current combined roots before resolving and writing, so a plugin unloading during one call cannot redirect its destination. Package contributions are system-only and therefore never become writable authoring destinations.

Novel Studio now registers its package Preset through that seam. Its installable bundle no longer patches either `roots` or `default`. A separate `dedicated-profile.patch.yml` expresses the product choice that an explicitly dedicated writing Profile should default unnamed sessions to `novel-workbench`; a general-purpose Profile can install the same bundle and retain `standard`.

## Testing

`packages/preset/agent-presets/tests/user-root.spec.ts` proves a contributed Preset appears only while its caller fiber is live, configured/package/user precedence is deterministic, contributions do not make the roster authorable, and duplicate owner ids fail loud.

`packages/experimental/novel-studio/tests/bundle.spec.ts` proves the bundle registers its package root at runtime, does not patch `agent-presets`, preserves the Web Profile's default, and exports a separately parseable dedicated-Profile layer.

## Alternatives considered

**Keep patching `agent-presets.config.roots`.** Rejected because Profile config patching has one final object, not a contribution merge protocol. The last installed package could remove every earlier root.

**Copy package Presets into `<dshHome>/.agent-presets` during install.** Rejected because copied package files become indistinguishable from user-owned material, require migration on every update, survive uninstall ambiguously, and carry `user` trust instead of package trust.

**Let package activation order define root precedence.** Rejected because boot timing and dependency changes would alter which duplicate Preset id wins. Stable owner-id order makes the result reproducible; packages should still choose globally distinct Preset ids.

**Make the installable bundle set `default: novel-workbench`.** Rejected because installing one domain plugin must not silently change unrelated new sessions. Default selection is a deployment or user policy, not package capability registration.

## Consequences

Agent Presets now have the same DSH-native ownership shape as tools, UI contributions, and Novel Asset types: the package owns a reversible registration, while the Profile owns product policy. A third-party package can be installed into an existing Web Profile without overwriting another package's Preset roots or taking over its default.

Running sessions are unaffected when a package unloads because they already joined a standing Preset generation. New discovery and new sessions stop resolving that package's Presets after the contribution disappears.

This is a compositional boundary, not yet the public distribution artifact. Novel Studio remains private and workspace-versioned until later packaging work supplies a branded facade, publishable dependency graph, compatibility declaration, pack verification, and clean-install test.
