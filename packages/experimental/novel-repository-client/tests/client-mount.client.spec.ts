import { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-gateway/client'
import type { TypertClientRemote, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { describe, expect, it, vi } from 'vitest'
import NovelRepositoryClientReady from '../src/index.ts'
import { inject, mountNovelRepositoryRemote, name } from '../src/client/mount.ts'

describe('Novel Repository Client adapter', () => {
  it('publishes its Host readiness marker only after the Novel Remote exists', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(NovelRepositoryClientReady)
    expect(ctx.get('novelRepositoryClientReady')).toBeUndefined()
    const disposeRemote = ctx.provide('novelRepositoryRemote', {} as never)
    await fiber.await()
    expect(ctx.novelRepositoryClientReady).toBeInstanceOf(NovelRepositoryClientReady)
    await fiber.dispose()
    expect(ctx.get('novelRepositoryClientReady')).toBeUndefined()
    disposeRemote()
  })

  it('mounts a supplied contribution and withdraws it with the plugin fiber', async () => {
    const ctx = new Context()
    const contribution: TypertRemoteContribution = {
      package: '@deepseek-ai/dsh-experimental-novel-repository-remote',
      descriptors: [],
    }
    const disposeMount = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    const mount = vi.fn<TypertClientRemote['$mount']>().mockResolvedValue(disposeMount)
    const disposeRemote = ctx.provide('remote', { $mount: mount } as unknown as TypertClientRemote)
    const fiber = ctx.plugin({
      name,
      inject,
      apply: (scope: Context) => mountNovelRepositoryRemote(scope, contribution),
    })
    await fiber

    expect(mount).toHaveBeenCalledOnce()
    expect(mount).toHaveBeenCalledWith(contribution)
    await fiber.dispose()
    expect(disposeMount).toHaveBeenCalledOnce()
    disposeRemote()
  })
})
