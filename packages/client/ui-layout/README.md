# @deepseek-ai/dsh-client-ui-layout

English | [中文](README.zh.md)

Shell plugin: one root `AppFrame` plus the `ctx.layout` presentation service. It declares the ordinary `sidebar`, `conversation`, `details`, and `shell.overlay` seats and a selector-routed `shell.workbench` chain. With no selected workbench, AppFrame renders the shipped three-column shell and its drag/concession behavior. When a domain package selects its registered id, AppFrame keeps the DSH sidebar, places the Agent conversation in a resizable column, and renders the elected domain workbench as the primary surface; switching away returns to the ordinary frame without installing a second root or layout service. The workbench id, eligible Agent preset, and Agent-column width are browser-local presentation state exposed through `ctx.layout`. A domain separator may preview the private Agent-width CSS track directly during a pointer gesture and commit the service once on release, avoiding full workbench re-renders at raw pointer cadence; track easing is disabled only during that preview. The sidebar resize boundary is an invisible hit strip, while the details boundary retains its floating pill; only details shrinks during concession and then auto-closes. A closed sidebar retains a 56px control rail while details closes to zero width. The plugin also seats the theme presenter: it consumes resolved `ctx.theme` snapshots and projects them onto the document (`html { color-scheme }` for native UA chrome, `body[data-ds-dark-theme]` from the active color scheme, the theme's alias tokens as inline variables on body, and one owned `<meta name="theme-color">` whose content follows the computed body background). Measuring after palette and token application keeps the rendered background as the single color authority; disposing the presenter removes its metadata node with its other global writes.

AppFrame always mounts the conversation and details columns; a connected Session renders through `SessionProvider`. The transient layout store starts the sidebar at its default width and details closed, and it never reads or writes `localStorage`. Hero and other unselected states also derive a zero rendered details width without changing that stored preference. AppFrame retains the last non-blank Session id across those states: the first Session remains closed, an explicit details action opens the contract default width, returning to the same Session restores its unchanged width, and selecting a different Session closes details before paint. The conversation owner share is empty, while the sidebar owner share contains only `collapsed` and `width`; registrants obtain business data from standard hooks and actions from their own inject faces.

The `/client` exports are the plugin body (`apply`/`inject`) and the public layout/owner-share type contracts. AppFrame, its store, the concrete controller, and the concession solver remain package-internal; domain packages compose through `shell.workbench` and `ctx.layout` rather than importing another plugin's React implementation.

## Model Experience

None, as the layout shell manages browser viewing state; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Panel geometry is transient** — reload restores the sidebar default and details closed; switching between distinct Session ids also closes details and forgets its dragged width, while unselected surfaces render details at zero width without modifying geometry.
- **Workbench presentation is browser-local** — reload clears the selected domain workbench and restores the default Agent-column width; it does not enter authored data or Session Projection.
- **Concession-chain auto-close derives a zero width without touching the preferred width** — the panel restores itself when the window widens; consumers must not read the stored details width as the rendered truth.
- **No scroll anchoring during squeeze reflow** — layout changes may move the reader's viewport.
