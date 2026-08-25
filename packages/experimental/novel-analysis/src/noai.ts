/** Deterministic Chinese web-fiction style heuristics adapted from the shipped Novel guard. */

/** Severity attached to one deterministic style finding. */
export type NoAiSeverity = 'high' | 'medium' | 'low'

/** One exact textual finding produced without a model call. */
export interface NoAiFinding {
  readonly ruleId: string
  readonly label: string
  readonly severity: NoAiSeverity
  readonly startUtf16: number
  readonly endUtf16: number
  readonly evidence: string
  readonly advice: string
}

/** JSON-safe deterministic style report for one exact text snapshot. */
export interface NoAiScanReport {
  readonly version: 1
  readonly characterCount: number
  readonly sampleLevel: 'insufficient' | 'usable' | 'strong'
  readonly riskScore: number
  readonly counts: Readonly<Record<NoAiSeverity, number>>
  readonly findings: readonly NoAiFinding[]
}

/** Tunable bounds and warning policy owned by the Novel analysis provider. */
export interface NoAiScanOptions {
  readonly minCharacters: number
  readonly strongSampleCharacters: number
  readonly maxFindings: number
}

interface Rule {
  readonly id: string
  readonly label: string
  readonly severity: NoAiSeverity
  readonly advice: string
  readonly patterns: readonly RegExp[]
}

const RULES: readonly Rule[] = [
  {
    id: 'explanatory-dash', label: '解释性破折号', severity: 'high',
    advice: '删掉作者式补充定义，改成动作、反应、对白或直接结果。',
    patterns: [/——\s*(?:也就是|也就是说|换句话说|说白了|准确地说|其实|本质上|所谓|即|因为|为了)[^。\n！？!?；;]{1,80}/gu],
  },
  {
    id: 'not-but-structure', label: '否定转折模板', severity: 'high',
    advice: '直接写动作、判断或后果，避免“不是……而是……”绕圈下定义。',
    patterns: [/(?:不是|没有)[^。\n！？!?；;]{0,50}而是/gu, /不仅[^。\n！？!?；;]{0,50}(?:更|而且|还)/gu],
  },
  {
    id: 'not-like-structure', label: '不像/倒像模板', severity: 'medium',
    advice: '用现场动作和可感知细节代替作者站出来解释比喻。',
    patterns: [/不像是?在?[^。\n！？!?；;]{1,40}[，,]?倒像是?在?[^。\n！？!?；;]{1,60}/gu],
  },
  {
    id: 'ratio-emotion', label: '比例式情绪描写', severity: 'high',
    advice: '改成具体表情、动作或更贴角色的一句对白。',
    patterns: [/(?:眼神|目光|脸上|表情|神色)[^。\n！？!?；;]{0,18}[一二三四五六七八九十\d]分[^。\n！？!?；;]{1,30}[一二三四五六七八九十\d]分[^。\n！？!?；;]{1,40}/gu],
  },
  {
    id: 'expression-template', label: '表情模板句', severity: 'medium',
    advice: '优先写动作选择、停顿、语气变化或对方反应。',
    patterns: [/嘴角(?:勾起|扯出|扬起|泛起)[^。\n！？!?；;]{0,18}(?:一抹|一丝)[^。\n！？!?；;]{0,36}/gu, /眼神中?(?:闪过|掠过|浮现|写满|透着)[^。\n！？!?；;]{0,42}/gu],
  },
  {
    id: 'stage-transition', label: '影视分镜式转场词', severity: 'low',
    advice: '密集出现时删去提示词，用因果动作自然衔接。',
    patterns: [/(?:就在)?下一秒[，,]?/gu, /与此同时[，,]?/gu, /紧接着[，,]?/gu, /时间仿佛在这一刻静止/gu],
  },
  {
    id: 'expository-reveal', label: '设定揭示式旁白', severity: 'high',
    advice: '把总结拆进动作、对白、界面信息或冲突后果。',
    patterns: [/这就是[^。\n！？!?；;]{1,50}真相/gu, /真正可怕的是[^。\n！？!?；;]{1,80}/gu],
  },
  {
    id: 'authorial-stamp', label: '作者旁白盖章', severity: 'high',
    advice: '删去“意味着/标志着/注定”等盖章，让读者从结果自行判断。',
    patterns: [/这(?:一刻|一下|一招|件事)?[^。\n]{0,18}(?:意味着|标志着|象征着|注定|将会|会彻底改变)[^。\n]{1,80}/gu],
  },
  {
    id: 'omniscient-insert', label: '开天眼式身份塞入', severity: 'high',
    advice: '若当前视角不知情，改用衣饰、称呼、旁人反应或对方自报。',
    patterns: [/这是[^。\n]{1,60}(?:道上人称|人称|外门|小头目|头目|身份|名叫|叫作|乃是)[^。\n]{0,40}/gu],
  },
  {
    id: 'empty-abstraction', label: '抽象情绪与气氛词堆叠', severity: 'medium',
    advice: '补充可见动作、声音、物件变化或人物即时选择。',
    patterns: [/(?:一种|某种)(?:难以言喻|莫名|说不清|无法形容)的[^。\n！？!?；;]{1,36}/gu, /空气中弥漫着[^。\n！？!?；;]{1,50}(?:气息|氛围|味道)/gu],
  },
]

