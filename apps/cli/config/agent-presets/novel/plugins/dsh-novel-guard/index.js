import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync, appendFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

export const name = 'dsh-novel-guard'
export const inject = ['tools']

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STYLE_SCANNER = path.join(__dirname, 'vendor', 'novel-style-profile.mjs')

const SUBSTANTIAL_CHAR_THRESHOLD = 800
const STYLE_SCAN_MIN_CHARS = 300
const STYLE_WARN_RISK_SCORE = 50
const STYLE_WARN_PATTERN_SCORE = 50
const STYLE_WARN_METRIC_SCORE = 20
const STYLE_WARN_HIGH_HITS = 3
const MAX_SNAPSHOTS_PER_CHAPTER = 3
const MAX_REVISION_PARAGRAPHS = 40

function toolName(exec) {
  return typeof exec?.name === 'string' ? exec.name : ''
}

function sessionCwd(exec) {
  const cwd = exec?.agent?.session?.header?.cwd
  return typeof cwd === 'string' && cwd.length > 0 ? cwd : undefined
}

function resolveFilePath(value, exec) {
  if (typeof value !== 'string' || value.trim().length === 0) return null
  let expanded = value
  if (expanded === '~' || expanded.startsWith('~/') || expanded.startsWith('~\\')) {
    expanded = path.join(process.env.HOME ?? '', expanded.slice(2))
  }
  const cwd = sessionCwd(exec)
  return path.resolve(cwd ?? process.cwd(), expanded)
}

/**
 * Derive the actual file path a write/edit/editor call touched.
 * `result.value.path` is the filesystem backend's canonical answer when
 * available; otherwise fall back to the raw argument, resolved against the
 * calling session's cwd (never the host process cwd alone).
 */
function targetPath(exec, result) {
  const canonical = result?.value?.path
  if (typeof canonical === 'string' && canonical.trim().length > 0) {
    return resolveFilePath(canonical, exec)
  }
  const args = exec?.arguments
  if (typeof args !== 'object' || args === null) return null
  for (const key of ['file_path', 'path']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return resolveFilePath(value, exec)
    }
  }
  return null
}

function isWriteLikeTool(name, exec) {
  if (name === 'write' || name === 'edit') return true
  if (name === 'str_replace_editor') {
    const command = exec?.arguments?.command
    return command === 'create' || command === 'str_replace' || command === 'insert'
  }
  return false
}

const CHAPTER_BASENAME_CN = /^第[0-9一二三四五六七八九十百千零〇两]+[章节回][^/]*\.(md|markdown|txt)$/i
const CHAPTER_BASENAME_EN = /^chapter[-_ ]?\d+[^/]*\.(md|markdown|txt)$/i
const ASSET_DIR_RE = /(^|\/)(大纲|资料|章节摘要|章纲|summaries?|\.lingtai)(\/|$)/i

function isNovelDraftPath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) return false
  const normalized = filePath.replaceAll(path.sep, '/')
  const basename = path.basename(filePath)
  if (!/\.(md|markdown|txt)$/i.test(basename)) return false
  // The `.lingtai` bookkeeping directory is never a draft.
  if (/(^|\/)\.lingtai\//i.test(normalized)) return false
  // Explicit draft directories win.
  if (/(^|\/)正文\//.test(normalized) || /(^|\/)正文稿\//.test(normalized) || /(^|\/)(chapters?|章节)\//i.test(normalized)) {
    return true
  }
  // The basename fallback exists for chapter files placed directly in the
  // project root. It must never mistake outline/summary/canon assets for
  // drafts, because those commonly use names like `第002章.md` too.
  if (ASSET_DIR_RE.test(normalized)) return false
  return CHAPTER_BASENAME_CN.test(basename) || CHAPTER_BASENAME_EN.test(basename)
}

function getProjectRoot(filePath, exec) {
  const cwd = sessionCwd(exec)
  if (cwd !== undefined) {
    const rel = path.relative(cwd, filePath)
    if (rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel)) return cwd
  }
  const parts = filePath.split(path.sep)
  const draftDirNames = new Set(['正文', '正文稿', '章节', 'chapters', 'chapter'])
  const idx = parts.findIndex((part) => draftDirNames.has(part))
  if (idx > 0) return parts.slice(0, idx).join(path.sep) || path.sep
  return path.dirname(filePath)
}

