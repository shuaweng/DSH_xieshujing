/** Runtime contribution owned by the experimental Novel Studio bundle. */

import { fileURLToPath } from 'node:url'
import { Service, type Context } from '@deepseek-ai/cordis'
import type { SkillCandidate, SkillDefinition, SkillLookupOptions } from '@deepseek-ai/dsh-skill'
import { NovelRepositoryError } from '@deepseek-ai/dsh-experimental-novel-repository'

declare module '@deepseek-ai/cordis' {
  interface Context {
    novelStudioPaths: NovelStudioPaths
  }
}

const NOVEL_SKILL_POLICY_PROVIDER = 'novel-project-skill-policy'
const NOVEL_SKILL_POLICY_RANK = 50

/** Package paths and Web boot readiness marker for Novel Studio. */
export class NovelStudioPaths extends Service {
  // This service is the Web boot-manifest barrier used by cordis.patch.yml.
  // Do not publish it until the final browser-only Novel row has activated;
  // YAML row order alone does not serialize asynchronous plugin activation.
  static inject = ['novelWorkbenchReady']

  /** Absolute directory containing this package's shipped Agent Presets. */
  readonly presetRoot: string = fileURLToPath(new URL('../presets', import.meta.url))

  constructor(ctx: Context) {
    super(ctx, 'novelStudioPaths')
  }
}

/**
 * Register the Novel Project Skill policy inside the active Preset scope.
 * The standard Skill Registry remains the only catalog and loader: disabled
 * names are shadowed by a higher-priority candidate whose official invocation
 * policy denies both model and user surfaces.
 * @param ctx - Preset-scoped Cordis context.
 * @param allowedNames - exact Novel Preset Skill names this policy may shadow.
 */
export function applyNovelProjectSkillPolicy(ctx: Context, allowedNames: readonly string[]): void {
  const allowed = new Set(allowedNames)
  let invalidate = (): void => {}
  ctx.skills.registerProvider((control) => {
    invalidate = control.invalidate
    return {
      name: NOVEL_SKILL_POLICY_PROVIDER,
      list: async (options: SkillLookupOptions): Promise<readonly SkillCandidate[]> => {
        if (options.cwd === undefined) return []
        try {
          const root = await ctx.fs.resolve(options.cwd, {
            cwd: options.cwd,
            ...(options.signal === undefined ? {} : { signal: options.signal }),
          })
          const project = await ctx.novelRepository.discoverProject(root, options.signal)
          if (project === undefined) return []
          const settings = await ctx.novelRepository.readSkillSettings(project, options.signal)
          return settings.disabled
            .filter(name => allowed.has(name))
            .map(name => disabledSkillCandidate(name))
        } catch (error: unknown) {
          if (error instanceof NovelRepositoryError) return []
          throw error
        }
      },
      get: async (candidate: SkillCandidate): Promise<SkillDefinition | undefined> => {
        if (!allowed.has(candidate.name)) return undefined
        return {
          name: candidate.name,
          description: candidate.description,
          invocation: candidate.invocation,
          source: candidate.source,
          provider: candidate.provider,
          content: '',
        }
      },
    }
  })
  ctx.on('novel/skill-settings-changed', () => { invalidate() })
}

function disabledSkillCandidate(name: string): SkillCandidate {
  return {
    name,
    description: 'Disabled by the current Novel Project Skill policy.',
    invocation: { modelInvocable: false, userInvocable: false },
    source: 'custom',
    provider: NOVEL_SKILL_POLICY_PROVIDER,
    rank: NOVEL_SKILL_POLICY_RANK,
    locator: name,
  }
}

export default NovelStudioPaths
