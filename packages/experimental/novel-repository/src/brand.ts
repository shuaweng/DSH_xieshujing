/** Browser-safe opaque Novel Project identities and runtime constructors. */

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