const CHINESE_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function parseChineseNumber(text) {
  if (text.length === 0) return null
  if (text.length === 1 && CHINESE_DIGITS[text] !== undefined) return CHINESE_DIGITS[text]
  let section = 0
  let number = 0
  for (const char of text) {
    if (CHINESE_DIGITS[char] !== undefined) {
      number = CHINESE_DIGITS[char]
    } else if (char === '十') {
      section += (number || 1) * 10
      number = 0
    } else if (char === '百') {
      section += number * 100
      number = 0
    } else if (char === '千') {
      section += number * 1000
      number = 0
    } else {
      return null
    }
  }
  return section + number
}

function parseChapterNumber(filePath) {
  const basename = path.basename(filePath)
  const arabic = basename.match(/(?:第|chapter[-_ ]?)(\d+)/i)
  if (arabic) return Number.parseInt(arabic[1], 10)
  const chinese = basename.match(/第([一二三四五六七八九十百千零〇两]+)[章节回]/)
  if (!chinese) return null
  return parseChineseNumber(chinese[1])
}

function stripFrontmatter(text) {
  return text.replace(/^---[\s\S]*?---\n/, '')
}

function snapshotBaseName(filePath) {
  const chapterNum = parseChapterNumber(filePath)
  return chapterNum === null
    ? path.basename(filePath).replace(/\.(md|markdown|txt)$/i, '')
    : `第${String(chapterNum).padStart(3, '0')}章`
}

function pruneSnapshots(dir, base) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(base) && f.endsWith('.md'))
    .sort()
    .reverse()
  for (const stale of files.slice(MAX_SNAPSHOTS_PER_CHAPTER)) {
    try {
      rmSync(path.join(dir, stale))
    } catch {
      // Best-effort cleanup; a transient lock should not fail the write.
    }
  }
}

function snapshotDraft(root, filePath) {
  if (!existsSync(filePath)) return
  const content = readFileSync(filePath, 'utf8')
  const visible = [...content.replace(/\s+/g, '')].length
  if (visible < SUBSTANTIAL_CHAR_THRESHOLD) return
  const base = snapshotBaseName(filePath)
  const dir = path.join(root, '.lingtai', 'drafts')
  mkdirSync(dir, { recursive: true })
  const snapshotPath = path.join(dir, `${base}_agent终稿_${Date.now()}.md`)
  writeFileSync(snapshotPath, content, 'utf8')
  pruneSnapshots(dir, base)
}

function latestSnapshot(root, chapterNum) {
  const dir = path.join(root, '.lingtai', 'drafts')
  if (!existsSync(dir)) return null
  const label = `第${String(chapterNum).padStart(3, '0')}章`
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(label) && f.endsWith('.md'))
    .sort()
    .reverse()
  return files.length > 0 ? path.join(dir, files[0]) : null
}

function computeSimilarity(left, right) {
  const a = left.trim()
  const b = right.trim()
  if (a.length === 0 || b.length === 0) return 0
  if (/[\u4e00-\u9fff]/.test(a) || /[\u4e00-\u9fff]/.test(b)) {
    const set1 = new Set()
    const set2 = new Set()
    for (let i = 0; i < a.length - 1; i++) set1.add(a.slice(i, i + 2))
    for (let i = 0; i < b.length - 1; i++) set2.add(b.slice(i, i + 2))
    const intersection = [...set1].filter((item) => set2.has(item)).length
    const union = new Set([...set1, ...set2]).size
    return union === 0 ? 0 : intersection / union
  }
  const words1 = new Set(a.split(/\s+/).filter(Boolean))
  const words2 = new Set(b.split(/\s+/).filter(Boolean))
  const intersection = [...words1].filter((word) => words2.has(word)).length
  const union = new Set([...words1, ...words2]).size
  return union === 0 ? 0 : intersection / union
}

function computeParagraphDiff(snapshotContent, currentContent) {
  const snapshotText = stripFrontmatter(snapshotContent)
  const currentText = stripFrontmatter(currentContent)
  const snapshotParas = snapshotText.split(/\n\s*\n/).filter((p) => p.trim())
  const currentParas = currentText.split(/\n\s*\n/).filter((p) => p.trim())
  const snapshotSet = new Set(snapshotParas.map((p) => p.trim()))
  const currentSet = new Set(currentParas.map((p) => p.trim()))
  const deleted = snapshotParas.filter((p) => !currentSet.has(p.trim()))
  const added = currentParas.filter((p) => !snapshotSet.has(p.trim()))
  const rewritten = []
  const matchedDeleted = new Set()
  const matchedAdded = new Set()
  const minPairs = Math.min(deleted.length, added.length)
  for (let i = 0; i < minPairs; i++) {
    if (computeSimilarity(deleted[i], added[i]) > 0.3) {
      rewritten.push({ before: deleted[i].trim(), after: added[i].trim() })
      matchedDeleted.add(i)
      matchedAdded.add(i)
    }
  }
  return {
    deleted: deleted.filter((_, index) => !matchedDeleted.has(index)).map((p) => p.trim()),
    added: added.filter((_, index) => !matchedAdded.has(index)).map((p) => p.trim()),
    rewritten,
  }
}

