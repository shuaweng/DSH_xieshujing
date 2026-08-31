/** Dynamic client bundles must self-contain CSS-referenced brand assets. */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function readBundle(): string | undefined {
  try {
    return readFileSync(resolve('packages/experimental/novel-workbench/lib/client.js'), 'utf8')
  } catch {
    return undefined
  }
}

describe('novel workbench client bundle assets', () => {
  const code = readBundle()

  it.skipIf(code === undefined)('embeds package-local CSS assets instead of emitting unreachable relative URLs', () => {
    expect(code).toContain('data:image/png;base64,')
    expect(code).not.toMatch(/url\(["']?\.\/assets\/brand\//)
  })
})
