# Agent Note: Preset-scoped Novel Workbench activation

Status: proposed

English | [中文](2026-08-23-preset-scoped-novel-workbench-activation.zh.md)

## Problem

The Novel Studio Profile currently replaces the root web layout for its whole process. That proves an isolated workbench can reuse DSH conversation slots, but it also means switching a Session to `standard`, `minimal`, or another Agent preset leaves the Novel UI on screen. A Profile-level capability has accidentally become a Session-independent presentation decision.

Authors also cannot dismiss the workbench without leaving the Profile. The existing collapse controls only affect individual columns, and no model-facing presentation action lets the Novel Agent reveal the workbench when the task needs it.

## Proposal

Keep shipped `ui-layout` as the only root and layout-service owner, and add a selector-routed `shell.workbench` chain to that shell:

- closed mode renders the ordinary sidebar, conversation, details, and overlay slots;
- open mode preserves the sidebar, seats conversation in a resizable Agent column, and elects the registered Novel surface as the primary workbench;
- the mode is transient browser presentation state, not authored Novel data and not a Session Projection;
- the open mode is eligible only when the current Session or blank-session chooser reports the exact `novel-workbench` Agent preset;
- changing to any other Session or preset immediately renders the default frame and clears the open request.

Register an icon-only compact toggle in `conversation.input.left`, the additive one-row composer seat immediately after access/plan controls. Its accessible name and hover title describe the current open/close action without spending permanent Composer width on a text label. A started Session reads only its committed `agentPreset` summary. A blank Session may not have that summary row yet, so `ui-agent-preset` publishes its chooser store through the read-only `ctx.agentPresetSelection` face; only the blank Composer may use this staged value. The toggle renders only when the resulting exact value is `novel-workbench`. Its active state opens or closes the whole workbench; it does not change the Session preset or mutate a Novel Asset.

The Agent/workbench separator previews one clamped CSS track variable at animation-frame cadence and commits `ctx.layout` width only on pointer release. The authored workbench subtree therefore does not re-render for every pointer event, and shell track easing is disabled only for the active gesture. Keyboard resizing continues to commit immediately through the same bounded layout service.

Add `novel_present` to the Novel preset. The first version accepts only `open-workbench` and `close-workbench`. Its tool call/result remains in the Session Log, while the browser consumes the result's presentation metadata through the Novel tool view and updates only transient presentation state. No natural-language parsing, DOM coordinates, filesystem writes, or hidden preset inference are permitted.

The generic `web` Profile remains unchanged. Novel Studio waits for the existing `ui-layout` service and the read-only Agent-preset selection face, then contributes its frame through the generic `shell.workbench` chain. The Novel package imports only public service and layout types; it neither imports another plugin's React implementation nor registers a second root or layout service. This follows Client slot ownership and keeps layout composition inside the shipped shell.

## Alternatives considered

**Show the workbench whenever the Novel Studio Profile is running.** This is the current behavior and makes unrelated presets feel like Novel Agents.

**Dynamically register a second root.** The root slot is intentionally single and rejects a second registration; dynamic shadowing would also destroy child-slot ownership. A selector-routed child surface preserves one root and one layout authority.

**Put the whole workbench in `details`.** Details is an auxiliary session panel with different sizing and lifetime semantics. The manuscript canvas must remain a primary work surface.

**Infer requests from Agent prose.** Parsing “I opened the workbench” is neither durable nor trustworthy. A typed `novel_present` tool is the model-facing contract.

## Acceptance criteria

- A `standard`, `minimal`, or other non-Novel Session in the Novel Studio Profile sees the ordinary DSH frame and no workbench toggle.
- A blank chooser set to `novel-workbench`, and a committed `novel-workbench` Session, initially see the ordinary DSH frame plus one icon-only Composer toggle beside access/plan controls.
- Changing the blank chooser to `standard`, the legacy `novel` preset, or any other preset removes the toggle; a stale previous Session cannot leak eligibility into that blank Composer.
- Pressing the toggle opens the Novel frame; pressing it again returns to the ordinary frame without changing preset or authored content.
- Pointer-dragging the Agent/workbench separator previews smoothly without publishing layout state on every move; release commits one clamped width, while keyboard controls remain available.
- Switching away from the eligible Session/preset closes the workbench rather than leaking it into the next Session.
- `novel_present` can open or close the workbench through durable tool-result metadata, and is available only through the Novel preset composition.
- The default `web` and `headless` compositions remain unchanged.
- Focused client, tool, composition, type, lint, docs, and keyless browser checks cover the ordinary and workbench shell modes, the eligibility gate, manual toggling, and Agent presentation.

## Risks

Switching the shell between its ordinary tracks and a selected workbench may reflow the transcript and editor. Presentation state is intentionally browser-local, so a second browser does not inherit another browser's open/closed choice. Replaying a logged `novel_present` result may restore its presentation intent when its tool card mounts; this is acceptable for the first version because the intent is explicit and scoped to the eligible preset, but a later presentation-event runtime may provide finer live-versus-replay policy.