const pendingWriteContent = new Map()

function revisionChapterLabel(chapterNum) {
  return `第${String(chapterNum).padStart(3, '0')}章`
}

function appendRevision(root, chapterNum, entry) {
  const dir = path.join(root, '.lingtai', 'revisions')
  mkdirSync(dir, { recursive: true })
  const revisionPath = path.join(dir, `${revisionChapterLabel(chapterNum)}.jsonl`)
  appendFileSync(revisionPath, `${JSON.stringify(entry)}\n`, 'utf8')
}

function writeFullRevisionFiles(root, chapterNum, beforeText, afterText) {
  const label = revisionChapterLabel(chapterNum)
  const dir = path.join(root, '.lingtai', 'revisions', 'full')
  mkdirSync(dir, { recursive: true })
  const ts = Date.now()
  const beforePath = path.join(dir, `${label}_before_${ts}.md`)
  const afterPath = path.join(dir, `${label}_after_${ts}.md`)
  writeFileSync(beforePath, beforeText, 'utf8')
  writeFileSync(afterPath, afterText, 'utf8')
  return {
    beforeFile: path.relative(root, beforePath),
    afterFile: path.relative(root, afterPath),
  }
}

function revisionDiffFor(beforeText, afterText) {
  const diff = computeParagraphDiff(beforeText, afterText)
  const changed = diff.deleted.length + diff.added.length + diff.rewritten.length
  if (changed === 0) return null
  if (changed <= MAX_REVISION_PARAGRAPHS) return { kind: 'paragraph', diff }
  return { kind: 'full', diff }
}

function captureUserRevision(root, filePath) {
  if (!existsSync(filePath)) return
  const chapterNum = parseChapterNumber(filePath)
  if (chapterNum === null) return
  const snapshot = latestSnapshot(root, chapterNum)
  if (!snapshot) return
  const beforeText = readFileSync(snapshot, 'utf8')
  const afterText = readFileSync(filePath, 'utf8')
  const diff = revisionDiffFor(beforeText, afterText)
  if (diff === null) return
  const label = revisionChapterLabel(chapterNum)
  const entry = {
    time: new Date().toISOString(),
    chapter: label,
    source: 'user',
    kind: diff.kind,
  }
  if (diff.kind === 'full') {
    entry.files = writeFullRevisionFiles(root, chapterNum, beforeText, afterText)
    entry.summary = { deleted: diff.diff.deleted.length, added: diff.diff.added.length, rewritten: diff.diff.rewritten.length }
  } else {
    entry.diff = diff.diff
  }
  appendRevision(root, chapterNum, entry)
}

function captureAgentRevision(root, filePath, tool) {
  if (!existsSync(filePath)) return
  const chapterNum = parseChapterNumber(filePath)
  if (chapterNum === null) return
  const previous = pendingWriteContent.get(filePath)
  pendingWriteContent.delete(filePath)
  let beforeText
  if (previous !== undefined) {
    beforeText = previous
  } else {
    const snapshot = latestSnapshot(root, chapterNum)
    if (!snapshot) return
    beforeText = readFileSync(snapshot, 'utf8')
  }
  const afterText = readFileSync(filePath, 'utf8')
  const diff = revisionDiffFor(beforeText, afterText)
  if (diff === null) return
  const label = revisionChapterLabel(chapterNum)
  const entry = {
    time: new Date().toISOString(),
    chapter: label,
    source: 'agent',
    tool,
    kind: diff.kind,
  }
  if (diff.kind === 'full') {
    entry.files = writeFullRevisionFiles(root, chapterNum, beforeText, afterText)
    entry.summary = { deleted: diff.diff.deleted.length, added: diff.diff.added.length, rewritten: diff.diff.rewritten.length }
  } else {
    entry.diff = diff.diff
  }
  appendRevision(root, chapterNum, entry)
}

