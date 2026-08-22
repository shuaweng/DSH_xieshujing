/** Public Novel Project repository values. */

import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { ProjectId } from './brand.ts'

export type { ProjectId } from './brand.ts'

/** Stable error codes raised while locating or validating a Novel Project. */
export type NovelRepositoryErrorCode =
  | 'NOVEL_PROJECT_ROOT_INVALID'
  | 'NOVEL_PROJECT_MANIFEST_INVALID'
  | 'NOVEL_PROJECT_MANIFEST_TOO_LARGE'
  | 'NOVEL_PROJECT_DESCRIPTOR_TOO_LARGE'
  | 'NOVEL_PROJECT_SCHEMA_UNSUPPORTED'
  | 'NOVEL_PROJECT_PATH_ESCAPE'

/** One validated version-one Novel Project declaration. */
export interface NovelProjectSnapshot {
  /** Project format version. */
  readonly schema: 1
  /** Stable manifest-owned project identity. */
  readonly id: ProjectId
  /** Author-visible project title. */
  readonly title: string
  /** Canonical project root in the active filesystem provider. */
  readonly root: FsTarget
  /** Canonical `novel.yaml` target. */
  readonly manifest: FsTarget
  /** Canonical content roots keyed by their manifest names. */
  readonly contentRoots: Readonly<Record<string, FsTarget>>
}
