/** Durable immutable Revision store for one local Novel Project. */

import { open, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import {
  AssetId,
  NovelRepositoryError,
  ProjectId,
  RevisionId,
  type AssetRevision,
  type ContentHash,
  type RevisionOrigin,
} from '@deepseek-ai/dsh-experimental-novel-repository'

/** First physical schema of `.novel/history.sqlite`. */
export const NOVEL_HISTORY_SCHEMA_VERSION = 1
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
 * @param path - canonical local database path.
 * @param busyTimeoutMs - SQLite lock wait bound.
 * @returns configured database handle.
 */
export async function openHistory(path: string, busyTimeoutMs: number): Promise<NovelHistory> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  await createPrivateFile(path)
  const { DatabaseSync } = await import('node:sqlite')
  const db = new DatabaseSync(path, { timeout: busyTimeoutMs })
  try {
    configure(db, path)
    return new NovelHistory(db)
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
  if (version !== 0 && version !== NOVEL_HISTORY_SCHEMA_VERSION) {
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
  `)
  if (version === 0) {
    db.exec(`PRAGMA application_id = ${NOVEL_HISTORY_APPLICATION_ID}`)
    db.exec(`PRAGMA user_version = ${NOVEL_HISTORY_SCHEMA_VERSION}`)
  }
}

/** Synchronous transaction facade over one project-owned database handle. */
export class NovelHistory {
  constructor(private readonly db: DatabaseSync) {}

  /** Close the owned SQLite connection. */
  close(): void {
    this.db.close()
  }

  /**
   * Read the reconciled head row for one Asset.
   * @param projectId - owning Novel Project.
   * @param assetId - stable Asset identity.
   * @returns the current Revision and path, or `undefined` when unseen.
   */
  head(projectId: ProjectId, assetId: AssetId): HeadRow | undefined {
    return this.db.prepare(`
      SELECT revision_id, project_relative_path
      FROM asset_heads WHERE project_id = ? AND asset_id = ?
    `).get(projectId, assetId) as HeadRow | undefined
  }

  /**
   * Read one immutable retained Revision.
   * @param revisionId - exact Revision identity.
   * @returns retained bytes and path, or `undefined` when absent.
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
   * @param revision - complete validated Revision record.
   * @param projectRelativePath - current authored path for the head projection.
   */
  commitRevision(revision: AssetRevision, projectRelativePath: string): void {
    this.db.exec('BEGIN IMMEDIATE')
    try {
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
      this.putHead(revision.projectId, revision.assetId, revision.id, projectRelativePath)
      this.db.exec('COMMIT')
    } catch (error: unknown) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  /**
   * Update only the mutable path projection after an authored file rename.
   * @param projectId - owning Novel Project.
   * @param assetId - stable Asset identity.
   * @param revisionId - unchanged current Revision.
   * @param path - new project-relative authored path.
   */
  updateHeadPath(projectId: ProjectId, assetId: AssetId, revisionId: RevisionId, path: string): void {
    this.putHead(projectId, assetId, revisionId, path)
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
}
