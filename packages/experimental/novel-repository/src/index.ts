/**
 * Experimental Novel Repository Service Definition. Providers locate and
 * validate Novel Projects without making paths or browser state their identity.
 * @module @deepseek-ai/dsh-experimental-novel-repository
 */

import { Service, type Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { SandboxExecutionPolicy } from '@deepseek-ai/dsh-sandbox'
import { NovelRepositoryError } from './error.ts'
import type {
  AssetId,
  AssetSnapshot,
  AssetRevisionSummary,
  AssetSummary,
  AssetSearchResult,
  CaptureSelectionRequest,
  CreateAssetRequest,
  ChangeSet,
  ChangeSetAuthorization,
  ChangeSetId,
  NovelProjectSnapshot,
  NovelAnalysisReport,
  NovelSelectionInput,
  PutNovelAnalysisReportRequest,
  ProposeChangeSetRequest,
  RevisionId,
  SaveAssetContentRequest,
  SearchAssetsRequest,
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
  AssetRevisionSummary,
  AssetSnapshot,
  AssetSummary,
  AssetSearchResult,
  CaptureSelectionRequest,
  CreateAssetRequest,
  ChangeSet,
  ChangeSetAuthorization,
  ContentHash,
  ManuscriptChapterContent,
  NovelAssetContent,
  NovelAssetType,
  NovelAssetTypeMap,
  NovelAnalysisReport,
  NovelAnalysisReportKind,
  NovelOperation,
  NovelSelectionInput,
  NovelSelector,
  NovelSelectorFor,
  NovelProjectSnapshot,
  NovelRepositoryErrorCode,
  ProposeChangeSetRequest,
  PutNovelAnalysisReportRequest,
  ReplaceTextOperation,
  RevisionOrigin,
  SaveAssetContentRequest,
  SearchAssetsRequest,
  SelectionRef,
  TextRangeSelectionInput,
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
   * @param sandboxPolicy - optional per-call write policy used if reconciliation must recover an apply journal.
   * @returns current typed Asset rows in deterministic project-path order.
   */
  abstract listAssets(
    project: NovelProjectSnapshot,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<readonly AssetSummary[]>

  /**
   * Search current typed Assets without exposing paths as identity.
   * @param project - validated Project declaration returned by this provider.
   * @param request - bounded text query, optional type allowlist, and result cap.
   * @param signal - optional cancellation for scan and typed model-text extraction.
   * @param sandboxPolicy - optional write policy if catalog reconciliation must recover a journal.
   * @returns deterministically ranked exact current Revision results.
   */
  abstract searchAssets(
    project: NovelProjectSnapshot,
    request: SearchAssetsRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<readonly AssetSearchResult[]>

  /**
   * Create one new typed authored Asset at a provider-owned safe path.
   * @param project - validated Project declaration returned by this provider.
   * @param request - semantic type, title, optional parent, typed content, and actor.
   * @param signal - optional cancellation before filesystem publication.
   * @param sandboxPolicy - optional per-call policy governing file creation.
   * @returns the committed initial Revision of the new Asset.
   */
  abstract createAsset(
    project: NovelProjectSnapshot,
    request: CreateAssetRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<AssetSnapshot>

  /**
   * Read either the reconciled current head or one retained immutable Revision.
   * @param project - validated Project declaration returned by this provider.
   * @param assetId - stable authored asset identity.
   * @param revisionId - exact retained Revision; omission reconciles and returns the current file head.
   * @param signal - optional cancellation for filesystem and history work.
   * @param sandboxPolicy - optional per-call write policy used if current-head reconciliation must recover an apply journal.
   * @returns exact serialized bytes and parsed typed Asset values.
   * @throws {NovelRepositoryError} when the asset or Revision is absent or invalid.
   */
  abstract readAsset(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId?: RevisionId,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<AssetSnapshot>

  /**
   * List metadata for every retained Revision of one Asset, newest first.
   * @param project - validated Project declaration returned by this provider.
   * @param assetId - stable authored Asset identity.
   * @param signal - optional cancellation before history access.
   * @returns exact immutable Revision summaries without serialized prose bytes.
   */
  abstract listAssetRevisions(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    signal?: AbortSignal,
  ): Promise<readonly AssetRevisionSummary[]>

  /**
   * List generated reports attached to one exact retained Revision.
   * @param project - validated Project declaration returned by this provider.
   * @param assetId - stable authored Asset identity.
   * @param revisionId - exact retained Revision identity.
   * @param signal - optional cancellation before history access.
   * @returns reports in stable report-kind order.
   */
  abstract listAnalysisReports(
    project: NovelProjectSnapshot,
    assetId: AssetId,
    revisionId: RevisionId,
    signal?: AbortSignal,
  ): Promise<readonly NovelAnalysisReport[]>

  /**
   * Atomically replace the successful report for one Revision and report kind.
   * @param project - validated Project declaration returned by this provider.
   * @param request - exact Revision, kind, analyzer identity, provenance, and JSON result.
   * @param signal - optional cancellation before durable publication.
   * @returns the validated persisted report.
   */
  abstract putAnalysisReport(
    project: NovelProjectSnapshot,
    request: PutNovelAnalysisReportRequest,
    signal?: AbortSignal,
  ): Promise<NovelAnalysisReport>

  /**
   * Guardedly publish user-authored typed content and retain its exact new Revision.
   * @param project - validated Project declaration returned by this provider.
   * @param request - target, current base Revision, and full typed replacement content.
   * @param signal - optional cancellation before filesystem publication.
   * @param sandboxPolicy - optional per-call policy governing authored-file publication and recovery.
   * @returns the committed exact new head.
   * @throws {NovelRepositoryError} when the base is stale or the resulting asset is invalid.
   */
  abstract saveAssetContent(
    project: NovelProjectSnapshot,
    request: SaveAssetContentRequest,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<AssetSnapshot>

  /**
   * Freeze one exact type-defined selection without rereading mutable latest content.
   * @param project - validated Project declaration returned by this provider.
   * @param request - retained Revision and type-defined selection input to validate.
   * @param signal - optional cancellation for the history read.
   * @returns immutable type-defined selection identity and bounded diagnostics.
   */
  abstract captureSelection<Input extends NovelSelectionInput>(
    project: NovelProjectSnapshot,
    request: CaptureSelectionRequest<Input>,
    signal?: AbortSignal,
  ): Promise<SelectionRef<Input>>

  /**
   * Retain one validated proposal without publishing it to authored files.
   * @param project - validated Project declaration returned by this provider.
   * @param request - exact base Revision, typed operation, actor, and review summary.
   * @param signal - optional cancellation before durable proposal retention.
   * @returns the durable proposal-only ChangeSet.
   */
  abstract proposeChangeSet(
    project: NovelProjectSnapshot,
    request: ProposeChangeSetRequest,
    signal?: AbortSignal,
  ): Promise<ChangeSet>

  /**
   * Read one durable proposal or terminal ChangeSet.
   * @param project - validated Project declaration returned by this provider.
   * @param changeSetId - durable ChangeSet identity within the Project.
   * @param signal - optional cancellation for history access.
   * @returns the validated durable ChangeSet.
   */
  abstract readChangeSet(
    project: NovelProjectSnapshot,
    changeSetId: ChangeSetId,
    signal?: AbortSignal,
  ): Promise<ChangeSet>

  /**
   * Apply one authorized proposal through the crash-recoverable publication protocol.
   * @param project - validated Project declaration returned by this provider.
   * @param changeSetId - durable proposal identity within the Project.
   * @param authorization - explicit Session identity accepting the proposal.
   * @param signal - optional cancellation before authored-file publication begins.
   * @param sandboxPolicy - optional per-call policy governing authored-file publication and recovery.
   * @returns the applied, conflicted, or already terminal ChangeSet.
   */
  abstract applyChangeSet(
    project: NovelProjectSnapshot,
    changeSetId: ChangeSetId,
    authorization: ChangeSetAuthorization,
    signal?: AbortSignal,
    sandboxPolicy?: SandboxExecutionPolicy,
  ): Promise<ChangeSet>

  /**
   * Reject one authorized proposal without changing authored files.
   * @param project - validated Project declaration returned by this provider.
   * @param changeSetId - durable proposal identity within the Project.
   * @param authorization - explicit Session identity rejecting the proposal.
   * @param signal - optional cancellation before durable rejection.
   * @returns the rejected or already terminal ChangeSet.
   */
  abstract rejectChangeSet(
    project: NovelProjectSnapshot,
    changeSetId: ChangeSetId,
    authorization: ChangeSetAuthorization,
    signal?: AbortSignal,
  ): Promise<ChangeSet>
}

export default NovelRepository
