/** Novel workbench locale keys and dictionaries. */

/** Locale namespace owned by the Novel workbench. */
export const NS = 'novel-workbench' as const
/** Message keys shared by every Novel workbench dictionary. */
export type NovelWorkbenchKey = keyof typeof zh

/** Simplified Chinese Novel workbench dictionary. */
export const zh = {
  studio: '小说工作台',
  chapters: '正文',
  agent: 'Agent 对话',
  noProject: '当前会话未绑定小说项目',
  noChapter: '选择一个章节开始写作',
  editor: '章节正文',
  saving: '保存中…',
  save: '保存',
  saved: '已保存',
  reference: '引用选区到 Agent',
  context: 'DSH 当前上下文',
  contextEmpty: '在正文中画线，然后引用到 Agent',
  contextDurable: '发送后将冻结到 Session Log',
  proposal: '正文修改提案',
  accept: '接受修改',
  reject: '拒绝',
  applied: '已应用',
  rejected: '已拒绝',
  conflicted: '版本冲突，未覆盖当前正文',
  loading: '正在载入小说项目…',
  failed: '小说工作台加载失败',
}

/** English Novel workbench dictionary paired with the Chinese source. */
export const en: Record<NovelWorkbenchKey, string> = {
  studio: 'Novel Workbench',
  chapters: 'Manuscript',
  agent: 'Agent conversation',
  noProject: 'The current Session is not bound to a Novel Project',
  noChapter: 'Select a chapter to start writing',
  editor: 'Chapter manuscript',
  saving: 'Saving…',
  save: 'Save',
  saved: 'Saved',
  reference: 'Reference selection to Agent',
  context: 'Current DSH context',
  contextEmpty: 'Select manuscript text, then reference it to the Agent',
  contextDurable: 'It will be frozen into the Session Log when sent',
  proposal: 'Manuscript change proposal',
  accept: 'Accept change',
  reject: 'Reject',
  applied: 'Applied',
  rejected: 'Rejected',
  conflicted: 'Version conflict; current manuscript was not overwritten',
  loading: 'Loading Novel Project…',
  failed: 'Novel Workbench failed to load',
}
