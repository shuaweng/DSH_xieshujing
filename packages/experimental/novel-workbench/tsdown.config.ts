import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-experimental-novel-workbench',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
