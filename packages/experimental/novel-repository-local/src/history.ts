/** Durable Revision, ChangeSet, and apply-journal store for one Novel Project. */

import { open, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  AssetId,
  ChangeSetId,
  PreferenceCandidateId,
  NovelRepositoryError,
  ProjectId,
  RevisionId,
  type AssetRevision,
  type AssetRevisionSummary,
  type ChangeSet,
  type ContentHash,
  type NovelAssetType,
  type NovelAnalysisReport,
  type NovelAnalysisReportKind,
  type NovelOperation,
  type NovelPreferenceCandidate,
  type RevisionFinalization,
  type RevisionOrigin,
} from '@deepseek-ai/dsh-experimental-novel-repository'

/** Physical schema containing revisions, proposals, and recoverable apply intent. */
export const NOVEL_HISTORY_SCHEMA_VERSION = 5
/** SQLite application id reserved for DSH Novel history. */
export const NOVEL_HISTORY_APPLICATION_ID = 0x44534E48

interface RevisionRow {
  id: string
  project_id: string
  asset_id: string
  parent_revision_id: string | null
  project_relative_path: string
  serialized_utf8: Uint8Array
  content_hash: string
  origin: string
  created_at: string
}

interface HeadRow {
  revision_id: string
  project_relative_path: string
}

interface ChangeSetRow {
  id: string
  project_id: string
  asset_id: string
  asset_type: string
  base_revision_id: string
  operations_json: string
  actor_json: string
  summary: string
  status: string
  result_revision_id: string | null
}

interface ApplyJournalRow {
  change_set_id: string
  authorized_session_id: string
  project_relative_path: string
  before_hash: string
  after_hash: string
  after_utf8: Uint8Array
  result_revision_id: string
  created_at: string
}

interface AnalysisReportRow {
  project_id: string
  asset_id: string
  revision_id: string
  kind: string
  analyzer_version: string
  generated_at: string
  data_json: string
  source_session_id: string | null
  worker_session_id: string | null
}

interface FinalizationRow {
  project_id: string
  asset_id: string
  revision_id: string
  finalized_at: string
  finalized_by_session_id: string
  source_revision_id: string | null
  source_change_set_id: string | null
  source_session_id: string | null
}

interface PreferenceCandidateRow {
  id: string
  project_id: string
  asset_id: string
  source_revision_id: string
  final_revision_id: string
  source_change_set_id: string | null
  source_session_id: string | null
  target_style_asset_id: string
  target_style_revision_id: string
  extractor_version: string
  generated_at: string
  summary: string
  guidance_markdown: string
  evidence_json: string
  status: string
  decided_at: string | null
  decided_by_session_id: string | null
  result_change_set_id: string | null
  result_revision_id: string | null
}

/** Exact durable intent needed to finish or reject an interrupted publication. */
export interface ApplyJournal {
  readonly changeSetId: ChangeSetId
  readonly authorizedSessionId: SessionId
  readonly projectRelativePath: string
  readonly beforeHash: ContentHash
  readonly afterHash: ContentHash
  readonly afterUtf8: Uint8Array
  readonly resultRevisionId: RevisionId
  readonly createdAt: string
}

async function createPrivateFile(path: string): Promise<void> {
  const handle = await open(path, 'a', 0o600)
  try {
    await handle.chmod(0o600)
  } finally {
    await handle.close()
  }
}

/**
 * Open and validate one Novel history database without resetting unknown data.
 * @param path - absolute SQLite database path owned by the Novel Project.
 * @param busyTimeoutMs - maximum SQLite lock wait in milliseconds.
 * @param decodeOperations - exact Asset-type decoder used to validate persisted ChangeSet operations.
 * @returns a validated history connection with current schema.
 */
export async function openHistory(
  path: string,
  busyTimeoutMs: number,
  decodeOperations: (assetType: string, value: unknown) => readonly NovelOperation[],
): Promise<NovelHistory> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await createPrivateFile(path)
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path, { timeout: busyTimeoutMs })
  try {
    configure(db, path)
    return new NovelHistory(db, decodeOperations)
  } catch (error: unknown) {
    db.close()
    throw error
  }
}

function integerField(value: unknown, key: string): number {
  /* v8 ignore next -- supported node:sqlite PRAGMA queries always return one row object. */
  if (typeof value !== 'object' || value === null) throw new Error(`missing SQLite field ${key}`)
  const field: unknown = Reflect.get(value, key)
  /* v8 ignore next -- the selected SQLite PRAGMAs are defined integer-valued fields. */
  if (typeof field !== 'number' || !Number.isSafeInteger(field)) throw new Error(`invalid SQLite field ${key}`)
  return field
}

