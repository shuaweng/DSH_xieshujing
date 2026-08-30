/** Cross-Workspace Novel library home assembled from DSH's native registry. */

import { useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { NovelAssetDescriptor } from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import css from './workbench.module.css'

/** One DSH Workspace candidate addressable through one of its Sessions. */
export interface NovelLibraryCandidate {
  readonly workspaceId: string
  readonly workspaceTitle: string
  readonly workspacePath: string
  readonly workspaceUpdatedAt: string
  readonly sessionId: SessionId
}

/** Homepage projection for one discovered Novel Project. */
export interface NovelLibraryBook {
  readonly workspaceId: string
  readonly sessionId: SessionId
  readonly title: string
  readonly path: string
  readonly chapterCount: number
  readonly manuscriptCharacters: number
  readonly todayCharacterDelta: number
  readonly updatedAt: string
  readonly continueAsset?: NovelAssetDescriptor
}

export interface NovelHomeInjected {
  readonly inspectLibrary: (
    candidates: readonly NovelLibraryCandidate[],
    dayStart: string,
  ) => Promise<readonly NovelLibraryBook[]>
  readonly openBook: (book: NovelLibraryBook, assetId?: string) => Promise<void>
}

type NovelHomeProps = Pick<PropsRuntime<'novel.canvas'>, 'useSessions' | 'useWorkspaces'>
  & PropsLocale<'novel-workbench'>
  & NovelHomeInjected

/** Minimal working entry: three facts, one next action, and the registered library. */
export function NovelHome({ useSessions, useWorkspaces, inspectLibrary, openBook, t }: NovelHomeProps) {
  const workspaces = useWorkspaces(state => state)
  const sessions = useSessions(state => state)
  const [books, setBooks] = useState<readonly NovelLibraryBook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const candidates = useMemo(() => libraryCandidates(workspaces.items, workspaces.archivedSessionIds, sessions),
    [sessions, workspaces.archivedSessionIds, workspaces.items])
  const signature = candidates.map(item => `${item.workspaceId}:${item.sessionId}`).join('|')

  useEffect(() => {
    if (!workspaces.baselinesReady || sessions.phase !== 'ready') return
    let live = true
    setLoading(true)
    setError(undefined)
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    void inspectLibrary(candidates, dayStart).then((next) => {
      if (live) setBooks(next)
    }).catch((cause: unknown) => {
      if (live) setError(errorMessage(cause))
    }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  // `signature` is the durable dependency. Selector doubles and reconnect
  // projections may replace equivalent arrays; depending on `candidates`
  // itself would turn a completed refresh into another refresh loop.
  }, [inspectLibrary, sessions.phase, signature, workspaces.baselinesReady])

  const totalCharacters = books.reduce((sum, book) => sum + book.manuscriptCharacters, 0)
  const todayDelta = books.reduce((sum, book) => sum + book.todayCharacterDelta, 0)
  const recent = [...books].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]

  return <div className={css.home}>
    <header className={css.homeHeader}>
      <p>{t('studio')}</p>
      <h1>{t('homeTitle')}</h1>
      <span>{t('homeDescription')}</span>
    </header>

    <section className={css.homeStats} aria-label={t('writingOverview')}>
      <HomeStat label={t('bookCount')} value={formatNumber(books.length)} />
      <HomeStat label={t('manuscriptCharacters')} value={formatNumber(totalCharacters)} />
      <HomeStat label={t('todayAddedCharacters')} value={formatSigned(todayDelta)} />
    </section>

    <section className={css.continueSection} aria-labelledby="novel-continue-title">
      <div className={css.sectionHeading}>
        <div><p>{t('nextStep')}</p><h2 id="novel-continue-title">{t('continueWriting')}</h2></div>
      </div>
      {loading ? <p className={css.homeMuted}>{t('loadingLibrary')}</p>
        : recent === undefined ? <p className={css.homeMuted}>{t('emptyLibrary')}</p>
          : <button type="button" className={css.continueRow}
            onClick={() => { void openBook(recent, recent.continueAsset?.id) }}>
            <span className={css.bookMonogram} aria-hidden="true">书</span>
            <span><strong>{recent.title}</strong><small>{recent.continueAsset?.title ?? t('startBookPlanning')}</small></span>
            <span>{t('continueAction')} <b aria-hidden="true">→</b></span>
          </button>}
    </section>

    <section className={css.librarySection} aria-labelledby="novel-library-title">
      <div className={css.sectionHeading}>
        <div><p>{t('library')}</p><h2 id="novel-library-title">{t('myNovels')}</h2></div>
        <span>{books.length}{t('bookUnit')}</span>
      </div>
      {error !== undefined && <p className={css.homeError} role="alert">{error}</p>}
      {!loading && books.length === 0 ? <p className={css.homeMuted}>{t('emptyLibraryDescription')}</p> : null}
      <div className={css.bookList}>
        {books.map(book => <button type="button" className={css.bookRow} key={book.workspaceId}
          onClick={() => { void openBook(book, book.continueAsset?.id) }}>
          <span className={css.bookMonogram} aria-hidden="true">书</span>
          <span className={css.bookIdentity}><strong>{book.title}</strong><small>{book.path}</small></span>
          <span className={css.bookMeasure}>{book.chapterCount}{t('chapterUnit')}<small>{formatNumber(book.manuscriptCharacters)}{t('characters')}</small></span>
          <span className={css.bookOpen}>{t('openBook')} <b aria-hidden="true">→</b></span>
        </button>)}
      </div>
    </section>
  </div>
}

function HomeStat({ label, value }: { readonly label: string; readonly value: string }) {
  return <article><span>{label}</span><strong>{value}</strong></article>
}

function libraryCandidates(
  workspaces: readonly {
    readonly workspaceId: string
    readonly title: string
    readonly path: string
    readonly updatedAt: string
    readonly sessionIds: readonly SessionId[]
  }[],
  archivedSessionIds: readonly SessionId[],
  sessions: {
    readonly byId: Readonly<Record<string, { readonly id: SessionId; readonly updatedAt: number } | undefined>>
  },
): NovelLibraryCandidate[] {
  const archived = new Set(archivedSessionIds)
  const result: NovelLibraryCandidate[] = []
  for (const workspace of workspaces) {
    const rows = workspace.sessionIds
      .map(id => sessions.byId[id])
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .sort((left, right) => {
        const archiveOrder = Number(archived.has(left.id)) - Number(archived.has(right.id))
        return archiveOrder === 0 ? right.updatedAt - left.updatedAt : archiveOrder
      })
    const session = rows[0]
    if (session === undefined) continue
    result.push({
      workspaceId: workspace.workspaceId,
      workspaceTitle: workspace.title,
      workspacePath: workspace.path,
      workspaceUpdatedAt: workspace.updatedAt,
      sessionId: session.id,
    })
  }
  return result
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN').format(value)
}

function formatSigned(value: number): string {
  if (value === 0) return '0'
  return `${value > 0 ? '+' : '−'}${formatNumber(Math.abs(value))}`
}

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}