const SEVERITY_WEIGHT: Readonly<Record<NoAiSeverity, number>> = { high: 3, medium: 2, low: 1 }

/**
 * Scan exact prose with deterministic, source-offset-preserving rules.
 * @param text - exact Asset model text or materialized ChangeSet candidate.
 * @param options - provider-owned sample and result bounds.
 * @returns a stable JSON-safe report; insufficient samples remain explicit.
 */
export function scanNoAi(text: string, options: NoAiScanOptions): NoAiScanReport {
  validateOptions(options)
  let characterCount = 0
  for (const character of text) {
    if (!/\s/u.test(character)) characterCount += 1
  }
  const sampleLevel = characterCount < options.minCharacters
    ? 'insufficient' as const
    : characterCount < options.strongSampleCharacters ? 'usable' as const : 'strong' as const
  const findings: NoAiFinding[] = []
  const seen = new Set<string>()
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0
      for (const match of text.matchAll(pattern)) {
        const start = match.index
        const evidence = match[0]
        if (evidence.length === 0) continue
        const key = `${rule.id}:${start}:${evidence.length}`
        if (seen.has(key)) continue
        seen.add(key)
        findings.push({
          ruleId: rule.id,
          label: rule.label,
          severity: rule.severity,
          startUtf16: start,
          endUtf16: start + evidence.length,
          evidence,
          advice: rule.advice,
        })
      }
    }
  }
  findings.sort((left, right) => SEVERITY_WEIGHT[right.severity] - SEVERITY_WEIGHT[left.severity]
    || left.startUtf16 - right.startUtf16 || left.ruleId.localeCompare(right.ruleId))
  const counts = findings.reduce<Record<NoAiSeverity, number>>((result, finding) => {
    result[finding.severity] += 1
    return result
  }, { high: 0, medium: 0, low: 0 })
  const weighted = findings.reduce((total, finding) => total + SEVERITY_WEIGHT[finding.severity], 0)
  const densityBase = Math.max(1, characterCount / 1000)
  const riskScore = sampleLevel === 'insufficient' ? 0 : Math.min(100, Math.round(weighted * 8 / densityBase))
  return {
    version: 1,
    characterCount,
    sampleLevel,
    riskScore,
    counts,
    findings: findings.slice(0, options.maxFindings),
  }
}

function validateOptions(options: NoAiScanOptions): void {
  for (const [name, value] of Object.entries(options)) {
    if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`novel-analysis: ${name} must be a positive integer`)
  }
  if (options.strongSampleCharacters < options.minCharacters) {
    throw new TypeError('novel-analysis: strongSampleCharacters must not be smaller than minCharacters')
  }
}
