/** Browser-safe opaque Novel identities and runtime constructors. */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Stable identity declared by one Novel Project manifest. */
export type ProjectId = Branded<'NovelProjectId'>

/**
 * Brand a project-manifest id after its provider validates the serialized value.
 * @param value - Validated manifest id.
 * @returns the same string with the project identity brand.
 */
export function ProjectId(value: string): ProjectId {
  return value as ProjectId
}

/** Stable identity declared by one authored asset. */
export type AssetId = Branded<'NovelAssetId'>

/**
 * Brand an asset id after Frontmatter validation.
 * @param value - Validated Frontmatter asset id.
 * @returns the same string with the asset identity brand.
 */
export function AssetId(value: string): AssetId {
  return value as AssetId
}

/** Opaque identity of one immutable asset Revision. */
export type RevisionId = Branded<'NovelRevisionId'>

/**
 * Brand a provider-created Revision identity.
 * @param value - Provider-created Revision id.
 * @returns the same string with the Revision identity brand.
 */
export function RevisionId(value: string): RevisionId {
  return value as RevisionId
}

/** Opaque identity of one frozen semantic selection. */
export type SelectionRefId = Branded<'NovelSelectionRefId'>

/**
 * Brand a provider-created selection identity.
 * @param value - Provider-created SelectionRef id.
 * @returns the same string with the selection identity brand.
 */
export function SelectionRefId(value: string): SelectionRefId {
  return value as SelectionRefId
}

/** Opaque identity of one durable proposed change. */
export type ChangeSetId = Branded<'NovelChangeSetId'>

/**
 * Brand a provider-created ChangeSet identity.
 * @param value - Provider-created ChangeSet id.
 * @returns the same string with the ChangeSet identity brand.
 */
export function ChangeSetId(value: string): ChangeSetId {
  return value as ChangeSetId
}
