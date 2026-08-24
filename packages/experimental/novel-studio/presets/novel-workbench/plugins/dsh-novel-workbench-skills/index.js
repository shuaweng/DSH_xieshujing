import { fileURLToPath } from 'node:url'
import { apply as applySkillFilesystem } from '@deepseek-ai/dsh-skill-filesystem'

export const name = 'dsh-novel-workbench-skills'
export const inject = ['skills']

const skillDir = fileURLToPath(new URL('../../skills', import.meta.url))

/** Mount the preset-owned methods without granting model-facing file access. */
export function apply(ctx) {
  applySkillFilesystem(ctx, { customSkillDirs: [skillDir] })
}
