import type { Context } from '@deepseek-ai/cordis'
import {
  CallId,
  LlmAdapter,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'

/** Deterministic adapter proving one real package-owned Skill tool round trip. */
class NovelSkillMockAdapter extends LlmAdapter {
  async * stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const toolResult = options.messages
      .flatMap(message => message.content)
      .findLast(block => block.type === 'tool-result')

    if (toolResult === undefined) {
      const toolNames = (options.tools ?? []).map(tool => tool.name)
      if (toolNames.length !== 1 || toolNames[0] !== 'skill') {
        throw new Error(`unexpected keyless tool roster: ${toolNames.join(',')}`)
      }
      const args = JSON.stringify({ name: 'new-book-bootstrap' })
      yield { type: 'block-start', index: 0, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta',
        index: 0,
        id: CallId('novel-skill-call'),
        name: 'skill',
        argumentsDelta: args,
      }
      yield {
        type: 'block-end',
        index: 0,
        block: {
          type: 'tool-call',
          id: CallId('novel-skill-call'),
          name: 'skill',
          arguments: args,
        },
      }
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 2 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    const loaded = toolResult.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
    if (!loaded.includes('<skill_content name="new-book-bootstrap">')) {
      throw new Error('new-book-bootstrap did not enter the model-visible tool result')
    }
    if (!loaded.includes('开书是创意共创')) {
      throw new Error('new-book-bootstrap body was not loaded from the Workbench catalog')
    }
    const text = 'NOVEL_WORKBENCH_SKILL_OK'
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'block-end', index: 0, block: { type: 'text', text } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'novel-skill-mock-llm'
export const inject = ['llm']

export function apply(ctx: Context): void {
  ctx.llm.registerAdapter(['novel-skill-mock'], new NovelSkillMockAdapter())
}