function configure(db: DatabaseSync, path: string): void {
  db.exec('PRAGMA trusted_schema = OFF')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA synchronous = FULL')
  const version = integerField(db.prepare('PRAGMA user_version').get(), 'user_version')
  const applicationId = integerField(db.prepare('PRAGMA application_id').get(), 'application_id')
  const objectCount = integerField(db.prepare(
    "SELECT count(*) AS count FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'",
  ).get(), 'count')
  if (version === 0 && (applicationId !== 0 || objectCount !== 0)) {
    throw new NovelRepositoryError(
      `novel repository: history database "${path}" has an unversioned schema or application identity`,
      'NOVEL_HISTORY_CORRUPT',
    )
  }
  if (version !== 0 && version !== 1 && version !== 2 && version !== 3 && version !== 4
    && version !== NOVEL_HISTORY_SCHEMA_VERSION) {
    throw new NovelRepositoryError(
      `novel repository: history database "${path}" uses unsupported schema ${version}`,
      'NOVEL_HISTORY_SCHEMA_UNSUPPORTED',
    )
  }
  if (version !== 0 && applicationId !== NOVEL_HISTORY_APPLICATION_ID) {
    throw new NovelRepositoryError(
      `novel repository: history database "${path}" has an unexpected application identity`,
      'NOVEL_HISTORY_CORRUPT',
    )
  }

  db.exec('BEGIN IMMEDIATE')
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS revisions (
        id                    TEXT PRIMARY KEY,
        project_id            TEXT NOT NULL,
        asset_id              TEXT NOT NULL,
        parent_revision_id    TEXT REFERENCES revisions(id),
        project_relative_path TEXT NOT NULL,
        serialized_utf8       BLOB NOT NULL,
        content_hash          TEXT NOT NULL,
        origin                TEXT NOT NULL CHECK(origin IN ('initial-scan', 'user-edit', 'agent-apply', 'external-edit')),
        created_at            TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS revisions_asset_created
        ON revisions(project_id, asset_id, created_at, id);
      CREATE TABLE IF NOT EXISTS asset_heads (
        project_id            TEXT NOT NULL,
        asset_id              TEXT NOT NULL,
        revision_id           TEXT NOT NULL REFERENCES revisions(id),
        project_relative_path TEXT NOT NULL,
        PRIMARY KEY(project_id, asset_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS change_sets (
        id                 TEXT PRIMARY KEY,
        project_id         TEXT NOT NULL,
        asset_id           TEXT NOT NULL,
        asset_type         TEXT NOT NULL,
        base_revision_id   TEXT NOT NULL REFERENCES revisions(id),
        operations_json    TEXT NOT NULL,
        actor_json         TEXT NOT NULL,
        summary            TEXT NOT NULL,
        status             TEXT NOT NULL CHECK(status IN ('proposed', 'applying', 'applied', 'rejected', 'conflicted')),
        result_revision_id TEXT REFERENCES revisions(id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS change_sets_asset
        ON change_sets(project_id, asset_id, id);
      CREATE TABLE IF NOT EXISTS apply_journal (
        change_set_id         TEXT PRIMARY KEY REFERENCES change_sets(id),
        authorized_session_id TEXT NOT NULL,
        project_relative_path TEXT NOT NULL,
        before_hash           TEXT NOT NULL,
        after_hash            TEXT NOT NULL,
        after_utf8            BLOB NOT NULL,
        result_revision_id    TEXT NOT NULL,
        created_at            TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS analysis_reports (
        project_id       TEXT NOT NULL,
        asset_id         TEXT NOT NULL,
        revision_id      TEXT NOT NULL REFERENCES revisions(id),
        kind             TEXT NOT NULL CHECK(kind IN ('chapter-review', 'noai-scan')),
        analyzer_version TEXT NOT NULL,
        generated_at     TEXT NOT NULL,
        data_json        TEXT NOT NULL,
        source_session_id TEXT,
        worker_session_id TEXT,
        PRIMARY KEY(project_id, asset_id, revision_id, kind)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS analysis_reports_revision
        ON analysis_reports(project_id, asset_id, revision_id, kind);
      CREATE TABLE IF NOT EXISTS revision_finalizations (
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        revision_id TEXT NOT NULL REFERENCES revisions(id),
        finalized_at TEXT NOT NULL,
        finalized_by_session_id TEXT NOT NULL,
        source_revision_id TEXT REFERENCES revisions(id),
        source_change_set_id TEXT REFERENCES change_sets(id),
        source_session_id TEXT,
        PRIMARY KEY(project_id, asset_id, revision_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS revision_finalizations_asset
        ON revision_finalizations(project_id, asset_id, finalized_at, revision_id);
      CREATE TABLE IF NOT EXISTS preference_candidates (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        asset_id TEXT NOT NULL,
        source_revision_id TEXT NOT NULL REFERENCES revisions(id),
        final_revision_id TEXT NOT NULL REFERENCES revisions(id),
        source_change_set_id TEXT REFERENCES change_sets(id),
        source_session_id TEXT,
        target_style_asset_id TEXT NOT NULL,
        target_style_revision_id TEXT NOT NULL REFERENCES revisions(id),
        extractor_version TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        summary TEXT NOT NULL,
        guidance_markdown TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'accepted', 'rejected')),
        decided_at TEXT,
        decided_by_session_id TEXT,
        result_change_set_id TEXT REFERENCES change_sets(id),
        result_revision_id TEXT REFERENCES revisions(id),
        UNIQUE(project_id, asset_id, final_revision_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS preference_candidates_final
        ON preference_candidates(project_id, asset_id, final_revision_id, generated_at, id);
    `)
    const changeSetColumns = db.prepare('PRAGMA table_info(change_sets)').all() as Array<{ name: string }>
    if (version > 0 && version < 3 && !changeSetColumns.some(column => column.name === 'asset_type')) {
      db.exec("ALTER TABLE change_sets ADD COLUMN asset_type TEXT NOT NULL DEFAULT 'manuscript.chapter'")
    }
    if (version === 0) db.exec(`PRAGMA application_id = ${NOVEL_HISTORY_APPLICATION_ID}`)
    if (version < NOVEL_HISTORY_SCHEMA_VERSION) db.exec(`PRAGMA user_version = ${NOVEL_HISTORY_SCHEMA_VERSION}`)
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  }
}

/** Synchronous transaction facade over one project-owned database handle. */
export class NovelHistory {
  constructor(
    private readonly db: DatabaseSync,
    private readonly decodeOperations: (assetType: string, value: unknown) => readonly NovelOperation[],
  ) {}

  /** Close the owned SQLite connection. */
  close(): void {
    this.db.close()
  }

  /**
   * Read the reconciled head row for one Asset.
   * @param projectId - stable Novel Project identity.
   * @param assetId - stable authored Asset identity.
   * @returns the current Revision and mutable path projection, when indexed.
   */
  head(projectId: ProjectId, assetId: AssetId): HeadRow | undefined {
    return this.db.prepare(`
      SELECT revision_id, project_relative_path
      FROM asset_heads WHERE project_id = ? AND asset_id = ?
    `).get(projectId, assetId) as HeadRow | undefined
  }

  /**
   * Read one immutable retained Revision.
   * @param revisionId - exact retained Revision identity.
   * @returns the immutable Revision and its path at commit time, when retained.
   */
  revision(revisionId: RevisionId): { revision: AssetRevision; projectRelativePath: string } | undefined {
    const row = this.db.prepare(`
      SELECT id, project_id, asset_id, parent_revision_id, project_relative_path,
             serialized_utf8, content_hash, origin, created_at
      FROM revisions WHERE id = ?
    `).get(revisionId) as RevisionRow | undefined
    if (row === undefined) return undefined
    return {
      revision: {
        id: RevisionId(row.id),
        projectId: ProjectId(row.project_id),
        assetId: AssetId(row.asset_id),
        ...(row.parent_revision_id === null ? {} : { parentRevisionId: RevisionId(row.parent_revision_id) }),
        serializedUtf8: new Uint8Array(row.serialized_utf8),
        contentHash: row.content_hash as ContentHash,
        origin: row.origin as RevisionOrigin,
        createdAt: row.created_at,
      },
      projectRelativePath: row.project_relative_path,
    }
  }

  /**
   * List immutable Revision metadata for one Asset, newest first.
   * @param projectId - stable Novel Project identity.
   * @param assetId - stable authored Asset identity.
   * @returns metadata-only retained Revision rows.
   */
  revisions(projectId: ProjectId, assetId: AssetId): readonly AssetRevisionSummary[] {
    const rows = this.db.prepare(`
      SELECT revisions.id, revisions.project_id, revisions.asset_id,
             revisions.parent_revision_id, revisions.project_relative_path,
             revisions.serialized_utf8, revisions.content_hash, revisions.origin,
             revisions.created_at
      FROM revisions
      LEFT JOIN asset_heads
        ON asset_heads.project_id = revisions.project_id
       AND asset_heads.asset_id = revisions.asset_id
      WHERE revisions.project_id = ? AND revisions.asset_id = ?
      ORDER BY CASE WHEN revisions.id = asset_heads.revision_id THEN 0 ELSE 1 END,
               revisions.created_at DESC, revisions.id DESC
    `).all(projectId, assetId) as unknown as RevisionRow[]
    return rows.map(row => ({
      id: RevisionId(row.id),
      projectId: ProjectId(row.project_id),
      assetId: AssetId(row.asset_id),
      ...(row.parent_revision_id === null ? {} : { parentRevisionId: RevisionId(row.parent_revision_id) }),
      contentHash: row.content_hash as ContentHash,
      origin: revisionOrigin(row.origin),
      createdAt: row.created_at,
    }))
  }

  /** Read the applied ChangeSet which produced an exact Revision, if any. */
  changeSetByResultRevision(revisionId: RevisionId): ChangeSet | undefined {
    const row = this.db.prepare(`
      SELECT id, project_id, asset_id, base_revision_id, operations_json,
             asset_type, actor_json, summary, status, result_revision_id
      FROM change_sets WHERE result_revision_id = ? AND status = 'applied'
      ORDER BY id LIMIT 1
    `).get(revisionId) as ChangeSetRow | undefined
    return row === undefined ? undefined : changeSetFromRow(row, this.decodeOperations)
  }

  /** Retain an idempotent explicit finalization decision. */
  putFinalization(value: RevisionFinalization): RevisionFinalization {
    this.db.prepare(`
      INSERT OR IGNORE INTO revision_finalizations (
        project_id, asset_id, revision_id, finalized_at, finalized_by_session_id,
        source_revision_id, source_change_set_id, source_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      value.projectId, value.assetId, value.revisionId, value.finalizedAt,
      value.finalizedBySessionId, value.sourceRevisionId ?? null,
      value.sourceChangeSetId ?? null, value.sourceSessionId ?? null,
    )
    return requiredFinalization(this.finalization(value.projectId, value.assetId, value.revisionId))
  }

  finalization(projectId: ProjectId, assetId: AssetId, revisionId: RevisionId): RevisionFinalization | undefined {
    const row = this.db.prepare(`
      SELECT project_id, asset_id, revision_id, finalized_at, finalized_by_session_id,
             source_revision_id, source_change_set_id, source_session_id
      FROM revision_finalizations
      WHERE project_id = ? AND asset_id = ? AND revision_id = ?
    `).get(projectId, assetId, revisionId) as FinalizationRow | undefined
    return row === undefined ? undefined : finalizationFromRow(row)
  }

  finalizations(projectId: ProjectId, assetId: AssetId): readonly RevisionFinalization[] {
    const rows = this.db.prepare(`
      SELECT project_id, asset_id, revision_id, finalized_at, finalized_by_session_id,
             source_revision_id, source_change_set_id, source_session_id
      FROM revision_finalizations WHERE project_id = ? AND asset_id = ?
      ORDER BY finalized_at DESC, revision_id DESC
    `).all(projectId, assetId) as unknown as FinalizationRow[]
    return rows.map(finalizationFromRow)
  }

  putPreferenceCandidate(value: NovelPreferenceCandidate): NovelPreferenceCandidate {
    this.db.prepare(`
      INSERT INTO preference_candidates (
        id, project_id, asset_id, source_revision_id, final_revision_id,
        source_change_set_id, source_session_id, target_style_asset_id,
        target_style_revision_id, extractor_version, generated_at, summary,
        guidance_markdown, evidence_json, status, decided_at,
        decided_by_session_id, result_change_set_id, result_revision_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, asset_id, final_revision_id) DO UPDATE SET
        extractor_version = excluded.extractor_version,
        generated_at = excluded.generated_at,
        summary = excluded.summary,
        guidance_markdown = excluded.guidance_markdown,
        evidence_json = excluded.evidence_json,
        target_style_asset_id = excluded.target_style_asset_id,
        target_style_revision_id = excluded.target_style_revision_id
      WHERE preference_candidates.status = 'pending'
    `).run(
      value.id, value.projectId, value.assetId, value.sourceRevisionId, value.finalRevisionId,
      value.sourceChangeSetId ?? null, value.sourceSessionId ?? null,
      value.targetStyleAssetId, value.targetStyleRevisionId, value.extractorVersion,
      value.generatedAt, value.summary, value.guidanceMarkdown,
      JSON.stringify(value.evidence), value.status, value.decidedAt ?? null,
      value.decidedBySessionId ?? null, value.resultChangeSetId ?? null,
      value.resultRevisionId ?? null,
    )
    return requiredCandidate(this.preferenceCandidateForFinal(value.projectId, value.assetId, value.finalRevisionId))
  }

  preferenceCandidate(id: PreferenceCandidateId): NovelPreferenceCandidate | undefined {
    const row = this.db.prepare('SELECT * FROM preference_candidates WHERE id = ?')
      .get(id) as PreferenceCandidateRow | undefined
    return row === undefined ? undefined : preferenceCandidateFromRow(row)
  }

  preferenceCandidateForFinal(
    projectId: ProjectId,
    assetId: AssetId,
    finalRevisionId: RevisionId,
  ): NovelPreferenceCandidate | undefined {
    const row = this.db.prepare(`
      SELECT * FROM preference_candidates
      WHERE project_id = ? AND asset_id = ? AND final_revision_id = ?
    `).get(projectId, assetId, finalRevisionId) as PreferenceCandidateRow | undefined
    return row === undefined ? undefined : preferenceCandidateFromRow(row)
  }

  preferenceCandidates(
    projectId: ProjectId,
    assetId: AssetId,
    finalRevisionId: RevisionId,
  ): readonly NovelPreferenceCandidate[] {
    const value = this.preferenceCandidateForFinal(projectId, assetId, finalRevisionId)
    return value === undefined ? [] : [value]
  }

  decidePreferenceCandidate(
    id: PreferenceCandidateId,
    status: 'accepted' | 'rejected',
    decidedAt: string,
    sessionId: SessionId,
    result?: { readonly changeSetId: ChangeSetId; readonly revisionId: RevisionId },
  ): NovelPreferenceCandidate | undefined {
    const current = this.preferenceCandidate(id)
    if (current === undefined || current.status !== 'pending') return current
    this.db.prepare(`
      UPDATE preference_candidates SET status = ?, decided_at = ?, decided_by_session_id = ?,
        result_change_set_id = ?, result_revision_id = ?
      WHERE id = ? AND status = 'pending'
    `).run(status, decidedAt, sessionId, result?.changeSetId ?? null, result?.revisionId ?? null, id)
    return this.preferenceCandidate(id)
  }

  /**
   * List generated reports for one retained Revision in stable kind order.
   * @param projectId - stable Novel Project identity.
   * @param assetId - stable authored Asset identity.
   * @param revisionId - exact retained Revision identity.
   * @returns validated generated reports.
   */
  analysisReports(
    projectId: ProjectId,
    assetId: AssetId,
    revisionId: RevisionId,
  ): readonly NovelAnalysisReport[] {
    const rows = this.db.prepare(`
      SELECT project_id, asset_id, revision_id, kind, analyzer_version,
             generated_at, data_json, source_session_id, worker_session_id
      FROM analysis_reports
      WHERE project_id = ? AND asset_id = ? AND revision_id = ?
      ORDER BY kind
    `).all(projectId, assetId, revisionId) as unknown as AnalysisReportRow[]
    return rows.map(analysisReportFromRow)
  }

  /**
   * Atomically replace the successful generated report for one Revision and kind.
   * @param report - validated exact-Revision report to retain.
   */
  putAnalysisReport(report: NovelAnalysisReport): void {
    this.db.prepare(`
      INSERT INTO analysis_reports (
        project_id, asset_id, revision_id, kind, analyzer_version,
        generated_at, data_json, source_session_id, worker_session_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(project_id, asset_id, revision_id, kind) DO UPDATE SET
        analyzer_version = excluded.analyzer_version,
        generated_at = excluded.generated_at,
        data_json = excluded.data_json,
        source_session_id = excluded.source_session_id,
        worker_session_id = excluded.worker_session_id
    `).run(
      report.projectId,
      report.assetId,
      report.revisionId,
      report.kind,
      report.analyzerVersion,
      report.generatedAt,
      JSON.stringify(report.data),
      report.sourceSessionId ?? null,
      report.workerSessionId ?? null,
    )
  }

  /**
   * Insert one immutable Revision and advance its Asset head atomically.
   * @param revision - exact immutable Revision bytes and metadata to retain.
   * @param projectRelativePath - authored Project path associated with the Revision.
   */
  commitRevision(revision: AssetRevision, projectRelativePath: string): void {
    this.transaction(() => {
      this.insertRevision(revision, projectRelativePath)
      this.putHead(revision.projectId, revision.assetId, revision.id, projectRelativePath)
    })
  }

  /**
   * Update only the mutable path projection after an authored file rename.
   * @param projectId - stable Novel Project identity.
   * @param assetId - stable authored Asset identity.
   * @param revisionId - current retained Revision identity.
   * @param path - new Project-relative authored path.
   */
  updateHeadPath(projectId: ProjectId, assetId: AssetId, revisionId: RevisionId, path: string): void {
    this.putHead(projectId, assetId, revisionId, path)
  }

  /**
   * Insert one validated proposal.
   * @param changeSet - proposal-only ChangeSet to retain durably.
   */
  proposeChangeSet(changeSet: ChangeSet): void {
    this.db.prepare(`
      INSERT INTO change_sets (
        id, project_id, asset_id, asset_type, base_revision_id,
        operations_json, actor_json, summary, status, result_revision_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      changeSet.id,
      changeSet.projectId,
      changeSet.assetId,
      changeSet.assetType,
      changeSet.baseRevisionId,
      JSON.stringify(changeSet.operations),
      JSON.stringify(changeSet.actor),
      changeSet.summary,
      changeSet.status,
      changeSet.resultRevisionId ?? null,
    )
  }

  /**
   * Read one ChangeSet, validating its persisted JSON contract.
   * @param changeSetId - durable ChangeSet identity.
   * @returns the validated ChangeSet, when retained.
   */
  changeSet(changeSetId: ChangeSetId): ChangeSet | undefined {
    const row = this.db.prepare(`
      SELECT id, project_id, asset_id, base_revision_id, operations_json,
             asset_type, actor_json, summary, status, result_revision_id
      FROM change_sets WHERE id = ?
    `).get(changeSetId) as ChangeSetRow | undefined
    return row === undefined ? undefined : changeSetFromRow(row, this.decodeOperations)
  }

  /**
   * Mark a proposal rejected; terminal calls are idempotent.
   * @param changeSetId - durable ChangeSet identity.
   * @returns the current terminal or newly rejected ChangeSet, when retained.
   */
  rejectChangeSet(changeSetId: ChangeSetId): ChangeSet | undefined {
    const current = this.changeSet(changeSetId)
    if (current === undefined || current.status !== 'proposed') return current
    this.db.prepare("UPDATE change_sets SET status = 'rejected' WHERE id = ? AND status = 'proposed'").run(changeSetId)
    return this.changeSet(changeSetId)
  }

  /**
   * Durably record exact publication intent before touching the authored file.
   * @param changeSetId - proposal entering the applying state.
   * @param journal - exact authorized bytes and hashes needed for recovery.
   * @returns the applying ChangeSet.
   */
  startApply(changeSetId: ChangeSetId, journal: ApplyJournal): ChangeSet {
    this.transaction(() => {
      const changed = this.db.prepare(
        "UPDATE change_sets SET status = 'applying' WHERE id = ? AND status = 'proposed'",
      ).run(changeSetId)
      if (changed.changes !== 1) throw corrupt('ChangeSet could not enter applying state')
      this.db.prepare(`
        INSERT INTO apply_journal (
          change_set_id, authorized_session_id, project_relative_path,
          before_hash, after_hash, after_utf8, result_revision_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        journal.changeSetId,
        journal.authorizedSessionId,
        journal.projectRelativePath,
        journal.beforeHash,
        journal.afterHash,
        Buffer.from(journal.afterUtf8),
        journal.resultRevisionId,
        journal.createdAt,
      )
    })
    return requiredChangeSet(this.changeSet(changeSetId))
  }

  /**
   * Finish an applying ChangeSet and publish its prepared Revision atomically in SQLite.
   * @param changeSetId - applying ChangeSet to finalize.
   * @param revision - immutable published Revision prepared before file publication.
   * @param projectRelativePath - current authored path for the new head.
   * @returns the applied ChangeSet linked to its result Revision.
   */
  finalizeApply(changeSetId: ChangeSetId, revision: AssetRevision, projectRelativePath: string): ChangeSet {
    this.transaction(() => {
      this.insertRevision(revision, projectRelativePath)
      this.putHead(revision.projectId, revision.assetId, revision.id, projectRelativePath)
      const changed = this.db.prepare(`
        UPDATE change_sets SET status = 'applied', result_revision_id = ?
        WHERE id = ? AND status = 'applying'
      `).run(revision.id, changeSetId)
      if (changed.changes !== 1) throw corrupt('ChangeSet could not finish applying')
      this.db.prepare('DELETE FROM apply_journal WHERE change_set_id = ?').run(changeSetId)
    })
    return requiredChangeSet(this.changeSet(changeSetId))
  }

  /**
   * Convert an unpublishable apply intent into a durable conflict.
   * @param changeSetId - proposed or applying ChangeSet that cannot publish safely.
   * @returns the terminal conflicted ChangeSet.
   */
  conflictApply(changeSetId: ChangeSetId): ChangeSet {
    this.transaction(() => {
      this.db.prepare(`
        UPDATE change_sets SET status = 'conflicted'
        WHERE id = ? AND status IN ('proposed', 'applying')
      `).run(changeSetId)
      this.db.prepare('DELETE FROM apply_journal WHERE change_set_id = ?').run(changeSetId)
    })
    return requiredChangeSet(this.changeSet(changeSetId))
  }

  /**
   * Enumerate incomplete publications in deterministic creation order.
   * @returns exact durable apply journals awaiting recovery.
   */
  applyJournals(): readonly ApplyJournal[] {
    const rows = this.db.prepare(`
      SELECT change_set_id, authorized_session_id, project_relative_path,
             before_hash, after_hash, after_utf8, result_revision_id, created_at
      FROM apply_journal ORDER BY created_at, change_set_id
    `).all() as unknown as ApplyJournalRow[]
    return rows.map(row => ({
      changeSetId: ChangeSetId(row.change_set_id),
      authorizedSessionId: row.authorized_session_id as SessionId,
      projectRelativePath: row.project_relative_path,
      beforeHash: row.before_hash as ContentHash,
      afterHash: row.after_hash as ContentHash,
      afterUtf8: new Uint8Array(row.after_utf8),
      resultRevisionId: RevisionId(row.result_revision_id),
      createdAt: row.created_at,
    }))
  }

  private insertRevision(revision: AssetRevision, projectRelativePath: string): void {
    this.db.prepare(`
      INSERT INTO revisions (
        id, project_id, asset_id, parent_revision_id, project_relative_path,
        serialized_utf8, content_hash, origin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      revision.id,
      revision.projectId,
      revision.assetId,
      revision.parentRevisionId ?? null,
      projectRelativePath,
      Buffer.from(revision.serializedUtf8),
      revision.contentHash,
      revision.origin,
      revision.createdAt,
    )
  }

  private putHead(projectId: ProjectId, assetId: AssetId, revisionId: RevisionId, path: string): void {
    this.db.prepare(`
      INSERT INTO asset_heads(project_id, asset_id, revision_id, project_relative_path)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, asset_id) DO UPDATE SET
        revision_id = excluded.revision_id,
        project_relative_path = excluded.project_relative_path
    `).run(projectId, assetId, revisionId, path)
  }

  private transaction(operation: () => void): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      operation()
      this.db.exec('COMMIT')
    } catch (error: unknown) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }
}

function requiredChangeSet(value: ChangeSet | undefined): ChangeSet {
  if (value === undefined) throw corrupt('ChangeSet disappeared during a transaction')
  return value
}

function requiredFinalization(value: RevisionFinalization | undefined): RevisionFinalization {
  if (value === undefined) throw corrupt('Revision finalization disappeared during a transaction')
  return value
}

function requiredCandidate(value: NovelPreferenceCandidate | undefined): NovelPreferenceCandidate {
  if (value === undefined) throw corrupt('preference candidate disappeared during a transaction')
  return value
}

function corrupt(detail: string, cause?: unknown): NovelRepositoryError {
  return new NovelRepositoryError(
    `novel repository: corrupt history: ${detail}`,
    'NOVEL_HISTORY_CORRUPT',
    cause === undefined ? undefined : { cause },
  )
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch (error: unknown) {
    throw corrupt(`${label} is not valid JSON`, error)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseActor(value: unknown): ChangeSet['actor'] {
  if (!isRecord(value) || (value['kind'] !== 'agent' && value['kind'] !== 'user')) throw corrupt('actor is invalid')
  if (value['kind'] === 'agent') {
    if (typeof value['sessionId'] !== 'string') throw corrupt('agent actor session is invalid')
    return { kind: 'agent', sessionId: value['sessionId'] as SessionId }
  }
  if (value['sessionId'] !== undefined && typeof value['sessionId'] !== 'string') throw corrupt('user actor session is invalid')
  return value['sessionId'] === undefined
    ? { kind: 'user' }
    : { kind: 'user', sessionId: value['sessionId'] as SessionId }
}

function changeSetFromRow(
  row: ChangeSetRow,
  decodeOperations: (assetType: string, value: unknown) => readonly NovelOperation[],
): ChangeSet {
  if (!['proposed', 'applying', 'applied', 'rejected', 'conflicted'].includes(row.status)) {
    throw corrupt(`ChangeSet status ${JSON.stringify(row.status)} is invalid`)
  }
  let operations: readonly NovelOperation[]
  try {
    operations = decodeOperations(row.asset_type, parseJson(row.operations_json, 'operations'))
  } catch (error: unknown) {
    if (error instanceof NovelRepositoryError && error.code === 'NOVEL_HISTORY_CORRUPT') throw error
    throw corrupt(`ChangeSet operations for Asset type ${JSON.stringify(row.asset_type)} are invalid`, error)
  }
  return {
    id: ChangeSetId(row.id),
    projectId: ProjectId(row.project_id),
    assetId: AssetId(row.asset_id),
    assetType: row.asset_type as NovelAssetType,
    baseRevisionId: RevisionId(row.base_revision_id),
    operations,
    actor: parseActor(parseJson(row.actor_json, 'actor')),
    summary: row.summary,
    status: row.status as ChangeSet['status'],
    ...(row.result_revision_id === null ? {} : { resultRevisionId: RevisionId(row.result_revision_id) }),
  }
}

function revisionOrigin(value: string): RevisionOrigin {
  if (!['initial-scan', 'user-edit', 'agent-apply', 'external-edit'].includes(value)) {
    throw corrupt(`Revision origin ${JSON.stringify(value)} is invalid`)
  }
  return value as RevisionOrigin
}

function analysisReportKind(value: string): NovelAnalysisReportKind {
  if (value !== 'chapter-review' && value !== 'noai-scan') {
    throw corrupt(`analysis report kind ${JSON.stringify(value)} is invalid`)
  }
  return value
}

function analysisReportFromRow(row: AnalysisReportRow): NovelAnalysisReport {
  const data = parseJson(row.data_json, 'analysis report data')
  if (!isJsonValue(data)) throw corrupt('analysis report data is not lossless JSON')
  if (row.analyzer_version.length === 0 || row.analyzer_version.length > 100
    || row.analyzer_version !== row.analyzer_version.trim()) {
    throw corrupt('analysis report analyzer version is invalid')
  }
  if (!Number.isFinite(Date.parse(row.generated_at))) throw corrupt('analysis report generated time is invalid')
  for (const [name, value] of [
    ['source Session id', row.source_session_id],
    ['worker Session id', row.worker_session_id],
  ] as const) {
    if (value !== null && (value.length === 0 || value.length > 200 || value !== value.trim())) {
      throw corrupt(`analysis report ${name} is invalid`)
    }
  }
  return {
    projectId: ProjectId(row.project_id),
    assetId: AssetId(row.asset_id),
    revisionId: RevisionId(row.revision_id),
    kind: analysisReportKind(row.kind),
    analyzerVersion: row.analyzer_version,
    generatedAt: row.generated_at,
    data: data as NovelAnalysisReport['data'],
    ...(row.source_session_id === null ? {} : { sourceSessionId: row.source_session_id as SessionId }),
    ...(row.worker_session_id === null ? {} : { workerSessionId: row.worker_session_id as SessionId }),
  }
}

function finalizationFromRow(row: FinalizationRow): RevisionFinalization {
  if (!Number.isFinite(Date.parse(row.finalized_at))) throw corrupt('finalization time is invalid')
  return {
    projectId: ProjectId(row.project_id),
    assetId: AssetId(row.asset_id),
    revisionId: RevisionId(row.revision_id),
    finalizedAt: row.finalized_at,
    finalizedBySessionId: row.finalized_by_session_id as SessionId,
    ...(row.source_revision_id === null ? {} : { sourceRevisionId: RevisionId(row.source_revision_id) }),
    ...(row.source_change_set_id === null ? {} : { sourceChangeSetId: ChangeSetId(row.source_change_set_id) }),
    ...(row.source_session_id === null ? {} : { sourceSessionId: row.source_session_id as SessionId }),
  }
}

function preferenceCandidateFromRow(row: PreferenceCandidateRow): NovelPreferenceCandidate {
  const evidence = preferenceEvidence(parseJson(row.evidence_json, 'preference evidence'))
  if (!['pending', 'accepted', 'rejected'].includes(row.status)) throw corrupt('preference status is invalid')
  if (!Number.isFinite(Date.parse(row.generated_at))) throw corrupt('preference generation time is invalid')
  return {
    id: PreferenceCandidateId(row.id),
    projectId: ProjectId(row.project_id),
    assetId: AssetId(row.asset_id),
    sourceRevisionId: RevisionId(row.source_revision_id),
    finalRevisionId: RevisionId(row.final_revision_id),
    ...(row.source_change_set_id === null ? {} : { sourceChangeSetId: ChangeSetId(row.source_change_set_id) }),
    ...(row.source_session_id === null ? {} : { sourceSessionId: row.source_session_id as SessionId }),
    targetStyleAssetId: AssetId(row.target_style_asset_id),
    targetStyleRevisionId: RevisionId(row.target_style_revision_id),
    extractorVersion: row.extractor_version,
    generatedAt: row.generated_at,
    summary: row.summary,
    guidanceMarkdown: row.guidance_markdown,
    evidence,
    status: row.status as NovelPreferenceCandidate['status'],
    ...(row.decided_at === null ? {} : { decidedAt: row.decided_at }),
    ...(row.decided_by_session_id === null ? {} : { decidedBySessionId: row.decided_by_session_id as SessionId }),
    ...(row.result_change_set_id === null ? {} : { resultChangeSetId: ChangeSetId(row.result_change_set_id) }),
    ...(row.result_revision_id === null ? {} : { resultRevisionId: RevisionId(row.result_revision_id) }),
  }
}

function preferenceEvidence(value: unknown): NovelPreferenceCandidate['evidence'] {
  if (!Array.isArray(value) || value.length > 12) throw corrupt('preference evidence is invalid')
  return value.map((item) => {
    if (!isRecord(item)) throw corrupt('preference evidence is invalid')
    const before = item['before']
    const after = item['after']
    const inference = item['inference']
    if (typeof before !== 'string' || typeof after !== 'string' || typeof inference !== 'string') {
      throw corrupt('preference evidence is invalid')
    }
    return { before, after, inference }
  })
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 64) return false
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
  if (Array.isArray(value)) return value.every(item => isJsonValue(item, depth + 1))
  if (!isRecord(value) || Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.values(value).every(item => isJsonValue(item, depth + 1))
}
