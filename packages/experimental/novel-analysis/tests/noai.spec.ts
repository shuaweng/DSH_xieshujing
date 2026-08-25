import { describe, expect, it } from 'vitest'
import { scanNoAi } from '../src/noai.ts'

const options = { minCharacters: 20, strongSampleCharacters: 80, maxFindings: 3 }

describe('deterministic NOAI scanner', () => {
  it('keeps insufficient samples explicit instead of reporting a false clean score', () => {
    expect(scanNoAi('很短。', options)).toEqual({
      version: 1,
      characterCount: 3,
      sampleLevel: 'insufficient',
      riskScore: 0,
      counts: { high: 0, medium: 0, low: 0 },
      findings: [],
    })
  })

  it('returns stable source offsets, severity counts, and bounded evidence', () => {
    const text = [
      '这不是一次普通见面，而是命运真正转动的时刻。',
      '下一秒，他嘴角勾起一抹意味深长的笑。',
      '这一下意味着所有人的命运将会彻底改变。',
      '与此同时，空气中弥漫着难以言喻的紧张气息。',
    ].join('')
    const first = scanNoAi(text, options)
    const second = scanNoAi(text, options)

    expect(second).toEqual(first)
    expect(first.sampleLevel).toBe('strong')
    expect(first.riskScore).toBeGreaterThan(0)
    expect(first.findings).toHaveLength(3)
    expect(first.counts.high).toBeGreaterThan(0)
    for (const finding of first.findings) {
      expect(text.slice(finding.startUtf16, finding.endUtf16)).toBe(finding.evidence)
    }
  })

  it('rejects invalid provider bounds', () => {
    expect(() => scanNoAi('正文', { ...options, maxFindings: 0 })).toThrow(/maxFindings/u)
    expect(() => scanNoAi('正文', { ...options, strongSampleCharacters: 10 })).toThrow(/strongSampleCharacters/u)
  })
})
