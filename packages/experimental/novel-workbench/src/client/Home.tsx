/** Cross-Workspace Novel library home assembled from DSH's native registry. */

import { useEffect, useMemo, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  NovelAssetDescriptor,
  NovelContextWorksetDescriptor,
  NovelProjectDescriptor,
} from '@deepseek-ai/dsh-experimental-novel-repository-remote/types'
import type { NovelLibraryContextFocus } from './context-controller.ts'
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
  readonly description?: string
  readonly path: string
  readonly chapterCount: number
  readonly manuscriptCharacters: number
  readonly todayCharacterDelta: number
  readonly updatedAt: string
  readonly continueAsset?: NovelAssetDescriptor
  readonly continueCharacters?: number
}

export interface NovelHomeInjected {
  readonly inspectLibrary: (
    candidates: readonly NovelLibraryCandidate[],
    dayStart: string,
  ) => Promise<readonly NovelLibraryBook[]>
  readonly openBook: (book: NovelLibraryBook, assetId?: string) => Promise<void>
  readonly startNewBook: () => void
  readonly reportLibraryContext: (value?: NovelLibraryContextFocus) => void
}

type NovelHomeProps = Pick<PropsRuntime<'novel.canvas'>, 'useSessions' | 'useWorkspaces'>
  & PropsLocale<'novel-workbench'>
  & NovelHomeInjected & { readonly currentProjectId?: NovelProjectDescriptor['id'] }

const MAX_CONTEXT_BOOKS = 24
const MAX_CONTEXT_DESCRIPTION_LENGTH = 400

