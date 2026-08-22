import { Context } from '@deepseek-ai/cordis'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import { describe, expect, it } from 'vitest'
import NovelRepository, {
  NovelRepositoryError,
  ProjectId,
  type NovelProjectSnapshot,
} from '../src/index.ts'

class StubNovelRepository extends NovelRepository {
  override discoverProject(_root: FsTarget): Promise<NovelProjectSnapshot | undefined> {
    return Promise.resolve(undefined)
  }
}

describe('NovelRepository service definition', () => {
  it('publishes one provider under ctx.novelRepository and releases it with the fiber', async () => {
    const ctx = new Context()
    const fiber = ctx.plugin(StubNovelRepository)
    await fiber

    const root = { targetKey: 'root' as FsTarget['targetKey'], displayPath: '/story' }
    await expect(ctx.novelRepository.discoverProject(root)).resolves.toBeUndefined()

    await fiber.dispose()
    expect(ctx.get('novelRepository')).toBeUndefined()
  })

  it('brands provider-validated ids and preserves structured error causes', () => {
    expect(ProjectId('project-1')).toBe('project-1')
    const cause = new Error('broken yaml')
    const error = new NovelRepositoryError(
      'manifest is invalid',
      'NOVEL_PROJECT_MANIFEST_INVALID',
      { cause },
    )
    expect(error.code).toBe('NOVEL_PROJECT_MANIFEST_INVALID')
    expect(error.cause).toBe(cause)
  })

  it('rejects a second provider for the same capability seam', async () => {
    const ctx = new Context()
    await ctx.plugin(StubNovelRepository)
    await expect(ctx.plugin(StubNovelRepository)).rejects.toThrow(/registered/)
  })
})
