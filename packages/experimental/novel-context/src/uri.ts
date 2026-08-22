/** Canonical Novel reference URI and inline mention encoding. */

import {
  AssetId,
  ProjectId,
  RevisionId,
  type ContentHash,
  type TextRangeSelector,
} from '@deepseek-ai/dsh-experimental-novel-repository'
import { NovelContextError } from './error.ts'
import type { NovelReferenceInput } from './types.ts'

/** URI scheme reserved for exact DSH Novel Asset references. */
export const NOVEL_REFERENCE_SCHEME = 'dsh-novel:'

interface NovelReferencePayload {
  p: string
  a: string
  r: string
  s?: { k: 't'; b: number; e: number; q: string; p?: string; x?: string }
}

/**
 * Encode one exact reference as a canonical base64url JSON URI.
 * @param reference - exact Project, Asset, Revision, and optional selection identity.
 * @returns the canonical opaque `dsh-novel:` URI.
 */
export function encodeNovelReferenceUri(reference: NovelReferenceInput): string {
  const payload: NovelReferencePayload = {
    p: reference.projectId,
    a: reference.assetId,
    r: reference.revisionId,
    ...(reference.selector === undefined ? {} : {
      s: {
        k: 't',
        b: reference.selector.startUtf16,
        e: reference.selector.endUtf16,
        q: reference.selector.quoteHash,
        ...(reference.selector.prefix === undefined ? {} : { p: reference.selector.prefix }),
        ...(reference.selector.suffix === undefined ? {} : { x: reference.selector.suffix }),
      },
    }),
  }
  return `${NOVEL_REFERENCE_SCHEME}${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`
}

/**
 * Decode and canonicalize one exact Novel reference URI.
 * @param uri - canonical opaque `dsh-novel:` URI.
 * @returns the validated exact Novel reference.
 */
export function decodeNovelReferenceUri(uri: string): NovelReferenceInput {
  if (!uri.startsWith(NOVEL_REFERENCE_SCHEME)) throw invalidUri(uri)
  const encoded = uri.slice(NOVEL_REFERENCE_SCHEME.length)
  if (!/^[A-Za-z0-9_-]+$/u.test(encoded)) throw invalidUri(uri)
  try {
    const value: unknown = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
    if (!isRecord(value) || typeof value['p'] !== 'string' || typeof value['a'] !== 'string' || typeof value['r'] !== 'string') {
      throw new TypeError('reference identity is invalid')
    }
    const selector = parseSelector(value['s'])
    const reference: NovelReferenceInput = {
      projectId: ProjectId(value['p']),
      assetId: AssetId(value['a']),
      revisionId: RevisionId(value['r']),
      ...(selector === undefined ? {} : { selector }),
    }
    if (encodeNovelReferenceUri(reference) !== uri) throw new TypeError('URI is not canonical')
    return reference
  } catch (error: unknown) {
    throw invalidUri(uri, error)
  }
}

/**
 * Render a host-neutral Markdown mention carrying the canonical URI.
 * @param reference - exact reference plus an optional human-readable label.
 * @returns a Markdown mention that preserves the canonical URI.
 */
export function formatNovelReferenceMention(reference: NovelReferenceInput): string {
  const label = (reference.label ?? reference.assetId).replace(/[\\\]]/gu, match => `\\${match}`)
  return `@[${label}](${encodeNovelReferenceUri(reference)})`
}

/**
 * Extract canonical mentions and replace opaque tokens with readable labels.
 * @param text - direct user text containing Markdown or bare Novel reference URIs.
 * @returns readable text plus the exact references extracted in encounter order.
 */
export function parseNovelReferenceText(text: string): { text: string; references: NovelReferenceInput[] } {
  const references: NovelReferenceInput[] = []
  const pattern = /@\[((?:\\.|[^\\\]])*)\]\((dsh-novel:[^\s)]*)\)|(dsh-novel:[A-Za-z0-9_-]+)/gu
  const rendered = text.replace(pattern, (_match, rawLabel: string | undefined, markdown: string | undefined, bare: string | undefined) => {
    const uri = markdown ?? bare
    /* v8 ignore next -- the regular expression always captures one of these two URI alternatives. */
    if (uri === undefined) throw new NovelContextError('novel context URI is missing', 'NOVEL_CONTEXT_INVALID_REFERENCE')
    const reference = decodeNovelReferenceUri(uri)
    const label = rawLabel === undefined ? reference.assetId : rawLabel.replace(/\\(.)/gu, '$1')
    references.push({ ...reference, label })
    return `@${label}`
  })
  return { text: rendered, references }
}

function parseSelector(value: unknown): TextRangeSelector | undefined {
  if (value === undefined) return undefined
  if (
    !isRecord(value)
    || value['k'] !== 't'
    || !Number.isSafeInteger(value['b'])
    || !Number.isSafeInteger(value['e'])
    || typeof value['q'] !== 'string'
    || (value['p'] !== undefined && typeof value['p'] !== 'string')
    || (value['x'] !== undefined && typeof value['x'] !== 'string')
  ) throw new TypeError('selector is invalid')
  const prefix = value['p']
  const suffix = value['x']
  return {
    kind: 'text-range',
    startUtf16: value['b'] as number,
    endUtf16: value['e'] as number,
    quoteHash: value['q'] as ContentHash,
    ...(prefix === undefined ? {} : { prefix }),
    ...(suffix === undefined ? {} : { suffix }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidUri(uri: string, cause?: unknown): NovelContextError {
  return new NovelContextError(
    `invalid novel reference URI ${JSON.stringify(uri)}`,
    'NOVEL_CONTEXT_INVALID_REFERENCE',
    cause === undefined ? undefined : { cause },
  )
}
