/** Browser-safe Novel Repository Remote values. */

import type { ProjectId } from '@deepseek-ai/dsh-experimental-novel-repository/brand'

/** Read-only project discovery result with no filesystem capability identity. */
export interface NovelProjectDescriptor {
  /** Project format version. */
  readonly schema: 1
  /** Stable manifest-owned project identity. */
  readonly id: ProjectId
  /** Author-visible project title. */
  readonly title: string
  /** Host display path of the canonical project root. */
  readonly rootDisplayPath: string
  /** Host display path of the canonical `novel.yaml`. */
  readonly manifestDisplayPath: string
  /** Host display paths of canonical content roots, keyed by manifest name. */
  readonly contentRootDisplayPaths: Readonly<Record<string, string>>
}
