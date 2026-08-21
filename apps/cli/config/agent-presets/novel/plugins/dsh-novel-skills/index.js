import { fileURLToPath } from 'node:url'
import { apply as applySkillFilesystem } from '@deepseek-ai/dsh-skill-filesystem'

export const name = 'dsh-novel-skills'
/** skill-filesystem registers its provider through the skills service. */
export const inject = ['skills']

/**
 * Registers the preset's own skill root through the standard filesystem
 * provider. The path is derived from this file's location, so the preset
 * works both from the shipped install and from a user-level copy.
 */
const skillDir = fileURLToPath(new URL('../../skills', import.meta.url))

export function apply(ctx) {
  applySkillFilesystem(ctx, { customSkillDirs: [skillDir] })
}