function runStyleScan(filePath) {
  if (!existsSync(filePath)) return null
  const content = readFileSync(filePath, 'utf8')
  const visible = [...content.replace(/\s+/g, '')].length
  if (visible < STYLE_SCAN_MIN_CHARS) return null
  const result = spawnSync(
    process.execPath,
    [STYLE_SCANNER, 'compare', filePath, '--json', '--top', '14'],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 20000 },
  )
  if (result.error) return { error: String(result.error) }
  if (result.status !== 0) return { error: (result.stderr || result.stdout || 'scanner failed').trim() }
  try {
    return JSON.parse(result.stdout)
  } catch (error) {
    return { error: `parse scanner output failed: ${String(error)}` }
  }
}

function highHitCount(report) {
  return (report.pattern_summary ?? [])
    .filter((item) => item.severity === 'high')
    .reduce((sum, item) => sum + item.count, 0)
}

function styleWarning(report) {
  if (report.error) return null
  const highHits = highHitCount(report)
  const reasons = []
  if (report.risk_score >= STYLE_WARN_RISK_SCORE) reasons.push(`risk_score ${report.risk_score}`)
  if (report.metric_score >= STYLE_WARN_METRIC_SCORE) reasons.push(`metric_score ${report.metric_score}`)
  if (highHits >= STYLE_WARN_HIGH_HITS) reasons.push(`high 风险命中 ${highHits} 次`)
  if (report.pattern_score >= STYLE_WARN_PATTERN_SCORE && highHits >= 1) reasons.push(`pattern_score ${report.pattern_score}`)
  if (reasons.length === 0) return null
  const top = (report.pattern_summary ?? [])
    .slice(0, 5)
    .map((item) => `- [${item.severity}] ${item.label} ×${item.count}：${item.advice}`)
    .join('\n')
  return `【文风扫描提醒】当前正文触发：${reasons.join('，')}。\n${top}\n请按这些方向在定稿前自检一遍；不要因此中断当前任务，除非用户要求立即修改。`
}

function createContextMessage(text) {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'plugin', plugin: 'dsh-novel-guard' },
  }
}

function logWarn(ctx, message) {
  try {
    if (ctx && typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
    else console.warn(message)
  } catch {
    console.warn(message)
  }
}

export function apply(ctx) {
  // 写入前：捕获用户在两轮对话之间手动修改正文的差异。
  // 这是“用户偏好”最直接的信号；agent 自身的修订在 tools/result 阶段记录。
  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      const name = toolName(exec)
      if (!isWriteLikeTool(name, exec)) return await next()
      const filePath = targetPath(exec, undefined)
      if (!filePath || !isNovelDraftPath(filePath) || !existsSync(filePath)) return await next()
      const root = getProjectRoot(filePath, exec)
      const chapterNum = parseChapterNumber(filePath)
      if (chapterNum !== null && latestSnapshot(root, chapterNum)) {
        pendingWriteContent.set(filePath, readFileSync(filePath, 'utf8'))
        captureUserRevision(root, filePath)
      }
    } catch (error) {
      logWarn(ctx, `dsh-novel-guard: pre-execute revision capture failed: ${String(error)}`)
    }
    return await next()
  })

  // 写后护栏：轻量观察，不改变工具结果。
  ctx.on('tools/result', (exec, result) => {
    try {
      const name = toolName(exec)
      if (!isWriteLikeTool(name, exec)) return
      if (result && result.isError === true) return
      const filePath = targetPath(exec, result)
      if (!filePath || !isNovelDraftPath(filePath)) return
      const root = getProjectRoot(filePath, exec)
      captureAgentRevision(root, filePath, name)
      snapshotDraft(root, filePath)
    } catch (error) {
      logWarn(ctx, `dsh-novel-guard: observe tool result failed: ${String(error)}`)
    }
  })

  // 写后文风扫描：通过 waterfall 注入提醒，不阻断模型。
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const downstream = await next()
    try {
      if (result && result.isError === true) return downstream
      const name = toolName(exec)
      if (!isWriteLikeTool(name, exec)) return downstream
      const filePath = targetPath(exec, result)
      if (!filePath || !isNovelDraftPath(filePath)) return downstream
      const report = runStyleScan(filePath)
      if (!report) return downstream
      const warning = styleWarning(report)
      if (!warning) return downstream
      const message = createContextMessage(warning)
      return { ...downstream, additionalContexts: [message, ...(downstream.additionalContexts ?? [])] }
    } catch (error) {
      logWarn(ctx, `dsh-novel-guard: post-execute guard failed: ${String(error)}`)
      return downstream
    }
  })
}
