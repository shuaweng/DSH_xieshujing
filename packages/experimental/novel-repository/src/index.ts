/**
 * Experimental Novel Repository Service Definition. Providers locate and
 * validate Novel Projects without making paths or browser state their identity.
 * @module @deepseek-ai/dsh-experimental-novel-repository
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { NovelRepositoryError } from './error.ts'
import type {
  AssetId,
  AssetSnapshot,
  AssetSummary,
  CaptureSelectionRequest,
  NovelProjectSnapshot,
  RevisionId,
  SaveChapterBodyRequest,
  SelectionRef,
} from './types.ts'

export {
  AssetId,
  ChangeSetId,
  ProjectId,
  RevisionId,
  SelectionRefId,
} from './brand.ts'
export { NovelRepositoryError }
export type {
  Asset,
  AssetRevision,
  AssetSnapshot,
  AssetSummary,
  CaptureSelectionRequest,
  ChangeSet,
  ContentHash,
  NovelAssetType,
  NovelOperation,
  NovelProjectSnapshot,
  NovelRepositoryErrorCode,
  ReplaceTextOperation,
  RevisionOrigin,
  SaveChapterBodyRequest,
  SelectionRef,
  TextRangeSelector,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelRepository: NovelRepository
  }
}

/** Provider-neutral access to validated Novel Project declarations. */
export abstract class NovelRepository extends Service {
  constructor(ctx: Context) {
    super(ctx, 'novelRepository')
  }

  /**
   * Discover and validate the Novel Project rooted at one filesystem target.
   * @param root - Canonical candidate project directory from the active filesystem provider.
   * @param signal - Optional cancellation for all provider I/O.
   * @returns the validated project, or `undefined` when `novel.yaml` is absent.
   * @throws {NovelRepositoryError} when the root or present manifest is invalid or unsupported.
   */
  abstract discoverProject(root: FsTarget, signal?: AbortSignal): Promise<NovelProjectSnapshot | undefined>

  /**
   * Rebuild the current authored catalog and reconcile exact file bytes into immutable Revisions.
   * @param project - validated Project declaration returned by this provider.
   * @param signal - optional cancellation for filesystem and history work.
   * @returns current chapter rows in deterministic project-path order.
   */
  abstract listAssets(project: NovelProjectSnapshot, signal?: AbortSignal): Promise<readonly AssetSummary[]>

  /**
   * Read either the reconciled current head or one retained immutable Revision.
   * @param project - validated Project declaration returned by this provider.
   * @param assetId - stable authored asset identity.
   * @param revisionId - exact retained Revision; omission reconciles and returns the current file head.
   * @param signal - optional cancellation for filesystem and history work.
   * @returns exact serialized bytes and parsed chapter values.
   * @throws {NovelRepositoryError} when the asset or Revision is absent or invalid.
   */
  abstract readAsset(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId?: RevisionId,
    signal?: AbortSignal,
  ): Promise<AssetSnapshot>

  /**
   * Guardedly publish a user-authored chapter body and retain its exact new Revision.
   * @param project - validated Project declaration returned by this provider.
   * @param request - target, current base Revision, and full replacement body.
   * @param signal - optional cancellation before filesystem publication.
   * @returns the committed exact new head.
   * @throws {NovelRepositoryError} when the base is stale or the resulting asset is invalid.
   */
  abstract saveChapterBody(
    project: NovelProjectSnapshot,
    request: SaveChapterBodyRequest,
    signal?: AbortSignal,
  ): Promise<AssetSnapshot>

  /**
   * Freeze one exact non-empty UTF-16 body range without rereading mutable latest content.
   * @param project - validated Project declaration returned by this provider.
   * @param request - retained Revision and body offsets to validate.
   * @param signal - optional cancellation for the history read.
   * @returns immutable selection identity, quote hash, and bounded diagnostics.
   */
  abstract captureSelection(
    project: NovelProjectSnapshot,
    request: CaptureSelectionRequest,
    signal?: AbortSignal,
  ): Promise<SelectionRef>
}

export default NovelRepository
