# Agent Note: Asset-native Novel new-book bootstrap and project initialization

Status: implemented

English | [中文](2026-08-26-novel-new-book-bootstrap-skill.zh.md)

## Problem

The legacy Novel Preset has a useful `new-book-bootstrap` method for turning a raw premise into a reader promise, story engine, protagonist, opening strategy, and explicit creative red lines. Its persistence model is incompatible with the Novel workbench: it writes a fixed tree of project, style, character, ledger, idea, and planning Markdown files directly, while the workbench requires registered Asset types, exact Revisions, guarded creation, and reviewable ChangeSets. Copying the method would create a second project model and teach the Agent to bypass the workbench.

Project initialization and creative bootstrap are also different operations. Initialization establishes the trusted `novel.yaml` root and repository directories before Novel tools can run. Creative bootstrap is model-guided work inside that initialized project. A Skill cannot safely replace the Host-owned initialization operation.

## Decision

The Novel Workbench Preset ships a package-owned `new-book-bootstrap` Skill. It preserves the legacy method's expectation anchor, small set of materially different alternatives, and explicit `confirmed / candidate / open` summaries, while avoiding a long questionnaire and proposing a concrete interpretation from information the author has already supplied.

The Skill maps confirmed results only to currently registered workbench Assets: the singleton `book.brief`, the author-confirmed `book.style-profile`, freeform book and volume `planning.outline` Assets, chapter-bound `planning.chapter-outline` Assets, and an optional `manuscript.chapter`. Character, location, idea, foreshadowing, and open-question material stays as free Markdown sections in the brief or outline until a dedicated Asset type exists. The Skill does not invent unregistered types or recreate the legacy parallel file and ledger system.

Creation is progressive rather than gated by a fixed scaffold. The default useful starting set is a brief, an author-confirmed style profile when one exists, and one book outline, but authors may draft earlier or create fewer Assets. Before mutation the Agent reports the proposed Asset set and waits for confirmation. It inspects creation rules with `novel_list`, reuses existing Assets found through `novel_search` and `novel_get`, creates only new Assets with `novel_create`, and changes existing Assets only through an exact-Revision `novel_propose_changes` proposal.

The built-in `manuscript.chapter` type owns direct creation of a chapter title and complete Markdown body. Both the Agent and the browser's “New chapter” action use the same generic Repository creation path. When the author asks to put new prose into the book, the Agent creates the complete chapter in one `novel_create` call instead of asking the author to establish an empty container first. If an empty chapter already exists, the type accepts an exact-Revision `insert-text` operation at UTF-16 offset zero; append uses the retained body length, while rewriting existing text remains a non-empty `replace-text`. Both mutations remain reviewable ChangeSet proposals.

The Skill declares the existing `outline-edit` context policy. That policy can add a referenced outline's deterministic parent and brief without installing an always-on new-book context pack. A blank initialized project therefore adds no authored context, while an existing project can continue its bootstrap from exact current Assets.

Project initialization is one Repository operation shared by the browser and the Agent tool. It validates a non-empty title and an existing Session root, rejects an existing `novel.yaml` or non-directory `manuscript`/`planning` conflict, creates missing minimal roots through sandboxed create-only writes, and publishes `novel.yaml` last as the activation marker. It never deletes or replaces an existing authored file. The browser represents an absent manifest as a neutral title form and suppresses Asset/context calls until the project becomes ready. `novel_initialize_project` exposes the same operation to the model only after an explicit user request and a one-shot approval; its settled tool card refreshes an open workbench.

The Skill decides when the author has explicitly requested a new book and may call `novel_initialize_project`; it does not write project files itself. Initialization establishes only project identity and empty content roots. Creative confirmation and Asset creation continue afterward through `novel_list`, `novel_create`, exact reads, and ChangeSet proposals.

## Alternatives considered

**Mount the legacy Skill unchanged.** Rejected because direct creation of its fixed Markdown tree bypasses registered Asset creation, singleton checks, Revision lineage, ChangeSet review, and workbench rendering.

**Turn every legacy template into a dedicated Asset type first.** Rejected because character, location, idea, ledger, and continuity schemas are not yet product decisions. Free Markdown inside the existing brief and outline Assets preserves creative freedom and can be migrated later.

**Let the Skill or generic file tools assemble project files.** Rejected because a prompt method cannot enforce create-only publication, Session-root confinement, approval audit, or provider-neutral validation. The Skill selects the Host-owned initialization tool instead.

**Require browser-only initialization.** Rejected because it creates a deadlock when an author asks the Agent to start a book in an empty folder. Both entry points now share one mutation implementation, while only the Agent entry requires interactive approval.

**Add a permanent new-book context policy.** Rejected for the first version. New projects contain little or no authored material, and existing outline work already has a bounded deterministic policy. A dedicated policy can be added later if new typed bootstrap relations require it.

## Consequences

Authors can invoke one workbench-native method to move from a premise to usable global guidance and planning Assets without learning the Asset schemas. The Agent retains the strongest creative facilitation from the legacy Preset while every persisted result remains visible, versioned, and tool-addressable in the workbench.

Authors can also create a blank editable chapter from the manuscript group, while an Agent can persist a requested new chapter with its complete prose in one operation or propose inserting prose into an already-created blank chapter. These are presentations of the same type-owned mutation contracts rather than separate browser and model implementations.

An empty Session folder is now a recoverable product state rather than a repository error: the author can initialize it from the workbench form or approve the Agent's initialization call. Existing malformed manifests still surface as errors and are never silently overwritten. The model-visible Skill catalog and its keyless loader snapshot include the new method, while the Novel tool roster and prompt advertise the approval-gated initialization path.
