import { fileURLToPath } from 'node:url'
import { apply as applySkillFilesystem } from '@deepseek-ai/dsh-skill-filesystem'
import { applyNovelProjectSkillPolicy } from '@deepseek-ai/dsh-experimental-novel-studio'

export const name = 'dsh-novel-skills'
/** skill-filesystem registers its provider through the skills service. */
export const inject = ['skills', 'fs', 'novelRepository']

/**
 * Registers the preset's own skill root through the standard filesystem
 * provider. The path is derived from this file's location, so the preset
 * works both from the shipped install and from a user-level copy.
 */
const skillDir = fileURLToPath(new URL('../../skills', import.meta.url))
const skillNames = [
  'chapter-execution',
  'chapter-wrap-sync',
  'character-arc',
  'dialogue-diagnostics',
  'editorial-review',
  'info-release-check',
  'new-book-bootstrap',
  'opening-review',
  'outline-beat-design',
  'pacing-audit',
  'rewrite-to-style',
  'scene-drive',
  'skill-evolution',
  'style-audit',
  'style-distill',
]

export function apply(ctx) {
  applySkillFilesystem(ctx, { customSkillDirs: [skillDir] })
  applyNovelProjectSkillPolicy(ctx, skillNames)
}
