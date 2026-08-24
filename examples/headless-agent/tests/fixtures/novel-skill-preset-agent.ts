import type { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'

export const name = 'novel-skill-preset-agent'
export const inject = ['agents', 'agentLoop', 'agentPresets']

/** Create one Agent through the real Preset mount boundary used by products. */
export async function apply(ctx: Context): Promise<void> {
  const presetId = 'novel-skill-preset'
  const handle = await ctx.agents.create({
    sessionId: SessionId('novel-workbench-skill-snapshot'),
    meta: { cwd: process.cwd(), agentPreset: presetId },
    agentOptions: { provider: 'novel-skill-mock', model: 'novel-skill-mock' },
    setup: async (agentCtx: Context) => {
      await ctx.agentPresets.mount(agentCtx, presetId)
    },
  })
  ctx.effect(() => () => handle.dispose(), 'novel-skill-preset-agent.handle')
}
