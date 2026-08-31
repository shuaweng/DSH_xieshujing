import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const name = 'dsh-novel-style-context'
export const inject = ['systemPrompt']

const MAX_STYLE_CARD = 16000
const MAX_BEAT_CARD = 6000
const MAX_RHYTHM_MAP = 8000

function projectRoot(agent) {
  const cwd = agent?.session?.header?.cwd
  if (typeof cwd === 'string' && cwd.length > 0) return cwd
  // No session cwd means no project to derive style context from; falling
  // back to process.cwd() would leak the host's working directory.
  return ''
}

const fileCache = new Map()
function readCached(file) {
  if (!file || !existsSync(file)) return ''
  const stat = statSync(file)
  const hit = fileCache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.text
  const text = readFileSync(file, 'utf8')
  fileCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, text })
  return text
}

function firstExisting(root, candidates) {
  if (root === "") return undefined
  for (const rel of candidates) {
    const p = join(root, rel)
    if (existsSync(p)) return p
  }
  return undefined
}

function cap(text, max) {
  if (!text) return ''
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max) + '\n\n…（已截断）'
}

function styleCardText(root) {
  const file = firstExisting(root, ['STYLE.md', '资料/风格指纹卡.md', '.dsh/风格指纹卡.md'])
  if (!file) return ''
  return '【风格指纹卡 / STYLE.md】\n' + cap(readCached(file), MAX_STYLE_CARD)
}

function rhythmMapText(root) {
  const file = firstExisting(root, ['大纲/节奏地图.md', '资料/节奏地图.md'])
  if (!file) return ''
  return '【卷级节奏地图】\n' + cap(readCached(file), MAX_RHYTHM_MAP)
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

function parseChapterNumber(name) {
  const arabic = name.match(/(?:第|chapter[-_ ]?)(\d+)/i)
  if (arabic) return Number.parseInt(arabic[1], 10)
  const chinese = name.match(/第([一二三四五六七八九十百千零〇两]+)[章节回]/)
  if (!chinese) return null
  return parseChineseNumber(chinese[1])
}

function currentChapterNumber(root) {
  const marker = join(root, '资料/当前章.txt')
  if (existsSync(marker)) {
    const text = readFileSync(marker, 'utf8').trim()
    const n = Number.parseInt(text, 10)
    if (Number.isFinite(n)) return n
  }
  for (const dir of ['大纲/章beat', '大纲/章Beat', '资料/章beat']) {
    const dirPath = join(root, dir)
    if (!existsSync(dirPath)) continue
    let newest = null
    for (const f of readdirSync(dirPath)) {
      if (!/\.(md|markdown|txt)$/i.test(f)) continue
      const p = join(dirPath, f)
      const st = statSync(p)
      if (!newest || st.mtimeMs > newest.mtimeMs) newest = { p, st, f }
    }
    if (newest) {
      const n = parseChapterNumber(newest.f)
      if (n !== null) return n
      return null
    }
  }
  return null
}

function beatCardText(root) {
  const n = currentChapterNumber(root)
  if (n === null) return ''
  const label = `第${String(n).padStart(3, '0')}章`
  for (const dir of ['大纲/章beat', '大纲/章Beat', '资料/章beat']) {
    const dirPath = join(root, dir)
    if (!existsSync(dirPath)) continue
    for (const f of readdirSync(dirPath)) {
      if (f.startsWith(label) && /\.(md|markdown|txt)$/i.test(f)) {
        return `【当前章 beat 卡：${f}】\n` + cap(readCached(join(dirPath, f)), MAX_BEAT_CARD)
      }
    }
  }
  return ''
}

export function apply(ctx) {
  ctx.systemPrompt.context({
    name: 'novel:style-card',
    order: 400,
    text: (assembly) => styleCardText(projectRoot(assembly.agent)),
  })
  ctx.systemPrompt.context({
    name: 'novel:rhythm-map',
    order: 410,
    text: (assembly) => rhythmMapText(projectRoot(assembly.agent)),
  })
  ctx.systemPrompt.context({
    name: 'novel:beat-card',
    order: 420,
    text: (assembly) => beatCardText(projectRoot(assembly.agent)),
  })
}
