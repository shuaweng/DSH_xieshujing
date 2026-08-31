import { fileURLToPath } from 'node:url'
import { apply as applySkillFilesystem } from '@deepseek-ai/dsh-skill-filesystem'
import { applyNovelProjectSkillPolicy } from '../../../../lib/index.js'

export const name = 'dsh-novel-workbench-skills'
export const inject = ['skills', 'fs', 'novelRepository']

const skillDir = fileURLToPath(new URL('../../skills', import.meta.url))
const skillNames = [
  'chapter-execution',
  'chapter-review',
  'dialogue-diagnostics',
  'new-book-bootstrap',
  'outline-beat-design',
  'preference-learning',
  'rewrite-to-style',
  'scene-drive',
  'story-state-extraction',
  'style-audit',
]

/** Mount the preset-owned methods without granting model-facing file access. */
export function apply(ctx) {
  applySkillFilesystem(ctx, { customSkillDirs: [skillDir] })
  applyNovelProjectSkillPolicy(ctx, skillNames)
}
