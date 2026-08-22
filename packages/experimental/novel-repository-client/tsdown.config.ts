import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-experimental-novel-repository-client',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