/** Minimal working entry: three facts, one next action, and the registered library. */
export function NovelHome({
  useSessions, useWorkspaces, inspectLibrary, openBook, startNewBook,
  reportLibraryContext, currentProjectId, t,
}: NovelHomeProps) {
  const workspaces = useWorkspaces(state => state)
  const sessions = useSessions(state => state)
  const [books, setBooks] = useState<readonly NovelLibraryBook[]>([])
  const [loading, setLoading] = useState(true)
  const [openingWorkspaceId, setOpeningWorkspaceId] = useState<string>()
  const [error, setError] = useState<string>()
  const candidates = useMemo(() => libraryCandidates(workspaces.items, workspaces.archivedSessionIds, sessions),
    [sessions, workspaces.archivedSessionIds, workspaces.items])
  const signature = candidates.map(item => `${item.workspaceId}:${item.sessionId}`).join('|')

  useEffect(() => {
    if (workspaces.phase !== 'ready' || sessions.phase !== 'ready') return
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
  }, [inspectLibrary, sessions.phase, signature, workspaces.phase])

  const totalCharacters = books.reduce((sum, book) => sum + book.manuscriptCharacters, 0)
  const todayDelta = books.reduce((sum, book) => sum + book.todayCharacterDelta, 0)
  const recent = [...books].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
  const currentSessionId = sessions.current
  const librarySurface = useMemo((): NonNullable<NovelContextWorksetDescriptor['surface']> => {
    const visible = [...books].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, MAX_CONTEXT_BOOKS)
    return {
      kind: 'library-home',
      label: t('libraryHomeContext'),
      bookCount: books.length,
      manuscriptCharacters: totalCharacters,
      todayCharacterDelta: todayDelta,
      books: visible.map(book => ({
        title: book.title,
        ...(book.description === undefined ? {} : {
          description: book.description.slice(0, MAX_CONTEXT_DESCRIPTION_LENGTH),
        }),
        chapterCount: book.chapterCount,
        manuscriptCharacters: book.manuscriptCharacters,
        ...(book.continueAsset === undefined ? {} : { continueTitle: book.continueAsset.title }),
      })),
      omittedBooks: Math.max(0, books.length - visible.length),
    }
  }, [books, t, todayDelta, totalCharacters])

  useEffect(() => {
    if (loading || currentSessionId === undefined || currentProjectId === undefined) {
      reportLibraryContext(undefined)
      return
    }
    reportLibraryContext({ sessionId: currentSessionId, projectId: currentProjectId, surface: librarySurface })
    return () => { reportLibraryContext(undefined) }
  }, [currentProjectId, currentSessionId, librarySurface, loading, reportLibraryContext])

  const activateBook = async (book: NovelLibraryBook, assetId?: string): Promise<void> => {
    if (openingWorkspaceId !== undefined) return
    setOpeningWorkspaceId(book.workspaceId)
    setError(undefined)
    try { await openBook(book, assetId) }
    catch (cause: unknown) { setError(errorMessage(cause)); setOpeningWorkspaceId(undefined) }
  }

  return <div className={css.home}>
    <nav className={css.homeNav} aria-label={t('studio')}>
      <span className={css.homeBrand} role="img" aria-label={t('studio')} />
      <button type="button" className={css.newBookButton} onClick={startNewBook}>
        <span aria-hidden="true">＋</span>{t('newNovel')}
      </button>
    </nav>
    <main className={css.homeMain}>
      <section className={css.homeHero}>
        <header className={css.homeHeader}>
          <h1>{t('homeTitle')}</h1>
          <span>{books.length} {t('bookCountSummary')}，{formatNumber(totalCharacters)} {t('characterCountSummary')}。
            {t('todayProgressSummary')} {formatSigned(todayDelta)} {t('characters')}。</span>
        </header>

        <div className={css.homeStats} aria-label={t('writingOverview')}>
          <HomeStat icon="library" label={t('bookCount')} value={formatNumber(books.length)} suffix={t('workUnit')} />
          <HomeStat icon="text" label={t('manuscriptCharacters')} value={formatNumber(totalCharacters)} />
          <HomeStat icon="trend" label={t('todayAddedCharacters')} value={formatSigned(todayDelta)} />
        </div>
      </section>

      <section className={css.continueSection} aria-labelledby="novel-continue-title">
        <div className={css.sectionHeading}>
          <h2 id="novel-continue-title">{t('continueWriting')}</h2>
        </div>
        {loading ? <p className={css.homeMuted}>{t('loadingLibrary')}</p>
          : recent === undefined ? <p className={css.homeMuted}>{t('emptyLibrary')}</p>
            : <article className={css.continueRow}>
              <NovelCover title={recent.title} featured />
              <div className={css.continueIdentity}>
                <strong>{recent.title}</strong>
                <span>{recent.continueAsset?.title ?? t('startBookPlanning')}</span>
                <small>{formatNumber(recent.continueCharacters ?? recent.manuscriptCharacters)}{t('characters')}
                  <i aria-hidden="true">·</i>{recent.todayCharacterDelta === 0 ? t('recentlyEdited') : t('editedToday')}</small>
                <p>{recent.description ?? t('missingBookDescription')}</p>
              </div>
              <button type="button" className={css.continueAction} disabled={openingWorkspaceId !== undefined}
                onClick={() => { void activateBook(recent, recent.continueAsset?.id) }}>
                {openingWorkspaceId === recent.workspaceId ? t('openingBook') : t('continueWriting')}
              </button>
            </article>}
      </section>

      <section className={css.librarySection} aria-labelledby="novel-library-title">
        <div className={css.sectionHeading}>
          <h2 id="novel-library-title">{t('myNovels')}</h2>
          <span>{books.length}{t('bookUnit')}</span>
        </div>
        {error !== undefined && <p className={css.homeError} role="alert">{error}</p>}
        {!loading && books.length === 0 ? <p className={css.homeMuted}>{t('emptyLibraryDescription')}</p> : null}
        <div className={css.bookList}>
          {books.map(book => <button type="button" className={css.bookRow} key={book.workspaceId}
            disabled={openingWorkspaceId !== undefined}
            onClick={() => { void activateBook(book, book.continueAsset?.id) }}>
            <NovelCover title={book.title} />
            <span className={css.bookIdentity}><strong>{book.title}</strong><small>{book.description ?? t('missingBookDescription')}</small></span>
            <span className={css.bookMeasure}>{book.chapterCount}{t('chapterUnit')}<small>{formatNumber(book.manuscriptCharacters)}{t('characters')}</small></span>
            <span className={css.bookOpen}>{openingWorkspaceId === book.workspaceId ? t('openingBook') : t('openBook')}
              <b aria-hidden="true">›</b></span>
          </button>)}
        </div>
      </section>
    </main>
  </div>
}

function HomeStat({ icon, label, value, suffix }: {
  readonly icon: 'library' | 'text' | 'trend'
  readonly label: string
  readonly value: string
  readonly suffix?: string
}) {
  return <article><i aria-hidden="true"><StatIcon name={icon} /></i><strong>{value}</strong><span>{suffix ?? label}</span></article>
}

/** Lucide v0.468.0 icons (ISC), retained as exact public-library geometry. */
function StatIcon({ name }: { readonly name: 'library' | 'text' | 'trend' }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'library' && <>
      <rect width="8" height="18" x="3" y="3" rx="1" />
      <path d="M7 3v18" />
      <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" />
    </>}
    {name === 'text' && <>
      <path d="M15 12h6M15 6h6M3 18h18M4 11h6" />
      <path d="m3 13 3.553-7.724a.5.5 0 0 1 .894 0L11 13" />
    </>}
    {name === 'trend' && <>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </>}
  </svg>
}

function NovelCover({ title, featured = false }: { readonly title: string; readonly featured?: boolean }) {
  return <span className={featured ? `${css.novelCover} ${css.featuredCover}` : css.novelCover} aria-hidden="true">
    <strong>{title}</strong>
  </span>
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
