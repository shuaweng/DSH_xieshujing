import { describe, expect, it } from 'vitest'
import { appendShippedPresetRoot } from '../src/profile-boot.ts'

describe('profile preset roots', () => {
  it('keeps bundle-owned roots ahead of the CLI shipped root', () => {
    const bundleRoot = { path: '/bundle/presets', trust: 'system' }

    expect(appendShippedPresetRoot({ default: 'novel-workbench', roots: [bundleRoot] }))
      .toMatchObject({
        default: 'novel-workbench',
        roots: [bundleRoot, { trust: 'system' }],
      })
  })

  it('adds the shipped root to a row without configured roots', () => {
    expect(appendShippedPresetRoot({ default: 'standard' })).toMatchObject({
      default: 'standard',
      roots: [{ trust: 'system' }],
    })
  })

  it('preserves malformed roots for agent-presets Config validation', () => {
    expect(appendShippedPresetRoot({ roots: 'invalid' })).toEqual({ roots: 'invalid' })
  })
})
