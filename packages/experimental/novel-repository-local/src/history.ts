/** Durable Revision, ChangeSet, and apply-journal store for one Novel Project. */

import { open, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  AssetId,
  ChangeSetId,
  NovelRepositoryError,
  ProjectId,
  RevisionId,
  type AssetRevision,
  type ChangeSet,
  type ContentHash,
  type NovelAssetType,
  type NovelOperation,
  type RevisionOrigin,
} from '@deepseek-ai/dsh-experimental-novel-repository'

/** Physical schema containing revisions, proposals, and recoverable apply intent. */
export const NOVEL_HISTORY_SCHEMA_VERSION = 3
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
  if (version !== 0 && version !== 1 && version !== 2 && version !== NOVEL_HISTORY_SCHEMA_VERSION) {
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
