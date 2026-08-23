# @deepseek-ai/dsh-experimental-novel-asset-outline

English | [中文](README.zh.md)

## Purpose

This experimental Asset-type package contributes complete Host and Client behavior for exact `planning.outline` Assets. It proves that the Novel registries can add a structured authoring object without adding outline branches to the repository, Remote API, workbench canvas, or model tools.

## Behavior

- A `planning.outline` Asset is strict UTF-8 YAML under the declared `planning` content root. Its `novel` mapping owns schema, stable Asset id, exact type, and title; `nodes` owns an ordered tree of stable asset-local node ids.
- Nodes require `id`, `title`, and `children`. Optional authored fields are `summary`, `goal`, `conflict`, and `turn`. Duplicate ids, unknown node fields, YAML warnings, aliases, control characters, invalid UTF-8, more than 5,000 nodes, or more than 64 nesting levels fail closed.
- Human saves may edit the outline title and those five node fields. Serialization preserves unrelated top-level YAML data and comments where the YAML library can retain them; node-local formatting and comments are not a compatibility promise.
- A frozen selection is `{ kind: "outline-node", nodeId, nodeHash }`. The hash binds the selected node value to one retained Revision.
- The first operation is `update-outline-node`. It updates fields on exactly one existing node and cannot create, delete, reorder, reparent, or change node identity.
- The Client contribution renders the same typed value as a hierarchical tree plus field inspector, captures node selections for Agent references, and presents field-level ChangeSet diffs.

```yaml
novel:
  schema: 1
  id: outline-main
  type: planning.outline
  title: Main Outline
nodes:
  - id: act-one
    title: Act One
    summary: The protagonist reaches White Harbor.
    children:
      - id: opening
        title: Opening
        goal: Establish the rain-soaked harbor.
        children: []
```

## Model Experience

### Structured outline context and operation

#### What the model sees

`novel_get` returns deterministic JSON for the complete outline or one selected node. The stable Novel tools remain unchanged; their type-specific instructions describe the exact `update-outline-node` shape and restrictions.

#### Token effect

Installing the type adds no tool schema. Tokens are added only when the model reads an outline or receives an exact outline-node reference.

#### KV Cache effect

Changing the active node or outline editor does not change the tool catalog or system-prompt prefix. Only request-local referenced content changes.

## Known Limitations and Deferred Work

- **Field updates only** — node creation, deletion, ordering, reparenting, bulk edits, and structural diffs are deferred.
- **No linked manuscript nodes** — chapter references, Scene/Beat objects, relation indexing, and cross-Asset validation are deferred.
- **No visual planning alternatives** — cards, tables, timelines, and drag-and-drop are future projections over this same typed value.
- **YAML-oriented source** — round-tripping preserves semantic content and unrelated top-level values, but node-local comments and hand formatting may change after a save.
