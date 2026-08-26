import type { Context } from '@deepseek-ai/cordis'
import { CallId, LlmAdapter, type GenerateOptions, type StreamChunk } from '@deepseek-ai/dsh-llm'

const EXPECTED_TOOLS = [
  'novel_create',
  'novel_get',
  'novel_initialize_project',
  'novel_list',
  'novel_present',
  'novel_propose_changes',
  'novel_search',
]

/** Deterministic adapter proving an Agent can initialize, create, and populate a blank chapter. */
class NovelProjectInitMockAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const result = options.messages.flatMap(message => message.content)
      .findLast(block => block.type === 'tool-result')
    if (result === undefined) {
      const names = (options.tools ?? []).map(tool => tool.name)
      if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
        throw new Error(`unexpected Novel tool roster: ${names.join(',')}`)
      }
      const args = JSON.stringify({ title: 'White Harbor' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('novel-init-call'), name: 'novel_initialize_project', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('novel-init-call'), name: 'novel_initialize_project', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 12, outputTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    const textResult = result.content.filter(block => block.type === 'text').map(block => block.text).join('\n')
    if (textResult.includes('当前目录已经是小说项目《White Harbor》')) {
      const args = JSON.stringify({
        type: 'manuscript.chapter',
        title: 'Chapter One',
        content: { kind: 'manuscript', body: '' },
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('novel-chapter-call'), name: 'novel_create', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('novel-chapter-call'), name: 'novel_create', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 15, outputTokens: 4 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (textResult.includes('已创建 Chapter One（manuscript.chapter）')) {
      const args = JSON.stringify({ query: 'Chapter One', types: ['manuscript.chapter'] })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('novel-search-call'), name: 'novel_search', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('novel-search-call'), name: 'novel_search', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 16, outputTokens: 3 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (textResult.includes('"title":"Chapter One"')) {
      const [chapter] = JSON.parse(textResult) as Array<{ assetId: string; revisionId: string }>
      if (chapter === undefined) throw new Error('blank chapter search result was empty')
      const args = JSON.stringify({
        project_id: 'project-white-harbor',
        asset_id: chapter.assetId,
        base_revision_id: chapter.revisionId,
        operations: [{ kind: 'insert-text', atUtf16: 0, text: 'The harbor bell rang once.\n' }],
        summary: 'Write Chapter One',
      })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index: 0, id: CallId('novel-insert-call'), name: 'novel_propose_changes', argumentsDelta: args }
      yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: CallId('novel-insert-call'), name: 'novel_propose_changes', arguments: args } }
      yield { type: 'usage', usage: { inputTokens: 21, outputTokens: 6 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }
    if (!textResult.includes('已创建修改提案')) {
      throw new Error('blank chapter insertion proposal receipt was not model-visible')
    }
    const text = 'NOVEL_PROJECT_INITIALIZE_CREATE_AND_INSERT_PROPOSE_OK'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 9, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'novel-project-init-mock-llm'
export const inject = ['llm']

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['novel-project-init-mock'], new NovelProjectInitMockAdapter())
}
