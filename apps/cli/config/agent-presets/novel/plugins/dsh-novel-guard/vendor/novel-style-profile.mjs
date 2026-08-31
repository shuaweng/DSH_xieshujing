#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_TOP = 80;

const RULES = [
  {
    id: "dash_usage",
    label: "破折号使用",
    severity: "high",
    advice:
      "破折号默认视为坏写作方法：脚本只负责列出，后续由模型/人工判断是否属于拟声、对白拖音、格式需要等少数可保留情况。",
    patterns: [/——/g],
  },
  {
    id: "explanatory_dash",
    label: "解释性破折号",
    severity: "high",
    advice:
      "解释性破折号是强 AI 味：不要用“X——解释X/补充定义/说明原因”的结构，改成句号、动作、反应或直接删解释。",
    patterns: [
      /——\s*(?:不[，,][^。\n！？!?；;]{1,60}|(?:也就是|也就是说|换句话说|俗称|简单说|说白了|准确地说|更准确地说|因为|为了|那里|那是|这是|其实|本质上|所谓|即)[^。\n！？!?；;]{1,80})/g,
      /[^。\n！？!?；;]{2,80}——(?:俗称|因为|为了|也就是|也就是说|不[，,]|那里|那是|这是)[^。\n！？!?；;]{1,80}/g,
    ],
  },
  {
    id: "not_but_structure",
    label: "否定转折模板",
    severity: "high",
    advice: "改成直接动作、后果或角色判断，避免用“不是/没有...而是/是...”绕一圈下定义。",
    patterns: [
      /(?:^|[，。！？!?；;\s这那并可却但])不是[^。\n！？!?；;]{0,50}而是/g,
      /(?:^|[，。！？!?；;\s这那并可却但])不是[^。\n！？!?；;]{0,50}是/g,
      /没有[^。\n！？!?；;]{0,50}而是/g,
      /不仅[^。\n！？!?；;]{0,50}(更|而且|还)/g,
    ],
  },
  {
    id: "not_like_structure",
    label: "不像/倒像模板",
    severity: "medium",
    advice:
      "“不像是在X，倒像是在Y”属于高频解释型比喻模板；能用具体动作和场景压住，就不要让作者跳出来下判断。",
    patterns: [
      /不像是?在[^。\n！？!?；;]{1,40}[，,]?倒像是?在[^。\n！？!?；;]{1,60}/g,
      /不像[^。\n！？!?；;]{1,40}[，,]?倒像[^。\n！？!?；;]{1,60}/g,
    ],
  },
  {
    id: "repeated_emphasis_apposition",
    label: "重复强调式短排比",
    severity: "high",
    advice: "删掉作者式二次盖章，把信息压回角色当前能感知到的动作、疼痛、选择或处境。",
    patterns: [
      /[他她它我][^。\n！？!?]{0,12}是个[^。\n！？!?]{1,24}[。\n！？!?]\s*一个[^。\n！？!?]{1,50}/g,
      /[他她它我][^。\n！？!?]{0,12}只是[^。\n！？!?]{1,24}[。\n！？!?]\s*一个[^。\n！？!?]{1,50}/g,
      /太([一-龥A-Za-z]{1,4})了[，,]\1得[^。\n！？!?]{1,40}/g,
    ],
  },
  {
    id: "anaphora_stack",
    label: "连续排比式自我强调",
    severity: "medium",
    advice: "连续“没有/不是/更没有”容易像 AI 在强调反套路；保留最有画面的一个结果即可。",
    patterns: [
      /(?:^|\n)\s*没有[^。\n！？!?]{0,30}[。\n！？!?]\s*\n\s*没有[^。\n！？!?]{0,30}[。\n！？!?](?:\s*\n\s*(?:更)?没有[^。\n！？!?]{0,35}[。\n！？!?])?/g,
      /(?:^|\n)\s*不是[^。\n！？!?]{0,30}[。\n！？!?]\s*\n\s*不是[^。\n！？!?]{0,30}[。\n！？!?]/g,
    ],
  },
  {
    id: "quote_hedging",
    label: "引号包裹俗语/概念",
    severity: "medium",
    advice: "如果不是实物标签、书名、引用或角色命名，删引号或换成更具体的表达。",
    patterns: [
      /[“"][^”"\n]{0,8}(?:拳风|气势|惊天|震撼|冷漠|残暴|不可理解|仙法|规矩|意外|异常数据|沉浸式|节目效果)[^”"\n]{0,8}[”"]/g,
    ],
  },
  {
    id: "ratio_emotion_formula",
    label: "比例式情绪描写",
    severity: "high",
    advice:
      "“三分X七分Y”是强模板感表达，直接改成具体表情、动作或一句更贴角色的对白。",
    patterns: [
      /(?:眼神|目光|脸上|表情|神色)[^。\n！？!?；;]{0,18}[一二三四五六七八九十\d]分[^。\n！？!?；;]{1,30}[一二三四五六七八九十\d]分[^。\n！？!?；;]{1,40}/g,
    ],
  },
  {
    id: "expression_template",
    label: "表情模板句",
    severity: "medium",
    advice:
      "“嘴角勾起一抹/眼神闪过一丝”容易变成默认演出镜头；优先改成动作选择、停顿、语气变化或对方反应。",
    patterns: [
      /嘴角(?:勾起|扯出|扬起|泛起)[^。\n！？!?；;]{0,18}(?:一抹|一丝)[^。\n！？!?；;]{0,36}/g,
      /眼神中?(?:闪过|掠过|浮现|写满|透着)[^。\n！？!?；;]{0,42}/g,
      /脸上(?:闪过|露出|浮现|挤出)[^。\n！？!?；;]{0,42}/g,
    ],
  },
  {
    id: "stage_transition_cliche",
    label: "影视分镜式转场词",
    severity: "low",
    advice:
      "“下一秒/与此同时/就在这一刻/时间仿佛静止”不是必错，但密集时会像脚本分镜；能删就删，或换成因果动作。",
    patterns: [
      /(?:就在)?下一秒[，,]?/g,
      /与此同时[，,]?/g,
      /紧接着[，,]?/g,
      /然而[，,]?就在[^。\n！？!?；;]{0,36}/g,
      /就在[^。\n！？!?；;]{0,36}的瞬间/g,
      /时间仿佛在这一刻静止/g,
      /这一刻[，,]?/g,
      /就是现在/g,
    ],
  },
  {
    id: "expository_reveal",
    label: "设定揭示式旁白",
    severity: "high",
    advice:
      "“这就是X真相/没有什么A没有什么B”是在作者替读者总结设定；尽量拆进动作、对话、界面信息或冲突后果里。",
    patterns: [
      /这就是[^。\n！？!?；;]{1,50}真相/g,
      /没有什么[^。\n！？!?；;]{1,50}没有什么[^。\n！？!?；;]{1,80}/g,
      /他们活着[，,]就是为了[^。\n！？!?；;]{1,100}/g,
      /观众最爱看的(?:根本)?不是[^。\n！？!?；;]{1,100}/g,
      /只要[^。\n！？!?；;]{1,50}就有无数种方法[^。\n！？!?；;]{1,100}/g,
    ],
  },
  {
    id: "logic_chain_exposition",
    label: "规则推演式解释",
    severity: "medium",
    advice:
      "“按照剧本/直接做不行/必须让一切自然”像作者在公开解题。保留必要规则，其他用试探动作和系统反馈来呈现。",
    patterns: [
      /按照(?:剧本|规则|系统判定)[：:][^。\n！？!?；;]{1,140}/g,
      /(?:直接|绕过|强行|现在)[^。\n！？!?；;]{1,36}不行[，,][^。\n！？!?；;]{1,100}/g,
      /(?:直接|绕过|强行|现在)[^。\n！？!?；;]{1,36}[？?]不行[，,][^。\n！？!?；;]{1,100}/g,
      /必须让一切发生得[^。\n！？!?；;]{1,100}/g,
    ],
  },
  {
    id: "perfect_logic_claim",
    label: "完美判定/完美扮演",
    severity: "medium",
    advice:
      "“完美符合/100%符合/完美的恐惧扮演”太像系统替作者鼓掌；改成判定结果、失败风险或旁观者误判。",
    patterns: [
      /(?:完美|100%|百分百)[^。\n！？!?；;]{0,36}(?:符合|通过|人设|逻辑|判定|扮演)/g,
      /极其自然[，,]顺理成章/g,
    ],
  },
  {
    id: "system_panel_line",
    label: "系统面板/判定行",
    severity: "low",
    advice:
      "系统流可以有面板，但过密会像设定说明书。后续看密度，优先删重复字段和解释性判定。",
    patterns: [
      /^【[^】\n]{0,90}(?:系统|剧本|角色|分配|完成度|结算|OOC|警报|检测|判定|观众信仰值|高维观测池)[^】\n]*】/gm,
    ],
  },
  {
    id: "detached_voice_camera",
    label: "脱离人物视角的声音镜头",
    severity: "medium",
    advice: "让声音落到视角人物的耳朵、身体反应或现场动作上，不要像导演镜头给旁白音效。",
    patterns: [
      /[“"][^”"\n]{4,80}[”"]\s*(?:\n\s*)?一个[^。\n]{0,24}声音[^。\n]{0,40}(炸开|响起|传来)/g,
      /一个[^。\n]{0,24}声音[^。\n]{0,40}(炸开|响起|传来)/g,
    ],
  },
  {
    id: "omniscient_identity_insert",
    label: "开天眼式身份塞入",
    severity: "high",
    advice: "如果当前视角人物没人知道，就不要直接公布身份/外号；改成衣饰、称呼、旁人反应或对方自报。",
    patterns: [
      /这是[^。\n]{1,60}(道上人称|人称|外门|小头目|头目|身份|名叫|叫作|乃是)[^。\n]{0,40}/g,
      /(?:道上人称|人称)[“"][^”"\n]{1,12}[”"]/g,
    ],
  },
  {
    id: "pov_camera_switch",
    label: "导演镜头式视角切换",
    severity: "high",
    advice: "避免从主角/当前视角突然切到配角脑内或镜头说明；除非本段明确切换视角，否则改成外部动作和可见反应。",
    patterns: [
      /[他她它][^。\n]{0,6}看得很清楚[:：][^。\n]{1,80}/g,
      /他们[^。\n]{0,8}甚至不知道[^。\n]{1,80}/g,
      /他们[^。\n]{0,8}只看到[^。\n]{1,80}/g,
    ],
  },
  {
    id: "authorial_stamp",
    label: "作者旁白盖章",
    severity: "high",
    advice: "删掉“意味着/太懂/就是/这一刻”式盖章，让读者从动作、结果和他人反应里自己得出判断。",
    patterns: [
      /在[^。\n，,]{2,20}[，,]当[^。\n]{2,50}时[，,]?就意味着[^。\n]{1,80}/g,
      /这(?:一刻|一下|一招|件事)?[^。\n]{0,18}(意味着|标志着|象征着|注定|将会|会彻底改变)[^。\n]{1,80}/g,
      /真正可怕的是[^。\n]{1,80}/g,
      /[他她它][^。\n]{0,8}太懂这个道理了/g,
      /[他她它][^。\n]{0,8}太(?:熟悉|清楚|明白)[^。\n]{0,30}/g,
      /[他她它][^。\n]{0,8}在立威/g,
    ],
  },
  {
    id: "authorial_technique_explainer",
    label: "作者式技巧/机制解释",
    severity: "medium",
    advice:
      "“这是技巧/那是排异感/犯了忌讳”容易像作者给动作贴说明牌；除非是明确内心判断，否则优先改成可见后果。",
    patterns: [
      /这是[^。\n！？!?；;]{1,60}(?:技巧|规矩|经验|手段|办法|忌讳|代价|后遗症)[^。\n！？!?；;]{0,60}/g,
      /那是[^。\n！？!?；;]{1,60}(?:技巧|规矩|经验|手段|办法|忌讳|排异感|代价|后遗症)[^。\n！？!?；;]{0,60}/g,
      /(?:犯了|坏了)[^。\n！？!?；;]{0,24}(?:规矩|忌讳)[^。\n！？!?；;]{0,60}/g,
    ],
  },
  {
    id: "action_evaluation_stamp",
    label: "动作后作者评价",
    severity: "medium",
    advice:
      "动作刚发生就评价“快得离谱/透着残忍精准/令人胆寒”，会削弱现场感；把评价换成对手反应或动作结果。",
    patterns: [
      /(?:这一连串动作|这一刀|这一拳|这一击)[^。\n！？!?；;]{0,30}(?:快得离谱|精准|残忍|霸道|狠辣)[^。\n！？!?；;]{0,80}/g,
      /(?:透着|带着)一种令人(?:胆寒|窒息|心悸|发毛|头皮发麻)[^。\n！？!?；;]{0,50}/g,
      /灵魂深处[^。\n！？!?；;]{0,30}(?:寒意|恐惧|战栗|发毛)[^。\n！？!?；;]{0,40}/g,
    ],
  },
  {
    id: "explanation_marker",
    label: "解释/结论先行",
    severity: "medium",
    advice: "先写现象、反应、代价，再决定是否需要解释；不要刚发生就下原理和结论。",
    patterns: [
      /原因很简单[^。\n]{0,80}/g,
      /本质上[^。\n]{0,80}/g,
      /这说明[^。\n]{1,80}/g,
      /这代表[^。\n]{1,80}/g,
      /这意味着[^。\n]{1,80}/g,
      /因为那种[^。\n]{1,80}/g,
    ],
  },
  {
    id: "generic_pain_imagery",
    label: "通用痛感/暴力比喻",
    severity: "medium",
    advice: "痛感和暴力比喻密集时会显得模板化；优先改成可见动作、身体失控、呼吸变化或战术后果。",
    patterns: [
      /像[^。\n]{0,16}(?:野狗|风箱|破麻袋|刀子|重锤|烂泥|死人|铁钉|蚂蚁|岩浆|干鱼)[^。\n]{0,40}/g,
      /如同[^。\n]{0,16}(?:触电|烂泥|刚从水里捞出来|破麻袋|凌迟)[^。\n]{0,40}/g,
      /仿佛[^。\n]{0,16}(?:耗尽|砸在|被[^。\n]{0,8}唤醒|灌满|撕开)[^。\n]{0,40}/g,
      /(?:潮水般|地狱般|非人(?:的)?力道|令人胆寒的平静)[^。\n]{0,40}/g,
    ],
  },
  {
    id: "abstract_emotion_label",
    label: "抽象情绪标签",
    severity: "medium",
    advice:
      "直接命名情绪（难受/崩溃/绝望/震惊）是强 AI 味：不要让作者替角色贴情绪标签，改成具体身体反应、动作失控、呼吸或手部细节、停顿，或一句贴角色的对白。",
    patterns: [
      // 「他感到/心中/内心 一阵 + 情绪词」式命名
      /[他她它我][^。\n！？!?；;]{0,10}(?:感到|觉得|感受到|心中|心里|内心|心头)[^。\n！？!?；;]{0,8}(?:一[阵丝股])?(?:难受|崩溃|绝望|震惊|恐惧|愤怒|痛苦|心痛|心碎|慌乱|焦虑|无助|屈辱|悲伤|惊恐|愕然|错愕|释然|欣慰|激动)/g,
      // 「情绪词 + 得 + 极致补语」式拔高
      /(?:难受|崩溃|绝望|震惊|恐惧|愤怒|痛苦|心痛|慌乱|焦虑|悲伤|惊恐)得(?:无以复加|难以言喻|无法呼吸|说不出话|快要窒息|到了极点|不能自已|几乎崩溃)/g,
      // 「一种 + 情绪 + 的情绪/感觉」同义反复
      /一(?:种|股|阵)[^。\n！？!?；;]{0,12}(?:绝望|崩溃|恐惧|愤怒|屈辱|悲凉|无力|窒息)(?:感|的情绪|的感觉)/g,
    ],
  },
  {
    id: "low_specificity_scenery",
    label: "低具体度描写",
    severity: "low",
    advice:
      "笼统形容词+大词名词（古朴的客栈/诡异的气息/说不出的感觉）几乎不传递信息：换成一个可感的具体细节（一处掉漆、一种气味来源、一个声响），让读者自己得出'古朴/诡异'的判断。",
    patterns: [
      // 「形容词 + 的 + 笼统场景名词」
      /(?:古朴|斑驳|陈旧|破旧|神秘|诡异|压抑|阴森|宁静|祥和|繁华|萧条|肃穆)的(?:客栈|房间|屋子|院子|建筑|街道|气息|气氛|氛围|感觉|地方)/g,
      // 「空气中弥漫着一X + 抽象名词」空镜
      /空气中(?:弥漫|充斥|飘荡|流动)着[^。\n！？!?；;]{0,8}一[股丝阵缕]?[^。\n！？!?；;]{0,12}(?:气息|味道|气味|寒意|压抑|诡异|危险|不安|紧张)/g,
      // 「一种说不出/难以形容的 + 感觉/情绪」
      /一(?:种|股)(?:说不出|说不清|难以形容|无法形容|莫名)的[^。\n！？!?；;]{0,8}(?:感觉|情绪|气息|味道|不安|压力|危险)/g,
    ],
  },
  {
    id: "enemy_cognition_overreach",
    label: "对手认知越界",
    severity: "medium",
    advice:
      "对手的认知/想法是主角视角看不到的：不要替敌人写出'无法理解/想不通/早已看穿'这类内心活动，改成主角能观察到的客观物理反应（发抖、瞳孔涣散、后退半步、失语、手一抖），让读者自己推断对方在想什么。",
    patterns: [
      // 「显式对手主语 + 认知越界动词」：用对手类主语而非泛主语「他」，避免误伤主角限知内心戏
      /(?:对方|敌人|对面那?[人个]?|那几[人个]|那些人|众人|对面)[^。\n！？!?；;]{0,12}(?:无法理解|想不通|看不懂|不明白|无法想象|完全没料到|怎么也想不到|做梦也想不到|心中认定|早已看穿|早就看穿)/g,
      // 「认知越界动词」前置 +（对手主语紧跟），覆盖「怎么也想不通，那几人……」语序
      /(?:无法理解|无法想象|怎么也想不到|做梦也想不到)[^。\n！？!?；;]{0,6}(?:对方|敌人|那几[人个]|那些人|众人)(?:是?怎么|为何|为什么)/g,
    ],
  },
  {
    id: "when_clause_opener",
    label: "当…时叙事开场",
    severity: "medium",
    advice:
      "“当/每当/正当/就在……时/的时候，主句”做段落开场容易像叙事说明或分镜导入；改成直接动作、具象场景或角色当下的选择，让时间感从事件里长出来。",
    patterns: [
      // 段落开头（排除对白引号开头）的「当/每当/正当/就在 + 状语 + 时/的时候 + 逗号 + 主句」
      /(?:^|\n)\s*(?![“"「『])(?:当|每当|正当|就在)[^。！？!?；;\n]{1,24}(?:时|的时候)[，,][^。！？!?；;\n]{2,44}[。！？!?]/g,
    ],
  },
  {
    id: "copula_explainer",
    label: "工具来源说明句",
    severity: "medium",
    advice:
      "“XX 是/都是/全是 + 用/靠/凭/拿 + 材料 + 动词 + 的”像设定说明牌；优先把材料与工艺信息揉进动作（他拆了电缆、拧下钢筋、焊死接缝）或一句短对白，不要用系动词总结。",
    patterns: [
      // 「是 + 用/靠/凭/拿 + 名词性内容 + 制作类动词 + 的」，且「的」后紧跟句末标点或行尾
      /[^。！？!?；;\n]{1,24}(?:是|都是|全是)(?:用|靠|凭|拿)[^。！？!?；;\n]{1,40}(?:做|造|拼|搭|改|装|凑|焊|敲|打|组)的(?=[。！？!?，,；;]|$)/g,
    ],
  },
  {
    id: "omniscient_hook",
    label: "全知视角悬念钩子",
    severity: "high",
    advice:
      "“他不知道的是/没人知道的是”是上帝视角悬念钩子，AI 味极重；改成从主角实际感知的异常入手（他听见了什么、余光扫到什么、下一步动作被什么打断），让悬念从场景里长出来。",
    patterns: [
      // 「没人/无人 + 知道 + 的是」变体
      /(?:没人|无人)[^。！？!?；;\n]{0,2}知道的是[^。！？!?；;\n]{0,60}/g,
      // 「他/她/他们/众人/谁也不 + 否定认知 + 的是/一点」变体
      /(?:他|她|他们|她们|众人|谁也不|谁也没有|所有人)[^。！？!?；;\n]{0,4}(?:不知道|不清楚|没想到|没料到|没察觉|没注意|没意识到|并不知情|一无所知)的(?:是|一点)[，,]?[^。！？!?；;\n]{0,60}/g,
    ],
  },
];

const SENSORY_WORDS = [
  "看见",
  "看到",
  "听见",
  "听到",
  "闻到",
  "嗅到",
  "察觉",
  "感觉",
  "感受",
  "摸到",
  "盯着",
  "望向",
];

const COGNITION_WORDS = [
  "知道",
  "意识到",
  "明白",
  "以为",
  "猜到",
  "想到",
  "觉得",
  "判断",
  "决定",
];

const OMNISCIENT_MARKERS = [
  "他不知道的是",
  "她不知道的是",
  "他们不知道的是",
  "无人知道",
  "没有人知道",
  "没有人意识到",
  "事实上",
  "其实",
  "命运",
  "多年以后",
  "真正可怕的是",
  "历史",
  "注定",
];

function usage() {
  return `Usage:
  novel-style-profile.mjs compare <file|-> [--protagonist NAME] [--json] [--top N]

Examples:
  node .claude/tools/novel-style-profile.mjs compare 正文/第001章.md --protagonist 裴烬
  pbpaste | node .claude/tools/novel-style-profile.mjs compare - --protagonist 裴烬
`;
}

function parseArgs(argv) {
  const [command, target, ...rest] = argv;
  const options = {
    command,
    target,
    protagonist: "",
    json: false,
    top: DEFAULT_TOP,
  };

  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === "--protagonist") {
      options.protagonist = rest[i + 1] ?? "";
      i += 1;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg === "--top") {
      options.top = Number.parseInt(rest[i + 1] ?? `${DEFAULT_TOP}`, 10);
      i += 1;
    }
  }

  return options;
}

function readStdin() {
  return new Promise((resolve) => {
    let input = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => resolve(input));
  });
}

async function readTarget(target) {
  if (!target || target === "-") {
    return await readStdin();
  }

  const fullPath = target.startsWith("~/")
    ? path.join(process.env.HOME ?? "", target.slice(2))
    : path.resolve(target);
  return readFileSync(fullPath, "utf8");
}

function splitParagraphs(text) {
  return text
    .split(/\n\s*\n|\r?\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function splitSentences(text) {
  const matches = text.match(/[^。！？!?；;\n]+[。！？!?；;]?/g);
  return (matches ?? [])
    .map((sentence) => sentence.trim())
    .filter((sentence) => /[\p{Script=Han}A-Za-z0-9]/u.test(sentence));
}

function visibleLength(text) {
  return [...text.replace(/\s+/g, "")].length;
}

function mean(values) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function std(values) {
  if (values.length <= 1) {
    return 0;
  }
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function round(value, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
    }
  }
  return line;
}

function isInsideQuoteAt(text, index) {
  const before = text.slice(0, Math.max(0, index));
  const lastOpen = Math.max(
    before.lastIndexOf("“"),
    before.lastIndexOf('"'),
    before.lastIndexOf("「"),
    before.lastIndexOf("『"),
  );
  const lastClose = Math.max(
    before.lastIndexOf("”"),
    before.lastIndexOf('"'),
    before.lastIndexOf("」"),
    before.lastIndexOf("』"),
  );
  return lastOpen > lastClose;
}

function snippet(text, index, length) {
  const radius = 38;
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + length + radius);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < text.length ? "..." : "";
  return `${prefix}${text.slice(start, end)}${suffix}`.replace(/\s+/g, " ");
}

function addHit(hits, rule, line, text, start = null, end = null) {
  hits.push({
    id: rule.id,
    label: rule.label,
    severity: rule.severity,
    line,
    text,
    advice: rule.advice,
    start,
    end,
  });
}

function dedupeHits(hits) {
  const result = [];
  const seen = new Set();

  for (const hit of hits.sort((a, b) => {
    if (a.id !== b.id) {
      return a.id.localeCompare(b.id);
    }
    return (a.start ?? 0) - (b.start ?? 0);
  })) {
    const textKey = hit.text.replace(/\s+/g, " ").slice(0, 90);
    const key = `${hit.id}:${hit.line}:${textKey}`;
    if (seen.has(key)) {
      continue;
    }

    const overlaps = result.some((existing) => {
      if (existing.id !== hit.id || existing.line !== hit.line) {
        return false;
      }
      if (
        existing.start === null ||
        existing.end === null ||
        hit.start === null ||
        hit.end === null
      ) {
        return false;
      }
      return hit.start < existing.end && hit.end > existing.start;
    });
    if (overlaps) {
      continue;
    }

    seen.add(key);
    result.push(hit);
  }

  return result.sort((a, b) => a.line - b.line || (a.start ?? 0) - (b.start ?? 0));
}

function collectRuleHits(text, lines) {
  const hits = [];

  for (const rule of RULES) {
    if (rule.patterns) {
      for (const regex of rule.patterns) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text))) {
          addHit(
            hits,
            rule,
            lineNumberAt(text, match.index),
            snippet(text, match.index, match[0].length),
            match.index,
            match.index + match[0].length,
          );
          if (match[0].length === 0) {
            regex.lastIndex += 1;
          }
        }
      }
    }

    if (rule.linePattern) {
      lines.forEach((lineText, index) => {
        if (rule.linePattern.test(lineText)) {
          addHit(hits, rule, index + 1, lineText.trim());
        }
      });
    }
  }

  return dedupeHits(hits).map(({ start, end, ...hit }) => hit);
}

const DYNAMIC_RULE_DEFS = {
  simile_density: {
    id: "simile_density",
    label: "比喻密度偏高",
    severity: "medium",
    advice:
      "同一段里连续用“像/如同/仿佛/般”会有模型找画面感的味道；保留最精准的一个，其余改成动作、触感或结果。",
  },
  abstract_power_prose: {
    id: "abstract_power_prose",
    label: "抽象力量描写",
    severity: "medium",
    advice:
      "少用“力量/热流/灵气/反噬”加“炸开/冲撞/退去”这类抽象机制词；改成身体局部反应和战术后果。",
  },
  mechanism_explanation_sentence: {
    id: "mechanism_explanation_sentence",
    label: "机制解释句",
    severity: "medium",
    advice:
      "这类句子在替读者解释规则或代价；如果当前场景能靠身体反应和结果说明，就先删解释。",
  },
  aphoristic_experience_summary: {
    id: "aphoristic_experience_summary",
    label: "金句式经验总结",
    severity: "medium",
    advice:
      "主角经验可以立人，但写成“混了十年学到第一条规矩”容易像作者替主角打标签；压短成即时判断更自然。",
  },
  intensifier_stack: {
    id: "intensifier_stack",
    label: "强度词堆叠",
    severity: "low",
    advice:
      "同句强度词太密会显得用力过猛；删掉部分“瞬间/根本/狂暴/极点/恐怖/直接/彻底”等词，让动作自己发力。",
  },
  intensifier_density_window: {
    id: "intensifier_density_window",
    label: "强度词密集窗口",
    severity: "medium",
    advice:
      "相邻多句反复使用“瞬间/彻底/疯狂/极其/绝对/死死”等强度词，会让高潮段落一直处于最大音量；保留关键爆点，其余让动作和后果承担强度。",
  },
  author_explanation_block: {
    id: "author_explanation_block",
    label: "解释词密集段落",
    severity: "medium",
    advice:
      "同一段里“因为/为了/就是/系统/规则/判定/导致”等解释词太密，会显得作者抢着讲原理；拆成场景信息或删到只留必要因果。",
  },
  system_panel_density: {
    id: "system_panel_density",
    label: "系统面板密度偏高",
    severity: "medium",
    advice:
      "系统面板连续出现会压过小说场景；保留会改变角色选择的字段，结算、解释、重复判定尽量合并。",
  },
  simile_cluster_window: {
    id: "simile_cluster_window",
    label: "连续比喻簇",
    severity: "medium",
    advice:
      "相邻多句连续出现“像/仿佛/如同/般”，会形成模型式画面堆叠；保留关键比喻，其余改成触觉、动作、选择和代价。",
  },
  narrative_colon: {
    id: "narrative_colon",
    label: "叙事冒号",
    severity: "medium",
    advice:
      "非系统、非对白的冒号常像说明文或设定条目；小说场景里优先改成句号、动作承接或直接删掉提示语。",
  },
  non_dialogue_quote: {
    id: "non_dialogue_quote",
    label: "非对白引号",
    severity: "medium",
    advice:
      "正文里用引号框住概念、金句或俗语，容易像作者在强调术语；除非是角色原话、书名或系统字段，否则建议删引号。",
  },
  short_sentence_run: {
    id: "short_sentence_run",
    label: "连续短句流水线",
    severity: "medium",
    advice:
      "连续多个非对白短句会让正文像剧情 beat sheet 或分镜清单；保留关键停顿，其余并回动作链、感受或环境后果里。",
  },
  micro_paragraph_fragmentation: {
    id: "micro_paragraph_fragmentation",
    label: "短段频繁换行",
    severity: "high",
    advice:
      "连续把短动作、短对白、短判断拆成独立段落，是强 AI 味的结构问题：章节会像分镜清单而不是自然叙事。保留真正需要停顿的段落，其余合并成动作链、对话节奏或角色反应。",
  },
  comma_negative_tail: {
    id: "comma_negative_tail",
    label: "逗号否定小尾巴",
    severity: "medium",
    advice:
      "“X，没/不Y”这类短尾巴很容易形成冷硬但模板的 AI 腔；能并入动作就并入，或改成更具体的身体/环境反应。",
  },
  comma_but_tail: {
    id: "comma_but_tail",
    label: "逗号转折小尾巴",
    severity: "medium",
    advice:
      "“X，但够/但正/但稳”这类短转折尾巴像作者在给句子打磨质感；改成直接结果，或让前后动作自然形成转折。",
  },
  mirrored_contrast_pair: {
    id: "mirrored_contrast_pair",
    label: "相邻正反对照短句",
    severity: "medium",
    advice:
      "连续用“不像X。像Y。”“很X。也很Y。”“能X。也能Y。”会显得刻意和工整；保留一句，另一层含义交给动作或反应。",
  },
  judgment_stamp_sentence: {
    id: "judgment_stamp_sentence",
    label: "判断式短句盖章",
    severity: "medium",
    advice:
      "这类短句不是单纯动作，而是在替读者下结论或打标签；尽量让判断从行动、反应和结果里自然出现。",
  },
  mechanism_exposition_cluster: {
    id: "mechanism_exposition_cluster",
    label: "机制解释密集窗口",
    severity: "medium",
    advice:
      "相邻多句密集解释规则、判定、逻辑、因果、代价，会把小说现场写成机制说明书；保留会改变选择的信息，其余交给结果呈现。",
  },
  deduction_exposition_cluster: {
    id: "deduction_exposition_cluster",
    label: "侦探式线索推理",
    severity: "medium",
    advice:
      "相邻多句连续用“不是/说明/可能/不可能/问的是/真正要的是”等方式替读者整理线索，会把悬疑现场写成推理讲解；保留关键判断，其余交给物证、行动和对话里的反应。",
  },
  science_exposition_cluster: {
    id: "science_exposition_cluster",
    label: "科普解释密集窗口",
    severity: "medium",
    advice:
      "现代术语、定义句、解释连接词连续堆叠时，小说现场会暂停成科普 PPT；保留会改变角色选择的关键原理，其余用实验动作、失败代价和他人反应承载。",
  },
  crowd_mockery_pivot: {
    id: "crowd_mockery_pivot",
    label: "群众情绪拨杆/群嘲模板",
    severity: "medium",
    advice:
      "围观群众从震惊到嘲讽的情绪切换如果连续由旁白和群嘲台词推动，会像作者安排路人证明主角被低估；减少群体总括，留下一个具体人物的反应即可。",
  },
  spectator_reaction_stack: {
    id: "spectator_reaction_stack",
    label: "围观反应堆叠",
    severity: "medium",
    advice:
      "连续让不同阵营/旁观者震惊、后退、死寂、脸色变化，会变成“众人证明主角厉害”的流水线；选一个最有用的反应即可。",
  },
  abstract_concept_cluster: {
    id: "abstract_concept_cluster",
    label: "抽象概念词堆叠",
    severity: "medium",
    advice:
      "因果、规则、判定、逻辑、绝对、灵魂、精神、时间、空间等抽象词密集时，会让能力表现变成玄学解说；尽量压回可见动作和代价。",
  },
  poetic_abstraction_cluster: {
    id: "poetic_abstraction_cluster",
    label: "高级抽象意象簇",
    severity: "medium",
    advice:
      "相邻多句反复用光、黑暗、镜面、舞台、远方、真相、存在等抽象意象，以及“被吞没/被点亮/像一张网”这类拟物句，会显得空泛和模型文学腔；保留最服务剧情的一两个意象，其余压回具体动作、物件和选择。",
  },
  poetic_abstraction_sentence: {
    id: "poetic_abstraction_sentence",
    label: "高级抽象意象句",
    severity: "medium",
    advice:
      "单句同时出现抽象意象、拟物动词和诗化比喻，容易像模型在强造高级感；优先改成角色能看见、摸到、立刻反应的具体细节。",
  },
  conceptual_flex_line: {
    id: "conceptual_flex_line",
    label: "概念装逼台词",
    severity: "medium",
    advice:
      "“让你们见识什么是X/什么是Y”“X即是Y”“来自X的Y”这类概念口号容易像爽点标语；把气势落到具体动作、胜负结果或对手误判上。",
  },
  knowledge_gap_flex: {
    id: "knowledge_gap_flex",
    label: "知识差装逼句",
    severity: "medium",
    advice:
      "“你们不会玩/他们根本不知道/等我把X做出来”这类句子把爽点写成现代知识碾压口号；尽量用实验结果、对手误判和现场代价来体现知识差。",
  },
  contrast_tagline_sentence: {
    id: "contrast_tagline_sentence",
    label: "对比式卖点标语",
    severity: "medium",
    advice:
      "“别人/其他人如何，而他如何”这类收束句像简介卖点或广告 slogan；不要直接总结主角差异，改成让读者看见主角的动作选择和场景后果。",
  },
  omniscient_group_mind: {
    id: "omniscient_group_mind",
    label: "群体心理开天眼",
    severity: "medium",
    advice:
      "旁白直接写“所有人都认为/有人已经开始盘算/他们心中认定”是在读取群体内心；优先改成可见动作、低声议论或某个具体角色的反应。",
  },
  final_hook_cliche: {
    id: "final_hook_cliche",
    label: "章末模板钩子",
    severity: "medium",
    advice:
      "“没有人知道/这仅仅是开始/真正的X才刚刚开始”这类章末钩子太像模板收束；用一个未解决的具体物件、动作或外部后果替代旁白预告。",
  },
  final_ominous_image_hook: {
    id: "final_ominous_image_hook",
    label: "章末悬疑异象钩子",
    severity: "low",
    advice:
      "章节最后几句突然给出光影、异响、人影、门窗、河面等一闪而过的异象，是常见悬疑收束手法；如果过于模板，改成与本章行动直接相关的具体后果。",
  },
  final_keyword_hook_stack: {
    id: "final_keyword_hook_stack",
    label: "章末关键词堆叠钩子",
    severity: "medium",
    advice:
      "章节末尾连续抛出多个名词短句，容易像悬疑关键词清单；改成一个具体物件、动作、对话后果或当前人物能感知到的异常。",
  },
  repeated_sentence_starter: {
    id: "repeated_sentence_starter",
    label: "重复句首推进",
    severity: "medium",
    advice:
      "近距离反复用同一句首推进，会显得模板化；合并重复句，或换成不同的动作因果、感知变化和角色反应。",
  },
  cognition_exposition_entry: {
    id: "cognition_exposition_entry",
    label: "认知动词解释入口",
    severity: "medium",
    advice:
      "“他明白/确定/意识到/判断出”后接解释，常把场景切成作者讲解；优先让角色通过试探、动作、对话或后果露出判断。",
  },
  rhetorical_question_stack: {
    id: "rhetorical_question_stack",
    label: "旁白连续反问/感叹",
    severity: "medium",
    advice:
      "旁白或内心 OS 连续短问句/感叹句常像作者替读者喊弹幕；保留最能推进情绪的一句，其余改成动作或沉默。对白喊话不在此规则内。",
  },
  pronoun_opening_run: {
    id: "pronoun_opening_run",
    label: "连续代词起句",
    severity: "low",
    advice:
      "连续多行用“他/他们”开头才提示；它不是硬错误，只提醒可能出现作者视角平铺。",
  },
};

function collectDynamicHits(text, paragraphs, sentences, lines, options = {}) {
  const hits = [];
  let searchStart = 0;
  const paragraphEntries = [];

  for (const paragraph of paragraphs) {
    const index = text.indexOf(paragraph, searchStart);
    if (index >= 0) {
      searchStart = index + paragraph.length;
    }
    const line = index >= 0 ? lineNumberAt(text, index) : 1;
    paragraphEntries.push({
      text: paragraph,
      index,
      line,
      length: visibleLength(stripSentencePunctuation(paragraph)),
      isSystem: /^\s*[【\[]/.test(paragraph),
    });
    const simileCount = countSimileConstructions(paragraph);
    if (simileCount >= 2) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.simile_density,
        line,
        paragraph.slice(0, 160),
        index,
        index >= 0 ? index + paragraph.length : null,
      );
    }

    const explanationTerms = [
      "因为",
      "为了",
      "就是",
      "所以",
      "从而",
      "导致",
      "判定",
      "检测",
      "逻辑",
      "规则",
      "系统",
      "剧本",
      "人设",
      "OOC",
      "抹杀",
      "结算",
      "真相",
    ];
    const explanationCount = explanationTerms.reduce(
      (sum, term) => sum + paragraph.split(term).length - 1,
      0,
    );
    if (visibleLength(paragraph) >= 90 && explanationCount >= 4) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.author_explanation_block,
        line,
        paragraph.slice(0, 180),
        index,
        index >= 0 ? index + paragraph.length : null,
      );
    }
  }

  for (let i = 0; i < paragraphEntries.length; i += 1) {
    const window = paragraphEntries.slice(i, i + 16);
    const microParagraphs = window.filter(
      (item) =>
        !item.isSystem &&
        item.length > 0 &&
        item.length <= 16 &&
        /[\p{Script=Han}]/u.test(item.text),
    );
    if (microParagraphs.length >= 10) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.micro_paragraph_fragmentation,
        microParagraphs[0].line,
        `16段内有${microParagraphs.length}个短段：${microParagraphs
          .slice(0, 10)
          .map((item) => item.text.trim())
          .join(" / ")
          .slice(0, 260)}`,
        microParagraphs[0].index,
        microParagraphs.at(-1)?.index ?? null,
      );
      i += 15;
    }
  }

  const systemPanelLines = [];
  const systemPanelPattern =
    /^【[^】\n]{0,90}(?:系统|剧本|角色|分配|完成度|结算|OOC|警报|检测|判定|观众信仰值|高维观测池)[^】\n]*】/;
  lines.forEach((lineText, index) => {
    if (systemPanelPattern.test(lineText.trim())) {
      systemPanelLines.push({ line: index + 1, text: lineText.trim() });
    }
  });
  if (
    systemPanelLines.length >= 4 ||
    per1k(systemPanelLines.length, visibleLength(text)) >= 3
  ) {
    addHit(
      hits,
      DYNAMIC_RULE_DEFS.system_panel_density,
      systemPanelLines[0]?.line ?? 1,
      systemPanelLines
        .slice(0, 8)
        .map((item) => item.text)
        .join(" / "),
    );
  }

  const sentenceEntries = [];
  searchStart = 0;
  for (const sentence of sentences) {
    const index = text.indexOf(sentence, searchStart);
    if (index >= 0) {
      searchStart = index + sentence.length;
    }
    sentenceEntries.push({
      text: sentence,
      index,
      line: index >= 0 ? lineNumberAt(text, index) : 1,
      simileCount: countSimileConstructions(sentence),
      isDialogue: isDialogueSentence(sentence, index, text),
      length: visibleLength(sentence),
    });
  }

  const intensifiers = [
    "瞬间",
    "根本",
    "狂暴",
    "极点",
    "恐怖",
    "直接",
    "彻底",
    "猛地",
    "死死",
    "狠狠",
    "精准",
    "极度",
    "极其",
    "绝对",
    "疯狂",
    "毫无",
    "完全",
    "无比",
    "无法形容",
    "非人",
  ];
  const mechanismTerms = [
    "规则",
    "判定",
    "逻辑",
    "底层",
    "机制",
    "因果",
    "代价",
    "系统",
    "面板",
    "额度",
    "触发",
    "生效",
    "认可",
    "认主",
    "空膛",
    "死契",
    "验",
    "赌约",
    "满弹",
  ];
  const abstractConceptTerms = [
    "绝对",
    "因果",
    "逻辑",
    "判定",
    "规则",
    "时间",
    "空间",
    "灵魂",
    "精神",
    "意识",
    "异常",
    "禁忌",
    "不可名状",
    "毁灭性",
    "古老",
    "暴戾",
    "静止",
  ];
  const scienceTerms = [
    "原子",
    "分子",
    "离子",
    "粒子",
    "共价键",
    "氢键",
    "电离",
    "电解",
    "催化",
    "方程式",
    "模型",
    "纯度",
    "直流",
    "电源",
    "电解液",
    "绝缘",
    "导电",
    "液态",
    "等离子",
    "物理",
    "化学",
    "能量",
    "微观",
    "宏观",
    "法则",
    "逻辑",
    "重构",
    "结构",
    "效率",
    "消耗",
    "干涉",
    "高维",
    "精神力",
    "神识",
  ];
  const scienceConnectors = [
    "这意味着",
    "因为",
    "如果",
    "既然",
    "所以",
    "但",
    "而",
    "所谓",
    "本质",
    "其实",
    "要完成",
    "需要",
    "必须",
    "根本",
  ];
  const deductionTerms = [
    "说明",
    "证明",
    "意味着",
    "可能",
    "不可能",
    "真正",
    "问的是",
    "要的是",
    "找的是",
    "冲着",
    "专门",
    "背后",
    "关系",
    "关键",
    "线头",
    "线索",
    "证据",
    "如果",
    "要是",
    "因为",
    "所以",
    "不是",
    "而且",
    "为什么",
    "无缘无故",
  ];
  const clueTerms = [
    "账本",
    "名单",
    "纸",
    "字",
    "痕",
    "坑",
    "布",
    "药渣",
    "粉末",
    "门",
    "院子",
    "孩子",
    "婴儿",
    "尸体",
    "血",
    "脚印",
    "铜板",
    "木匣",
    "物件",
    "东西",
    "人",
    "官差",
    "捕快",
    "县尉",
    "法器",
    "符",
  ];
  const crowdSubjects =
    /(?:人群|台下|全场|众人|所有人|弟子|长老|目光|广场|修士|那些人|围观)/;
  const crowdEmotion =
    /(?:死寂|炸开了锅|沸腾|狂热|戛然而止|变得|错愕|轻视|嘲弄|羡慕|嫉妒|惋惜|冷漠|嗤笑|嘲讽|哄笑|鸦雀无声)/;
  const crowdMockery =
    /(?:废物|可惜|原来是|又如何|不过是|还能干什么|难不成|吓我一跳|注定|呵呵|说句不好听|跑不了了|一步登天|抢破头颅)/;
  const spectatorSubjects =
    /(?:所有人|众人|全场|没人|没有人|几百双眼睛|阵营|帮|灰塔|赤烬|老傅|秦砾|霍牙|见证人|马仔|凶徒|旁观者)/;
  const spectatorReactions =
    /(?:死寂|安静|僵|愣|震|哆嗦|发抖|后退|闭上眼|睁大|瞳孔|脸色|盯着|不敢|没有人敢|面面相觑|喉结|吞.*唾沫|失声|说不出|沉默|惊醒)/;

  for (const entry of sentenceEntries) {
    entry.intensifierCount = countTerms(entry.text, intensifiers);
    entry.mechanismCount = countTerms(entry.text, mechanismTerms);
    entry.abstractConceptCount = countTerms(entry.text, abstractConceptTerms);
    entry.scienceTermCount = countTerms(entry.text, scienceTerms);
    entry.scienceConnectorCount = countTerms(entry.text, scienceConnectors);
    entry.scienceDefinition = hasScienceDefinition(entry.text);
    entry.deductionTermCount = countTerms(entry.text, deductionTerms);
    entry.clueTermCount = countTerms(entry.text, clueTerms);
    entry.deductionPattern = hasDeductionPattern(entry.text);
    entry.crowdSubject = crowdSubjects.test(entry.text);
    entry.crowdEmotion = crowdEmotion.test(entry.text);
    entry.crowdMockery = crowdMockery.test(entry.text);
    entry.conceptualFlexLine = isConceptualFlexLine(entry.text);
    entry.knowledgeGapFlex = isKnowledgeGapFlex(entry.text);
    entry.contrastTaglineRole = contrastTaglineRole(
      entry.text,
      options.protagonist,
    );
    entry.omniscientGroupMind = isOmniscientGroupMind(entry.text);
    entry.finalHookCliche = isFinalHookCliche(entry.text);
    entry.finalOminousImageHook = isFinalOminousImageHook(entry.text);
    entry.keywordHookNoun = isKeywordHookNounSentence(entry.text);
    entry.cognitionExpositionEntry = isCognitionExpositionEntry(entry.text);
    entry.commaNegativeTail = isCommaNegativeTail(entry.text);
    entry.commaButTail = isCommaButTail(entry.text);
    entry.poeticAbstractionScore = poeticAbstractionScore(entry.text);
    entry.spectatorReaction =
      spectatorSubjects.test(entry.text) && spectatorReactions.test(entry.text);
    entry.isShortNarrative =
      !entry.isDialogue && isShortNarrativeSentence(entry.text);
    entry.isJudgmentStamp =
      !entry.isDialogue && isJudgmentStampSentence(entry.text);
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 6);
    const simileCount = window.reduce((sum, item) => sum + item.simileCount, 0);
    const simileSentences = window.filter((item) => item.simileCount > 0).length;
    if (simileCount >= 4 && simileSentences >= 3) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.simile_cluster_window,
        window[0].line,
        window.map((item) => item.text).join(" / ").slice(0, 220),
        window[0].index,
        window.at(-1)?.index ?? null,
      );
      i += 5;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 8);
    const intensifierCount = window.reduce(
      (sum, item) => sum + item.intensifierCount,
      0,
    );
    const intensifierSentences = window.filter(
      (item) => item.intensifierCount > 0,
    ).length;
    if (intensifierCount >= 8 && intensifierSentences >= 4) {
      const evidence = window.filter((item) => item.intensifierCount > 0);
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.intensifier_density_window,
        evidence[0]?.line ?? window[0].line,
        evidence.map((item) => item.text).join(" / ").slice(0, 240),
        evidence[0]?.index ?? window[0].index,
        evidence.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 7;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 10);
    const mechanismCount = window.reduce(
      (sum, item) => sum + item.mechanismCount,
      0,
    );
    const mechanismSentences = window.filter(
      (item) => item.mechanismCount > 0,
    ).length;
    if (mechanismCount >= 7 && mechanismSentences >= 4) {
      const evidence = window.filter((item) => item.mechanismCount > 0);
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.mechanism_exposition_cluster,
        evidence[0]?.line ?? window[0].line,
        evidence.map((item) => item.text).join(" / ").slice(0, 260),
        evidence[0]?.index ?? window[0].index,
        evidence.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 9;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 10);
    const scienceTermCount = window.reduce(
      (sum, item) => sum + item.scienceTermCount,
      0,
    );
    const connectorCount = window.reduce(
      (sum, item) => sum + item.scienceConnectorCount,
      0,
    );
    const definitionSentences = window.filter((item) => item.scienceDefinition);
    const scienceSentences = window.filter((item) => item.scienceTermCount > 0);
    if (
      scienceTermCount >= 8 &&
      connectorCount >= 3 &&
      definitionSentences.length >= 2 &&
      scienceSentences.length >= 4
    ) {
      const evidence = window.filter(
        (item) => item.scienceTermCount > 0 || item.scienceDefinition,
      );
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.science_exposition_cluster,
        evidence[0]?.line ?? window[0].line,
        evidence.map((item) => item.text).join(" / ").slice(0, 320),
        evidence[0]?.index ?? window[0].index,
        evidence.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 9;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 10);
    const deductionSignal = window.reduce(
      (sum, item) =>
        sum +
        item.deductionTermCount +
        item.clueTermCount +
        (item.deductionPattern ? 2 : 0),
      0,
    );
    const reasoningSentences = window.filter(
      (item) =>
        item.deductionPattern ||
        (item.deductionTermCount > 0 && item.clueTermCount > 0),
    );
    const clueSentences = window.filter((item) => item.clueTermCount > 0);
    if (
      deductionSignal >= 12 &&
      reasoningSentences.length >= 4 &&
      clueSentences.length >= 3
    ) {
      const evidence = window.filter(
        (item) =>
          item.deductionPattern ||
          item.deductionTermCount > 0 ||
          item.clueTermCount > 0,
      );
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.deduction_exposition_cluster,
        evidence[0]?.line ?? window[0].line,
        evidence.map((item) => item.text).join(" / ").slice(0, 320),
        evidence[0]?.index ?? window[0].index,
        evidence.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 9;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 12);
    const crowdSignalCount = window.filter(
      (item) => item.crowdSubject || item.crowdEmotion,
    ).length;
    const mockerySentences = window.filter((item) => item.crowdMockery);
    const emotionalPivots = window.filter((item) => item.crowdEmotion);
    if (
      crowdSignalCount >= 4 &&
      emotionalPivots.length >= 2 &&
      mockerySentences.length >= 2
    ) {
      const evidence = window.filter(
        (item) => item.crowdSubject || item.crowdEmotion || item.crowdMockery,
      );
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.crowd_mockery_pivot,
        evidence[0]?.line ?? window[0].line,
        evidence.map((item) => item.text).join(" / ").slice(0, 320),
        evidence[0]?.index ?? window[0].index,
        evidence.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 11;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 10);
    const reactionSentences = window.filter((item) => item.spectatorReaction);
    if (reactionSentences.length >= 4) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.spectator_reaction_stack,
        reactionSentences[0].line,
        reactionSentences.map((item) => item.text).join(" / ").slice(0, 260),
        reactionSentences[0].index,
        reactionSentences.at(-1)?.index ?? null,
      );
      i += 9;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 8);
    const abstractCount = window.reduce(
      (sum, item) => sum + item.abstractConceptCount,
      0,
    );
    const abstractSentences = window.filter(
      (item) => item.abstractConceptCount > 0,
    ).length;
    if (abstractCount >= 8 && abstractSentences >= 4) {
      const evidence = window.filter((item) => item.abstractConceptCount > 0);
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.abstract_concept_cluster,
        evidence[0]?.line ?? window[0].line,
        evidence.map((item) => item.text).join(" / ").slice(0, 260),
        evidence[0]?.index ?? window[0].index,
        evidence.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 7;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 8);
    const poeticScore = window.reduce(
      (sum, item) => sum + item.poeticAbstractionScore,
      0,
    );
    const poeticSentences = window.filter(
      (item) => item.poeticAbstractionScore >= 2,
    );
    if (poeticScore >= 10 && poeticSentences.length >= 3) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.poetic_abstraction_cluster,
        poeticSentences[0]?.line ?? window[0].line,
        poeticSentences.map((item) => item.text).join(" / ").slice(0, 280),
        poeticSentences[0]?.index ?? window[0].index,
        poeticSentences.at(-1)?.index ?? window.at(-1)?.index ?? null,
      );
      i += 7;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const first = sentenceEntries[i];
    const second = sentenceEntries[i + 1];
    if (!second) {
      continue;
    }
    if (
      first.contrastTaglineRole === "mass" &&
      second.contrastTaglineRole === "hero" &&
      hasContrastTurn(second.text) &&
      visibleLength(first.text) + visibleLength(second.text) <= 90
    ) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.contrast_tagline_sentence,
        first.line,
        `${first.text} / ${second.text}`,
        first.index,
        second.index >= 0 ? second.index + second.text.length : null,
      );
      i += 1;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const first = sentenceEntries[i];
    const second = sentenceEntries[i + 1];
    if (!second || first.isDialogue || second.isDialogue) {
      continue;
    }
    if (isMirroredContrastPair(first.text, second.text)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.mirrored_contrast_pair,
        first.line,
        `${first.text} / ${second.text}`,
        first.index,
        second.index >= 0 ? second.index + second.text.length : null,
      );
      i += 1;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const window = sentenceEntries.slice(i, i + 14);
    const starterGroups = new Map();
    for (const item of window) {
      if (item.isDialogue) {
        continue;
      }
      const starter = sentenceStarterKey(item.text);
      if (!starter) {
        continue;
      }
      const existing = starterGroups.get(starter) ?? [];
      existing.push(item);
      starterGroups.set(starter, existing);
    }
    const repeated = [...starterGroups.entries()].find(
      ([, items]) => items.length >= 3,
    );
    if (repeated) {
      const [starter, items] = repeated;
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.repeated_sentence_starter,
        items[0].line,
        `句首“${starter}”重复${items.length}次：${items
          .map((item) => item.text)
          .join(" / ")
          .slice(0, 260)}`,
        items[0].index,
        items.at(-1)?.index ?? null,
      );
      i += 13;
    }
  }

  for (let i = 0; i < sentenceEntries.length; i += 1) {
    const entry = sentenceEntries[i];
    if (!entry.cognitionExpositionEntry || entry.isDialogue) {
      continue;
    }
    const window = sentenceEntries.slice(i, i + 4);
    const hasExplanationFollowup = window.some(
      (item, offset) =>
        offset > 0 &&
        !item.isDialogue &&
        (hasExplanationFollowupSignal(item.text) ||
          item.deductionPattern ||
          item.mechanismCount > 0),
    );
    if (
      hasImmediateExplanationInCognition(entry.text) ||
      hasExplanationFollowup
    ) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.cognition_exposition_entry,
        entry.line,
        window.map((item) => item.text).join(" / ").slice(0, 280),
        entry.index,
        window.at(-1)?.index ?? entry.index,
      );
    }
  }

  const tailNarrativeEntries = sentenceEntries
    .filter(
      (item) =>
        !item.isDialogue &&
        visibleLength(stripSentencePunctuation(item.text)) > 0,
    )
    .slice(-12);
  for (let i = 0; i < tailNarrativeEntries.length; i += 1) {
    const stack = [];
    for (let j = i; j < tailNarrativeEntries.length; j += 1) {
      if (!tailNarrativeEntries[j].keywordHookNoun) {
        break;
      }
      stack.push(tailNarrativeEntries[j]);
    }
    if (stack.length >= 3) {
      const after = tailNarrativeEntries.slice(i + stack.length, i + stack.length + 3);
      const hasHookFollowup = after.some((item) =>
        hasKeywordHookFollowup(item.text),
      );
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.final_keyword_hook_stack,
        stack[0].line,
        `${stack.map((item) => item.text).join(" / ")}${
          hasHookFollowup ? ` / ${after.map((item) => item.text).join(" / ")}` : ""
        }`.slice(0, 260),
        stack[0].index,
        (hasHookFollowup ? after.at(-1)?.index : stack.at(-1)?.index) ?? null,
      );
      i += stack.length - 1;
    }
  }

  for (const entry of sentenceEntries) {
    if (isSingleSentenceContrastTagline(entry.text, options.protagonist)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.contrast_tagline_sentence,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (entry.conceptualFlexLine) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.conceptual_flex_line,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (entry.knowledgeGapFlex) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.knowledge_gap_flex,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (entry.omniscientGroupMind) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.omniscient_group_mind,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (entry.finalHookCliche) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.final_hook_cliche,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (entry.finalOminousImageHook && isTailSentence(entry, sentenceEntries, 5)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.final_ominous_image_hook,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (!entry.isDialogue && entry.commaNegativeTail) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.comma_negative_tail,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (!entry.isDialogue && entry.commaButTail) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.comma_but_tail,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (!entry.isDialogue && entry.poeticAbstractionScore >= 5) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.poetic_abstraction_sentence,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (entry.isJudgmentStamp) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.judgment_stamp_sentence,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    if (hasNarrativeColon(entry.text)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.narrative_colon,
        entry.line,
        entry.text,
        entry.index,
        entry.index >= 0 ? entry.index + entry.text.length : null,
      );
    }

    const quoteHits = findNonDialogueQuotes(entry.text);
    for (const quoteHit of quoteHits) {
      const start = entry.index >= 0 ? entry.index + quoteHit.index : null;
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.non_dialogue_quote,
        entry.line,
        entry.text,
        start,
        start !== null ? start + quoteHit.text.length : null,
      );
    }
  }

  let shortRun = [];
  for (const entry of sentenceEntries) {
    if (entry.isShortNarrative) {
      shortRun.push(entry);
      continue;
    }

    if (shortRun.length >= 3) {
      addShortRunHit(hits, shortRun);
    }
    shortRun = [];
  }
  if (shortRun.length >= 3) {
    addShortRunHit(hits, shortRun);
  }

  const abstractPower = /(?:力量|热流|灵气|经络|气血|反噬|空洞感|仙法|白虎虚影|意识深处|善钱|恶钱)[^。！？!?；;\n]{0,36}(?:炸开|冲撞|退去|耗尽|宣泄|流转|蔓延|灌入|撕裂|撑裂|崩碎|反噬|压榨|冲了上来|浮现|凭空浮现|悬浮|蕴含|找不到任何宣泄口)/;
  const mechanism = /(?:根本不是什么|根本无法|是有代价的|直觉告诉他|他清楚一件事|立刻下了判断|这副破皮囊|这副身板|这种力量|那种力量|如果不动用|无法适应|找不到任何宣泄口)/;
  const aphorism = /(?:混了|待了|活了|当[^。！？!?；;\n]{0,12}的时候)[^。！？!?；;\n]{0,30}(?:学到|懂得|清楚|忌讳|规矩)[^。！？!?；;\n]{0,50}(?:规矩|道理|含金量|代价|取命)|快死的时候[^。！？!?；;\n]{1,60}|(?:城寨|江湖|道上|底层)[^。！？!?；;\n]{0,18}规矩[^。！？!?；;\n]{1,80}|坏了规矩[^。！？!?；;\n]{1,60}/;
  searchStart = 0;
  for (const sentence of sentences) {
    const index = text.indexOf(sentence, searchStart);
    if (index >= 0) {
      searchStart = index + sentence.length;
    }
    const line = index >= 0 ? lineNumberAt(text, index) : 1;

    if (abstractPower.test(sentence)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.abstract_power_prose,
        line,
        sentence,
        index,
        index >= 0 ? index + sentence.length : null,
      );
    }
    if (mechanism.test(sentence)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.mechanism_explanation_sentence,
        line,
        sentence,
        index,
        index >= 0 ? index + sentence.length : null,
      );
    }
    if (aphorism.test(sentence)) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.aphoristic_experience_summary,
        line,
        sentence,
        index,
        index >= 0 ? index + sentence.length : null,
      );
    }

    const intensifierCount = intensifiers.filter((word) =>
      sentence.includes(word),
    ).length;
    if (intensifierCount >= 3) {
      addHit(
        hits,
        DYNAMIC_RULE_DEFS.intensifier_stack,
        line,
        sentence,
        index,
        index >= 0 ? index + sentence.length : null,
      );
    }
  }

  let questionRun = [];
  searchStart = 0;
  for (const sentence of sentences) {
    const index = text.indexOf(sentence, searchStart);
    if (index >= 0) {
      searchStart = index + sentence.length;
    }
    const trimmed = sentence.trim();
    const isDialogueLike =
      /^[“"「『]/.test(trimmed) ||
      /[”"」』]$/.test(trimmed) ||
      /[：:]\s*[“"「『]/.test(trimmed) ||
      (index >= 0 && isInsideQuoteAt(text, index));
    const isQuestionLike =
      !isDialogueLike && /[？?!！]$/.test(trimmed) && visibleLength(trimmed) <= 28;
    if (isQuestionLike) {
      questionRun.push({
        line: index >= 0 ? lineNumberAt(text, index) : 1,
        text: sentence,
      });
    } else {
      if (questionRun.length >= 2) {
        addHit(
          hits,
          DYNAMIC_RULE_DEFS.rhetorical_question_stack,
          questionRun[0].line,
          questionRun.map((item) => item.text).join(" / ").slice(0, 180),
        );
      }
      questionRun = [];
    }
  }
  if (questionRun.length >= 2) {
    addHit(
      hits,
      DYNAMIC_RULE_DEFS.rhetorical_question_stack,
      questionRun[0].line,
      questionRun.map((item) => item.text).join(" / ").slice(0, 180),
    );
  }

  let runStart = -1;
  let runLines = [];
  const pronounOpening =
    /^\s*(他们|她们|它们|他|她|它)(?=[一-龥A-Za-z0-9，。！？!?；;\s])/;
  for (const [index, lineText] of lines.entries()) {
    if (pronounOpening.test(lineText)) {
      if (runStart === -1) {
        runStart = index + 1;
      }
      runLines.push(lineText.trim());
    } else {
      if (runLines.length >= 3) {
        addHit(
          hits,
          DYNAMIC_RULE_DEFS.pronoun_opening_run,
          runStart,
          runLines.join(" / ").slice(0, 180),
        );
      }
      runStart = -1;
      runLines = [];
    }
  }
  if (runLines.length >= 3) {
    addHit(
      hits,
      DYNAMIC_RULE_DEFS.pronoun_opening_run,
      runStart,
      runLines.join(" / ").slice(0, 180),
    );
  }

  return dedupeHits(hits).map(({ start, end, ...hit }) => hit);
}

function dialogueRatio(text, charCount) {
  const dialogue = [...text.matchAll(/[“"][^”"\n]{1,300}[”"]/g)]
    .map((match) => visibleLength(match[0]))
    .reduce((sum, value) => sum + value, 0);
  return charCount > 0 ? dialogue / charCount : 0;
}

function countOccurrences(text, regex) {
  return [...text.matchAll(regex)].length;
}

function countSimileConstructions(text) {
  const compact = text
    .replace(/像模像样/g, "IDIOM")
    .replace(/像[^。！？!?；;，,\n]{0,32}似的/g, "SIMILE")
    .replace(/如同[^。！？!?；;，,\n]{0,32}般/g, "SIMILE")
    .replace(/宛如[^。！？!?；;，,\n]{0,32}般/g, "SIMILE")
    .replace(/犹如[^。！？!?；;，,\n]{0,32}般/g, "SIMILE");
  return countOccurrences(compact, /像(?:是)?|好像|仿佛|宛如|犹如|如同|似的|般/g);
}

const POETIC_ABSTRACTION_CARRIERS = [
  "光",
  "白光",
  "冷光",
  "黑暗",
  "阴影",
  "烛光",
  "火光",
  "镜",
  "镜面",
  "倒影",
  "玻璃",
  "月亮",
  "舞台",
  "幕布",
  "布景",
  "剧场",
  "远方",
  "出口",
  "维度",
  "空间",
  "真相",
  "存在",
  "命运",
  "记忆",
  "时间",
  "沉默",
  "空气",
  "声音",
  "视线",
  "目光",
  "呼吸",
  "灵魂",
  "精神",
  "恐惧",
  "绝望",
  "裂缝",
  "缝隙",
  "钟摆",
  "网",
  "潮水",
  "洪水",
  "眼球",
  "兽",
  "脸",
  "面孔",
  "角色",
];

const POETIC_ABSTRACTION_VERBS = [
  "舔在",
  "落在",
  "灌入",
  "灌满",
  "流入",
  "涌来",
  "涌入",
  "吞没",
  "切断",
  "凝固",
  "定格",
  "碎裂",
  "剥落",
  "熄灭",
  "消散",
  "收缩",
  "收紧",
  "蔓延",
  "浮现",
  "腐烂",
  "点亮",
  "擦掉",
  "填满",
  "压进",
  "拉扯",
  "回望",
  "穿透",
  "逼近",
  "伸向",
  "垂下",
  "爬到",
  "爬过",
  "降下",
  "晕开",
];

function poeticAbstractionScore(sentence) {
  const text = sentence.trim();
  if (!text || /^\s*[【\[]/.test(text)) {
    return 0;
  }

  let score = 0;
  score += Math.min(4, countTerms(text, POETIC_ABSTRACTION_CARRIERS));
  score += Math.min(3, countTerms(text, POETIC_ABSTRACTION_VERBS));

  const poeticImage =
    /(?:像|像是|仿佛|如同|宛如|犹如)[^。！？!?；;，,\n]{0,36}(?:光|黑暗|阴影|镜|玻璃|舞台|幕布|布景|剧场|远方|出口|维度|裂缝|缝隙|钟摆|网|潮水|洪水|眼球|兽|手|脸|面孔|血|墨迹)/;
  const abstractNounPhrase =
    /一种[^。！？!?；;，,\n]{0,24}(?:感觉|重量|沉默|恐惧|绝望|气息|东西|存在|光|黑暗|真相|力量|表情)/;
  const invisibleForce =
    /(?:被|让|将)[^。！？!?；;，,\n]{0,18}(?:记住|吞没|灌满|填满|点亮|擦掉|切断|收紧|拉扯|压进|托住|剥落|熄灭|定格|凝固)/;
  const stageMetaphor =
    /(?:舞台|剧场|幕布|布景|角色|镜面|倒影|白色空间|维度|出口)[^。！？!?；;]{0,30}(?:真相|自己|角色|熄灭|剥落|落下|映出|分割线|冷光|光)/;
  const parallelImage =
    /(?:像|如同|仿佛)[^。！？!?；;，,\n]{1,18}[，,]\s*(?:像|如同|仿佛)[^。！？!?；;，,\n]{1,18}/;

  if (poeticImage.test(text)) score += 3;
  if (abstractNounPhrase.test(text)) score += 2;
  if (invisibleForce.test(text)) score += 2;
  if (stageMetaphor.test(text)) score += 2;
  if (parallelImage.test(text)) score += 2;

  return score;
}

function hasScienceDefinition(sentence) {
  const text = sentence.trim();
  return (
    /(?:不是|不是什么)[^。！？!?；;]{1,24}(?:是|而是)[^。！？!?；;]{1,32}/.test(
      text,
    ) ||
    /(?:所谓|本质上|本质是|其实是|这意味着|这就意味着)[^。！？!?；;]{2,80}/.test(
      text,
    ) ||
    /(?:如果|既然)[^。！？!?；;]{4,80}(?:就|那么|则)[^。！？!?；;]{2,80}/.test(
      text,
    ) ||
    /(?:需要|必须|根本无法|凭借|要完成)[^。！？!?；;]{4,80}(?:能量|环境|法则|逻辑|模型|神识|精神力|效率|消耗|电源|雷霆)/.test(
      text,
    )
  );
}

function isConceptualFlexLine(sentence) {
  const text = stripSentencePunctuation(sentence);
  return (
    /(?:让|给|教)[^。！？!?；;]{0,16}(?:你们|他们|世人|所有人|修仙界|这世界)[^。！？!?；;]{0,24}(?:看看|见识|明白|知道)[^。！？!?；;]{0,80}/.test(
      text,
    ) ||
    /什么是[^。！？!?；;]{2,24}(?:，|,)[^。！？!?；;]{0,12}什么是[^。！？!?；;]{2,36}/.test(
      text,
    ) ||
    /[^。！？!?；;]{1,16}即是[^。！？!?；;]{1,24}/.test(text) ||
    /来自[^。！？!?；;]{2,24}的(?:降维打击|审判|制裁|真理|正义|力量|法则)/.test(
      text,
    )
  );
}

function isKnowledgeGapFlex(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 120) {
    return false;
  }
  return (
    /(?:你们|他们|这个世界的人|修仙界的人|凡人|土著|原始人)[^。！？!?；;]{0,24}(?:不会玩|根本不知道|不知道|不懂|只会|还停留|没见过)[^。！？!?；;]{0,60}/.test(
      text,
    ) ||
    /(?:等我|只要我|如果我|我要|他要)[^。！？!?；;]{0,18}(?:把|将)[^。！？!?；;]{1,28}(?:修出来|做出来|炼出来|拆了|电解|分解|提纯|还原|改造|重构)[^。！？!?；;]{0,40}/.test(
      text,
    ) ||
    /(?:水|火|雷|灵根|规则|副本|怪谈|系统|阵法|丹药|材料|灵气)[^。！？!?；;]{0,16}(?:这东西|这玩意)[^。！？!?；;]{0,24}(?:看着|听着)[^。！？!?；;]{0,24}(?:其实|真正|狠起来)[^。！？!?；;]{1,50}/.test(
      text,
    ) ||
    /(?:真正|其实|本质上)[^。！？!?；;]{0,24}(?:危险|杀伤力|厉害|可怕|强|弱)[^。！？!?；;]{0,40}(?:十倍|百倍|根本|不是|在于)/.test(
      text,
    )
  );
}

function contrastTaglineRole(sentence, protagonist) {
  const text = stripSentencePunctuation(sentence);
  if (isMassContrastClause(text) && hasPassiveSurvivalAction(text)) {
    return "mass";
  }
  if (isHeroContrastClause(text, protagonist) && hasActiveExploitAction(text)) {
    return "hero";
  }
  return null;
}

function isSingleSentenceContrastTagline(sentence, protagonist) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 95) {
    return false;
  }
  const turnIndex = text.search(/(?:，|,|；|;)?(?:而|但|可|只有|偏偏)/);
  if (turnIndex <= 0) {
    return false;
  }
  const before = text.slice(0, turnIndex);
  const after = text.slice(turnIndex);
  return (
    isMassContrastClause(before) &&
    hasPassiveSurvivalAction(before) &&
    isHeroContrastClause(after, protagonist) &&
    hasActiveExploitAction(after)
  );
}

function hasContrastTurn(sentence) {
  return /^(?:而|但|可|只有|偏偏)\s*(?:他|她|主角|[一-龥]{2,4})/.test(
    stripSentencePunctuation(sentence),
  );
}

function isMassContrastClause(text) {
  return /(?:别人|其他人|所有人|普通人|世人|他们|她们|玩家们|幸存者|修士们|同龄人|旁人|大多数人)/.test(
    text,
  );
}

function isHeroContrastClause(text, protagonist) {
  const heroPattern = /(?:而他|但他|可他|只有他|偏偏他|而她|但她|可她|只有她|偏偏她|主角)/;
  if (heroPattern.test(text)) {
    return true;
  }
  return Boolean(protagonist && text.includes(protagonist));
}

function hasPassiveSurvivalAction(text) {
  return /(?:求生|逃命|挣扎|苟活|活下去|九死一生|恐惧|躲避|保命|通关|等死|被迫|受苦|挨打|送死|找活路|想办法活)/.test(
    text,
  );
}

function hasActiveExploitAction(text) {
  return /(?:搞|玩|量|装修|收租|开店|种田|经营|薅|打包|卖|上市|改造|定制|当老板|收编|素材化|刷怪|捡漏|进货|送货|发家|发财|做生意|建房|升级|采购|炼成|养成)/.test(
    text,
  );
}

function isOmniscientGroupMind(sentence) {
  const text = sentence.trim();
  if (/^[“"「『]/.test(text)) {
    return false;
  }
  return (
    /(?:所有人|众人|他们|人群|台下弟子|围观者|那些人)[^。！？!?；;]{0,20}(?:都|已经|开始|心中|心里|脑海中)[^。！？!?；;]{0,40}(?:认为|觉得|认定|盘算|以为|知道|明白|意识到|想)/.test(
      text,
    ) ||
    /(?:有人|甚至有人)[^。！？!?；;]{0,30}(?:开始|已经)[^。！？!?；;]{0,40}(?:盘算|想着|觉得|认定)/.test(
      text,
    ) ||
    /没有人[^。！？!?；;]{0,30}(?:知道|想到|意识到|明白)/.test(text)
  );
}

function isFinalHookCliche(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 60) {
    return false;
  }
  return (
    /(?:没有人知道|无人知道|谁也不知道)[^。！？!?；;]{0,24}(?:开始|序幕|真正|命运|未来|将会|已经)/.test(
      text,
    ) ||
    /(?:这|那|一切|所有事)[^。！？!?；;]{0,8}(?:仅仅|只是|才)[^。！？!?；;]{0,8}(?:开始|序幕|开端)/.test(
      text,
    ) ||
    /(?:真正的|属于他的|属于这个世界的)[^。！？!?；;]{0,24}(?:才刚刚开始|刚刚开始|即将开始|拉开序幕)/.test(
      text,
    ) ||
    /(?:从这一刻起|从此刻起)[^。！？!?；;]{0,36}(?:开始|改变|不同|回不去了)/.test(
      text,
    )
  );
}

function isFinalOminousImageHook(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 70 || /^[【\[]/.test(text)) {
    return false;
  }
  if (
    /(?:眼底|眼里|瞳孔|掌心|墙上|门缝|水面|河面|坑底|镜中)[^。！？!?；;]{0,24}(?:青光|红光|黑光|血光|符痕|灰痕|影子)[^。！？!?；;]{0,24}(?:闪过|亮起|浮现|收了|消失|掠过)/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /^(?:青光|红光|黑光|血光|灰痕|符痕|影子)[^。！？!?；;]{0,10}(?:收了|灭了|消失|亮了一下|闪了一下)$/.test(
      text,
    )
  ) {
    return true;
  }
  const image =
    /(?:光|影|眼|门|窗|镜|墙|河面|水面|天空|云|雾|灯|火|铃|脚步|笑声|哭声|风声|异响|痕|符|血|纸|字|人影|黑影|灰影|红点|青光|血光|乌鸦|兽瞳)/;
  const event =
    /(?:一闪而过|闪过|闪了一下|亮了一下|动了一下|浮现|出现|消失|掠过|传来|响起|停住|落下|睁开|注视|看见|听见|盯着|映出|收了)/;
  const suspenseTone =
    /(?:极淡|忽然|突然|不知何时|没有眨|没再|最后|夜色|黑暗|漆黑|阴影|像幻觉|像是错觉|安静|死寂|无声)/;
  return image.test(text) && event.test(text) && suspenseTone.test(text);
}

function hasCommonActionVerb(text) {
  return /(?:走来|走去|看见|看到|说道|问道|喊道|叫道|听见|听到|闻到|知道|需要|确定|明白|感觉|觉得|发现|盯着|握住|抓住|压住|敲响|停下|亮起|灭掉|散开|收回|变成|正在|已经|没有|不是|不能|可以|必须|应该|想要|想起|醒来|睡着|死了|活着)$/.test(
    text,
  ) || /(?:走|看|说|拿|打|杀|跑|坐|站|伸|推|砍|开|关|问|答|笑|哭|喊|叫|听|闻|落|飞|撞|砸|退|进|出|回|来|去|醒|睡|想|盯|握|抬|低|转|靠|蹲|跪|吐|咬|抓|拖|压|敲|爬|停|亮|灭|散|收|涨|疼|冷|热|断|响|动|变)$/.test(
    text,
  );
}

function isKeywordHookNounSentence(sentence) {
  const text = stripSentencePunctuation(sentence);
  const length = visibleLength(text);
  if (
    length < 2 ||
    length > 12 ||
    /^[“"「『【\[]/.test(text) ||
    /[，,：:、]/.test(text)
  ) {
    return false;
  }
  if (/^(?:他|她|它|我|你|我们|他们|她们|这|那|这个|那个|现在|今晚|明天)/.test(text)) {
    return false;
  }
  if (/[了着过]$/.test(text) || hasCommonActionVerb(text)) {
    return false;
  }
  const nounEnding =
    /(?:会|门|城|井|庙|堂|帮|宗|峰|谷|院|楼|塔|区|营地|地宫|钥匙|法器|法宝|符|灰符|名单|账本|手札|徽记|图案|烙印|铜钱|钱|枪|钟|轮|齿轮|组织|真相|秘密|规则|裂隙|副本|怪谈|咒灵|咒术|高专|仙法|灵根|灵力|地窖|旧井|黑水|白钟|灰塔|赤烬)$/;
  return nounEnding.test(text) || /^[\p{Script=Han}A-Za-z0-9]{2,8}$/u.test(text);
}

function hasKeywordHookFollowup(sentence) {
  const text = stripSentencePunctuation(sentence);
  return /(?:这些|它们|这几个|这几件|答案|真相|秘密|知道答案|搞清楚|等着|不只是|已经|刻在|长在|跟着|回来|下一次|会回来|之前|之后|那里有什么|是什么)/.test(
    text,
  );
}

function sentenceStarterKey(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (
    visibleLength(text) < 4 ||
    /^[“"「『【\[]/.test(text) ||
    /^[\d:：]+$/.test(text)
  ) {
    return "";
  }
  const fixed = text.match(
    /^(这一次|这一刻|这时候|这个时候|现在|而现在|但现在|然后|随后|紧接着|与此同时|下一秒|片刻后|半晌|终于|忽然|突然|但|可|所以|因为)/,
  );
  if (fixed) {
    return fixed[1];
  }
  const pronounAction = text.match(
    /^(他|她|它|他们|她们|我|我们)(?:知道|确定|明白|意识到|发现|判断|需要|没有|不是|能感觉到|能听到|把|低头|抬头|走|看|站|坐|伸|转身|闭上|睁开|握住|抓住|盯着|靠着|回头)/,
  );
  if (pronounAction) {
    return pronounAction[0].slice(0, Math.min(5, pronounAction[0].length));
  }
  const negation = text.match(/^(不是|没有|不再|这不是|那不是)/);
  return negation ? negation[1] : "";
}

function isCognitionExpositionEntry(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 110 || /^[“"「『【\[]/.test(text)) {
    return false;
  }
  return /^(?:他|她|它|我|[一-龥]{2,4})[^。！？!?；;]{0,18}(?:忽然|终于|立刻|很快|已经|现在|一下子)?(?:明白|确定|意识到|知道|发现|判断出|判断|反应过来|看出来|想通)[^。！？!?；;]{0,80}$/.test(
    text,
  );
}

function hasImmediateExplanationInCognition(sentence) {
  const text = stripSentencePunctuation(sentence);
  return /(?:一件事|这件事|原因|说明|意味着|真正|本质|规则|逻辑|机制|目标|答案|关键|核心|不是|而是|其实|原来|所以|因为|只要|就能|只需|必须|需要)[^。！？!?；;]{0,80}/.test(
    text,
  );
}

function hasExplanationFollowupSignal(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (/^[“"「『【\[]/.test(text)) {
    return false;
  }
  return /(?:不是|而是|说明|意味着|证明|真正|原来|其实|原因|规则|逻辑|机制|目标|答案|关键|核心|代价|成本|范围|射程|不致命|够用|万能|接下来|下一次|之前|之后|只要|就能|必须|需要|所以|因为)/.test(
    text,
  );
}

function isCommaNegativeTail(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 36) {
    return false;
  }
  return /，(?:没|不|未)[^，。！？!?；;]{1,8}$/.test(text);
}

function isCommaButTail(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (visibleLength(text) > 42) {
    return false;
  }
  return /，但[^，。！？!?；;]{1,8}$/.test(text);
}

function isMirroredContrastPair(firstSentence, secondSentence) {
  const first = stripSentencePunctuation(firstSentence);
  const second = stripSentencePunctuation(secondSentence);
  if (visibleLength(first) > 28 || visibleLength(second) > 42) {
    return false;
  }
  return (
    (/^不像[^。！？!?；;]{1,24}$/.test(first) &&
      /^像[^。！？!?；;]{1,36}$/.test(second)) ||
    (/^不是[^。！？!?；;]{1,24}$/.test(first) &&
      /^是[^。！？!?；;]{1,36}$/.test(second)) ||
    (/很[\p{Script=Han}]{1,6}$/u.test(first) &&
      /^也很[\p{Script=Han}]{1,10}$/u.test(second)) ||
    (/^能[^。！？!?；;]{1,12}$/.test(first) &&
      /^也能[^。！？!?；;]{1,18}$/.test(second))
  );
}

function hasDeductionPattern(sentence) {
  const text = stripSentencePunctuation(sentence);
  if (/^[“"「『【\[]/.test(text)) {
    return false;
  }
  return (
    /(?:不是|不是什么)[^。！？!?；;]{1,30}(?:是|而是|是在|而是在)[^。！？!?；;]{0,60}/.test(
      text,
    ) ||
    /(?:说明|证明|意味着)[^。！？!?；;]{1,80}/.test(text) ||
    /(?:真正|原本|背后)[^。！？!?；;]{0,20}(?:要的|找的|查的|藏的|盯的|保的)[^。！？!?；;]{0,60}/.test(
      text,
    ) ||
    /(?:问的是|找的是|要的是|冲着|专门挑|无缘无故|不可能)[^。！？!?；;]{1,80}/.test(
      text,
    ) ||
    /(?:如果|要是)[^。！？!?；;]{4,80}/.test(text) ||
    /(?:这些|这几件|这几个|这些东西)[^。！？!?；;]{0,24}(?:之间|背后)[^。！？!?；;]{0,44}(?:线|关系|关键|连着)/.test(
      text,
    )
  );
}

function isTailSentence(entry, sentenceEntries, tailSize) {
  const narrativeEntries = sentenceEntries.filter(
    (item) =>
      !item.isDialogue && visibleLength(stripSentencePunctuation(item.text)) > 0,
  );
  const tailEntries = narrativeEntries.slice(-tailSize);
  return tailEntries.some((item) => item === entry);
}

function hasNarrativeColon(sentence) {
  const trimmed = sentence.trim();
  if (!/[：:]/.test(trimmed)) {
    return false;
  }
  if (/^\s*[【\[]/.test(trimmed) || /^\s*[“"「『]/.test(trimmed)) {
    return false;
  }
  if (/\d{1,2}:\d{2}/.test(trimmed)) {
    return false;
  }
  // 系统面板「字段：值」短行（宿主：林夜 / 力量：6.8 / 技能树：未解锁）是数据行呈现，不算说明文冒号
  if (/^[\p{Script=Han}A-Za-z0-9]{1,6}[：:][^：:]{1,24}$/u.test(trimmed)) {
    return false;
  }
  const colonQuoteIndex = trimmed.search(/[：:]\s*[“"「『]/);
  if (colonQuoteIndex >= 0) {
    const beforeColon = trimmed.slice(0, colonQuoteIndex);
    const tail = beforeColon.slice(-28);
    const labelLead = /(?:小字|文字|提示|警告|界面|面板|屏幕|弹窗|残注|写着|显示|跳出|冒出|闪过|一行|两个字|几个字|词|标题|规则|要求|惩罚|奖励|方案|结果)$/;
    if (!labelLead.test(tail)) {
      return false;
    }
    const humanDialogueLead =
      /(?:说|说道|道|问|问道|喊|喊道|叫|叫道|吼|吼道|骂|骂道|笑|笑道|冷笑|嗤|嗤笑|低吼|嘶吼|嘶嚎|嘶嚎道|回答|开口|继续说|补了一句|吩咐|提醒|宣布|大声宣布|喃喃自语|出声|咆哮|皱眉|愣了一下|脸色一沉|沉声|低声|轻声|沙哑道|淡淡道|懒得再多言|呢喃安慰道|嫌弃道|赔笑|满脸堆笑|挤了挤眼睛|声音[^。！？!?；;：:]{0,8}(?:发颤|打颤|发抖|沙哑|压低|很轻|很低)|嗓音[^。！？!?；;：:]{0,8}(?:发颤|沙哑|很轻)|语气[^。！？!?；;：:]{0,8}(?:平静|冷淡|发冷|很轻)|长老|弟子|少年|少女|男人|女人|老头|陈默|赵恒|李长老|陆泽|陈让)$/;
    if (!labelLead.test(tail) && humanDialogueLead.test(tail)) {
      return false;
    }
  }
  const speechLead =
    /(?:说|说道|道|问|问道|喊|喊道|叫|叫道|吼|吼道|骂|骂道|笑|笑道|冷笑|嗤|嗤笑|低吼|嘶吼|嘶嚎|嘶嚎道|回答|开口|继续说|补了一句|吩咐|提醒|暴怒|宣布|大声宣布|喃喃自语|出声|咆哮|皱眉|愣了一下|沉声|低声|轻声|沙哑道|淡淡道|懒得再多言|呢喃安慰道|嫌弃道|赔笑|满脸堆笑|挤了挤眼睛|声音[^。！？!?；;：:]{0,8}(?:发颤|打颤|发抖|沙哑|压低|很轻|很低)|嗓音[^。！？!?；;：:]{0,8}(?:发颤|沙哑|很轻)|语气[^。！？!?；;：:]{0,8}(?:平静|冷淡|发冷|很轻))/;
  if (new RegExp(`${speechLead.source}[^。！？!?；;：:]{0,16}[：:]\\s*[“"「『]`).test(trimmed)) {
    return false;
  }
  const speechVerb =
    /(?:说|说道|道|问|问道|喊|喊道|叫|叫道|吼|吼道|骂|骂道|笑道|冷笑|嗤笑|低吼|嘶吼|嘶嚎道|回答|开口|继续说|暴怒|宣布|大声宣布|喃喃自语|出声|咆哮|淡淡道|呢喃安慰道|嫌弃道)/;
  if (new RegExp(`${speechVerb.source}[：:]\\s*[“"「『]`).test(trimmed)) {
    return false;
  }
  if (new RegExp(`${speechVerb.source}[^。！？!?；;]{0,24}[：:]$`).test(trimmed)) {
    return false;
  }
  return true;
}

function findNonDialogueQuotes(sentence) {
  const result = [];
  const quotePattern = /[“"「『][^”"」』\n]{1,24}[”"」』]/g;
  let match;
  while ((match = quotePattern.exec(sentence))) {
    const before = sentence.slice(Math.max(0, match.index - 8), match.index);
    const trimmedBefore = sentence.slice(0, match.index).trim();
    if (match.index === 0 || /^[：:]\s*$/.test(trimmedBefore)) {
      continue;
    }
    if (/(?:说|道|问|喊|叫|吼|骂|笑|嗤|一声|声音|声响|皱眉|愣了一下|脸色一沉|沉声|低声|轻声)[^。！？!?；;：:]{0,10}[：:]\s*$/.test(before)) {
      continue;
    }
    if (isQuotedSoundEffect(match[0], sentence, match.index)) {
      continue;
    }
    result.push({ index: match.index, text: match[0] });
  }
  return result;
}

function isDialogueSentence(sentence, index, fullText) {
  const trimmed = sentence.trim();
  return (
    /^[“"「『]/.test(trimmed) ||
    /[”"」』]$/.test(trimmed) ||
    (index >= 0 && isInsideQuoteAt(fullText, index))
  );
}

function stripSentencePunctuation(sentence) {
  return sentence
    .trim()
    .replace(/^[\s“"「『]+|[\s”"」』]+$/g, "")
    .replace(/[。！？!?；;]+$/g, "")
    .trim();
}

function isShortNarrativeSentence(sentence) {
  const stripped = stripSentencePunctuation(sentence);
  if (!/[\p{Script=Han}]/u.test(stripped)) {
    return false;
  }
  if (/^\d{1,2}:\d{2}$/.test(stripped)) {
    return false;
  }
  return visibleLength(stripped) <= 12;
}

function isJudgmentStampSentence(sentence) {
  const stripped = stripSentencePunctuation(sentence);
  if (visibleLength(stripped) > 24) {
    return false;
  }
  return (
    /^(?:够了|好算盘|疼就对了|死得太快|位置彻底反转了|这就是[^。！？!?；;]{1,18}|这才是[^。！？!?；;]{1,18}|真正的[^。！？!?；;]{1,18})$/.test(
      stripped,
    ) ||
    /^(?:不是|这不是)[^。！？!?；;]{1,14}(?:是|而是)[^。！？!?；;]{1,14}$/.test(
      stripped,
    ) ||
    /^(?:[^。！？!?；;]{1,12})(?:救不了|不能走|不算完|就够了|算完了)$/.test(
      stripped,
    ) ||
    /^现在要[^。！？!?；;]{1,8}$/.test(stripped)
  );
}

function addShortRunHit(hits, run) {
  const avgLength = round(mean(run.map((item) => item.length)), 1);
  addHit(
    hits,
    DYNAMIC_RULE_DEFS.short_sentence_run,
    run[0].line,
    `连续${run.length}句，均长${avgLength}字：${run
      .map((item) => item.text)
      .join(" / ")
      .slice(0, 240)}`,
    run[0].index,
    run.at(-1)?.index ?? null,
  );
}

function isQuotedSoundEffect(quoted, sentence, index) {
  const inner = quoted.slice(1, -1).trim();
  const around = sentence.slice(
    Math.max(0, index - 12),
    Math.min(sentence.length, index + quoted.length + 12),
  );
  if (/^(?:[咔嗒哒啪噼噗砰轰嗡嗤铛咯嘎呼哗啦吱呀嘶呲]{1,6}|[咔嗒哒啪噼噗砰轰嗡嗤铛咯嘎呼哗啦吱呀嘶呲]{1,3}[—\-~～]+[咔嗒哒啪噼噗砰轰嗡嗤铛咯嘎呼哗啦吱呀嘶呲]{0,3})$/.test(inner)) {
    return true;
  }
  return (
    visibleLength(inner) <= 4 &&
    /(?:声|响|音|发出|传来|响起|回荡|嗓子|喉咙)/.test(around)
  );
}

function countTerms(text, terms) {
  return terms.reduce((sum, term) => sum + text.split(term).length - 1, 0);
}

function shortSentenceStats(text, sentences) {
  const narrative = [];
  let searchStart = 0;

  for (const sentence of sentences) {
    const index = text.indexOf(sentence, searchStart);
    if (index >= 0) {
      searchStart = index + sentence.length;
    }
    if (!isDialogueSentence(sentence, index, text)) {
      narrative.push({
        text: sentence,
        length: visibleLength(stripSentencePunctuation(sentence)),
        isShort: isShortNarrativeSentence(sentence),
      });
    }
  }

  const shortLengths = narrative
    .filter((item) => item.isShort)
    .map((item) => item.length);
  const veryShortCount = narrative.filter(
    (item) => item.length > 0 && item.length <= 6,
  ).length;
  const runs = [];
  let currentRun = 0;
  for (const item of narrative) {
    if (item.isShort) {
      currentRun += 1;
    } else {
      if (currentRun > 0) {
        runs.push(currentRun);
      }
      currentRun = 0;
    }
  }
  if (currentRun > 0) {
    runs.push(currentRun);
  }

  return {
    short_sentence_ratio:
      narrative.length > 0 ? round(shortLengths.length / narrative.length, 3) : 0,
    very_short_sentence_ratio:
      narrative.length > 0 ? round(veryShortCount / narrative.length, 3) : 0,
    avg_short_run_len: runs.length > 0 ? round(mean(runs), 2) : 0,
    max_short_run_len: runs.length > 0 ? Math.max(...runs) : 0,
  };
}

function paragraphFragmentationStats(paragraphs) {
  const items = paragraphs
    .filter((paragraph) => !/^\s*[【\[]/.test(paragraph))
    .map((paragraph) => {
      const length = visibleLength(stripSentencePunctuation(paragraph));
      return {
        text: paragraph,
        length,
        sentenceCount: splitSentences(paragraph).length,
        isShort: length > 0 && length <= 24,
        isMicro: length > 0 && length <= 16,
        isVeryShort: length > 0 && length <= 8,
      };
    })
    .filter((item) => item.length > 0 && /[\p{Script=Han}A-Za-z0-9]/u.test(item.text));

  const microRuns = [];
  let currentMicroRun = 0;
  for (const item of items) {
    if (item.isMicro) {
      currentMicroRun += 1;
    } else {
      if (currentMicroRun > 0) {
        microRuns.push(currentMicroRun);
      }
      currentMicroRun = 0;
    }
  }
  if (currentMicroRun > 0) {
    microRuns.push(currentMicroRun);
  }

  const denominator = items.length;
  const shortCount = items.filter((item) => item.isShort).length;
  const microCount = items.filter((item) => item.isMicro).length;
  const veryShortCount = items.filter((item) => item.isVeryShort).length;
  const singleSentenceCount = items.filter((item) => item.sentenceCount <= 1).length;

  return {
    short_paragraph_ratio:
      denominator > 0 ? round(shortCount / denominator, 3) : 0,
    micro_paragraph_ratio:
      denominator > 0 ? round(microCount / denominator, 3) : 0,
    very_short_paragraph_ratio:
      denominator > 0 ? round(veryShortCount / denominator, 3) : 0,
    single_sentence_paragraph_ratio:
      denominator > 0 ? round(singleSentenceCount / denominator, 3) : 0,
    avg_micro_paragraph_run_len:
      microRuns.length > 0 ? round(mean(microRuns), 2) : 0,
    max_micro_paragraph_run_len:
      microRuns.length > 0 ? Math.max(...microRuns) : 0,
  };
}

function per1k(count, charCount) {
  return charCount > 0 ? (count / charCount) * 1000 : 0;
}

function includesAny(text, words) {
  return words.some((word) => text.includes(word));
}

function focalizationMetrics(paragraphs, protagonist) {
  const protagonistMentions = protagonist
    ? new RegExp(protagonist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    : null;
  let anchorParagraphs = 0;
  let sensoryAnchorCount = 0;
  let cognitionAnchorCount = 0;
  let protagonistMentionCount = 0;
  let omniscientMarkerCount = 0;

  for (const paragraph of paragraphs) {
    const hasProtagonist = protagonistMentions?.test(paragraph) ?? false;
    if (protagonistMentions) {
      protagonistMentions.lastIndex = 0;
      protagonistMentionCount += [...paragraph.matchAll(protagonistMentions)].length;
    }

    const hasPronoun = /(^|[，。！？!?；;\s])(他|她|我)(?=[，。！？!?；;\s]|[一-龥])/.test(
      paragraph,
    );
    const hasSensory = includesAny(paragraph, SENSORY_WORDS);
    const hasCognition = includesAny(paragraph, COGNITION_WORDS);
    const hasGoal = /(要|想|必须|不能|打算|决定|准备|只好)/.test(paragraph);

    if (hasSensory) {
      sensoryAnchorCount += 1;
    }
    if (hasCognition) {
      cognitionAnchorCount += 1;
    }
    if (includesAny(paragraph, OMNISCIENT_MARKERS)) {
      omniscientMarkerCount += 1;
    }
    if (hasProtagonist || hasPronoun || hasSensory || hasCognition || hasGoal) {
      anchorParagraphs += 1;
    }
  }

  return {
    viewpoint_anchor_ratio:
      paragraphs.length > 0 ? round(anchorParagraphs / paragraphs.length, 3) : 0,
    sensory_anchor_count: sensoryAnchorCount,
    cognition_anchor_count: cognitionAnchorCount,
    protagonist_mention_count: protagonistMentionCount,
    omniscient_marker_count: omniscientMarkerCount,
  };
}

function summarizeHits(hits) {
  const summary = new Map();
  for (const hit of hits) {
    const existing = summary.get(hit.id) ?? {
      id: hit.id,
      label: hit.label,
      severity: hit.severity,
      count: 0,
      advice: hit.advice,
    };
    existing.count += 1;
    summary.set(hit.id, existing);
  }
  return [...summary.values()].sort((a, b) => b.count - a.count);
}

function severityScore(severity) {
  if (severity === "high") {
    return 5;
  }
  if (severity === "medium") {
    return 3;
  }
  return 1;
}

const DEFAULT_METRIC_PROFILE = {
  id: "default_webnovel_v1",
  minCharsForFullWeight: 1200,
  groups: {
    rhythm_fragmentation: {
      label: "节奏碎裂",
      rules: [
        {
          id: "short_sentence_ratio",
          path: ["texture", "short_sentence_ratio"],
          direction: "high",
          soft: 0.3,
          hard: 0.5,
          weight: 7,
          reason: "短句比例偏高，正文容易呈现分镜化/口号化节奏。",
        },
        {
          id: "very_short_sentence_ratio",
          path: ["texture", "very_short_sentence_ratio"],
          direction: "high",
          soft: 0.12,
          hard: 0.28,
          weight: 5,
          reason: "极短句比例偏高，容易出现“死局。够了。不是。”式碎片判断。",
        },
        {
          id: "avg_short_run_len",
          path: ["texture", "avg_short_run_len"],
          direction: "high",
          soft: 2.2,
          hard: 3.5,
          weight: 4,
          reason: "连续短句的平均长度偏高，说明短句经常成串出现。",
        },
        {
          id: "max_short_run_len",
          path: ["texture", "max_short_run_len"],
          direction: "high",
          soft: 4,
          hard: 7,
          weight: 4,
          reason: "局部连续短句过长，容易像剧情 beat sheet。",
        },
        {
          id: "micro_paragraph_ratio",
          path: ["texture", "micro_paragraph_ratio"],
          direction: "high",
          soft: 0.48,
          hard: 0.68,
          weight: 8,
          reason: "短段比例明显偏高，换行承担了过多情绪和节奏。",
        },
        {
          id: "paragraph_per_1k",
          path: ["rhythm", "paragraph_per_1k"],
          direction: "high",
          soft: 55,
          hard: 85,
          weight: 4,
          reason: "每千字段落数过高，整体版面偏碎。",
        },
        {
          id: "sentence_len_mean",
          path: ["rhythm", "sentence_len_mean"],
          direction: "low",
          soft: 16,
          hard: 10,
          weight: 5,
          reason: "平均句长偏短，容易形成过密短判断。",
        },
        {
          id: "sentence_len_std",
          path: ["rhythm", "sentence_len_std"],
          direction: "low",
          soft: 8,
          hard: 5,
          weight: 3,
          reason: "句长波动偏低，节奏可能过于整齐。",
        },
      ],
    },
    exposition_density: {
      label: "解释密度",
      rules: [
        {
          id: "explanation_marker_per_1k",
          path: ["texture", "explanation_marker_per_1k"],
          direction: "high",
          soft: 8,
          hard: 18,
          weight: 8,
          reason: "解释词密度偏高，作者可能在抢着讲规则、机制或原因。",
        },
        {
          id: "transition_marker_per_1k",
          path: ["texture", "transition_marker_per_1k"],
          direction: "high",
          soft: 5,
          hard: 14,
          weight: 4,
          reason: "转场词密度偏高，容易显得像影视分镜推进。",
        },
        {
          id: "cognition_anchor_count",
          path: ["focalization", "cognition_anchor_count"],
          direction: "per1k_high",
          soft: 8,
          hard: 18,
          weight: 5,
          reason: "认知锚点偏密，可能频繁用“知道/明白/意识到”开解释入口。",
        },
      ],
    },
    imagery_overload: {
      label: "意象/修饰过载",
      rules: [
        {
          id: "simile_marker_per_1k",
          path: ["texture", "simile_marker_per_1k"],
          direction: "high",
          soft: 8,
          hard: 18,
          weight: 7,
          reason: "比喻标记密度偏高，可能出现连续找画面感的问题。",
        },
        {
          id: "poetic_abstraction_score_per_1k",
          path: ["texture", "poetic_abstraction_score_per_1k"],
          direction: "high",
          soft: 8,
          hard: 18,
          weight: 6,
          reason: "抽象意象分偏高，容易出现“高级感意象”堆叠。",
        },
        {
          id: "intensifier_per_1k",
          path: ["texture", "intensifier_per_1k"],
          direction: "high",
          soft: 10,
          hard: 22,
          weight: 5,
          reason: "强度词密度偏高，段落容易长期处在最大音量。",
        },
      ],
    },
    punctuation_texture: {
      label: "标点纹理",
      rules: [
        {
          id: "dash_per_1k",
          path: ["punctuation", "dash_per_1k"],
          direction: "high",
          soft: 1,
          hard: 5,
          weight: 4,
          reason: "破折号密度偏高，容易形成解释性补充和作者强调。",
        },
        {
          id: "ellipsis_per_1k",
          path: ["punctuation", "ellipsis_per_1k"],
          direction: "high",
          soft: 3,
          hard: 10,
          weight: 3,
          reason: "省略号密度偏高，情绪停顿可能过度依赖标点。",
        },
        {
          id: "exclamation_per_1k",
          path: ["punctuation", "exclamation_per_1k"],
          direction: "high",
          soft: 4,
          hard: 12,
          weight: 3,
          reason: "感叹号密度偏高，容易让情绪外放过满。",
        },
      ],
    },
  },
};

function readMetricValue(metrics, pathParts) {
  return pathParts.reduce(
    (value, key) =>
      value && Object.hasOwn(value, key) ? value[key] : undefined,
    metrics,
  );
}

function metricRuleRawScore(value, rule, charCount) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  let comparable = value;
  if (rule.direction === "per1k_high" || rule.direction === "per1k_low") {
    comparable = per1k(value, charCount);
  }

  if (rule.direction === "high" || rule.direction === "per1k_high") {
    if (comparable <= rule.soft) {
      return 0;
    }
    if (comparable >= rule.hard) {
      return rule.weight;
    }
    return ((comparable - rule.soft) / (rule.hard - rule.soft)) * rule.weight;
  }

  if (rule.direction === "low" || rule.direction === "per1k_low") {
    if (comparable >= rule.soft) {
      return 0;
    }
    if (comparable <= rule.hard) {
      return rule.weight;
    }
    return ((rule.soft - comparable) / (rule.soft - rule.hard)) * rule.weight;
  }

  return 0;
}

function formatMetricExpected(rule) {
  if (rule.direction === "high" || rule.direction === "per1k_high") {
    return `<= ${rule.soft}`;
  }
  return `>= ${rule.soft}`;
}

function formatMetricHard(rule) {
  if (rule.direction === "high" || rule.direction === "per1k_high") {
    return `>= ${rule.hard}`;
  }
  return `<= ${rule.hard}`;
}

function metricComparableValue(value, rule, charCount) {
  if (rule.direction === "per1k_high" || rule.direction === "per1k_low") {
    return round(per1k(value, charCount));
  }
  return value;
}

function metricSampleWeight(charCount, profile) {
  if (charCount >= profile.minCharsForFullWeight) {
    return 1;
  }
  if (charCount >= 800) {
    return 0.85;
  }
  if (charCount >= 400) {
    return 0.65;
  }
  return 0.45;
}

function scoreMetrics(metrics, charCount, profile = DEFAULT_METRIC_PROFILE) {
  const sampleWeight = metricSampleWeight(charCount, profile);
  const groups = [];
  const triggered = [];
  let total = 0;

  for (const [groupId, group] of Object.entries(profile.groups)) {
    const ruleScores = [];
    let rawGroupScore = 0;

    for (const rule of group.rules) {
      const value = readMetricValue(metrics, rule.path);
      const rawScore = metricRuleRawScore(value, rule, charCount);
      if (rawScore <= 0) {
        continue;
      }
      const item = {
        id: rule.id,
        group: groupId,
        label: group.label,
        value: metricComparableValue(value, rule, charCount),
        raw_value: value,
        expected: formatMetricExpected(rule),
        hard: formatMetricHard(rule),
        direction: rule.direction,
        raw_score: round(rawScore, 2),
        reason: rule.reason,
      };
      ruleScores.push(item);
      rawGroupScore += rawScore;
    }

    const score = round(rawGroupScore * sampleWeight, 2);
    if (score > 0) {
      groups.push({
        id: groupId,
        label: group.label,
        raw_score: round(rawGroupScore, 2),
        score,
        rules: ruleScores,
      });
      total += score;
      triggered.push(
        ...ruleScores.map((item) => ({
          ...item,
          score: round(item.raw_score * sampleWeight, 2),
        })),
      );
    }
  }

  return {
    profile: profile.id,
    sample_weight: sampleWeight,
    score: Math.round(total),
    raw_score: round(
      groups.reduce((sum, group) => sum + group.raw_score, 0),
      2,
    ),
    groups,
    triggered: triggered.sort((a, b) => b.score - a.score),
  };
}

function buildReport(text, options) {
  const normalizedText = text.replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");
  const paragraphs = splitParagraphs(normalizedText);
  const sentences = splitSentences(normalizedText);
  const charCount = visibleLength(normalizedText);
  const sentenceLens = sentences.map(visibleLength).filter((value) => value > 0);
  const paragraphLens = paragraphs.map(visibleLength).filter((value) => value > 0);
  const hits = [
    ...collectRuleHits(normalizedText, lines),
    ...collectDynamicHits(normalizedText, paragraphs, sentences, lines, options),
  ].sort((a, b) => a.line - b.line);

  const rhythm = {
    char_count: charCount,
    paragraph_count: paragraphs.length,
    sentence_count: sentences.length,
    paragraph_per_1k: round(per1k(paragraphs.length, charCount)),
    sentence_per_1k: round(per1k(sentences.length, charCount)),
    sentence_per_paragraph:
      paragraphs.length > 0 ? round(sentences.length / paragraphs.length, 2) : 0,
    sentence_len_mean: round(mean(sentenceLens)),
    sentence_len_std: round(std(sentenceLens)),
    paragraph_len_mean: round(mean(paragraphLens)),
    paragraph_len_std: round(std(paragraphLens)),
    dialogue_ratio: round(dialogueRatio(normalizedText, charCount), 3),
  };

  const punctuation = {
    dash_per_1k: round(per1k(countOccurrences(normalizedText, /——/g), charCount)),
    ellipsis_per_1k: round(per1k(countOccurrences(normalizedText, /……|\.{3,}/g), charCount)),
    question_per_1k: round(per1k(countOccurrences(normalizedText, /[？?]/g), charCount)),
    exclamation_per_1k: round(per1k(countOccurrences(normalizedText, /[！!]/g), charCount)),
    comma_per_sentence: round(
      sentences.length > 0
        ? countOccurrences(normalizedText, /[，,]/g) / sentences.length
        : 0,
    ),
  };

  const textureTerms = {
    explanation: [
      "因为",
      "为了",
      "就是",
      "所以",
      "从而",
      "导致",
      "判定",
      "检测",
      "逻辑",
      "规则",
      "机制",
      "因果",
      "底层",
      "代价",
      "系统",
      "剧本",
      "人设",
      "OOC",
      "抹杀",
      "结算",
      "真相",
    ],
    transition: [
      "下一秒",
      "与此同时",
      "紧接着",
      "然而",
      "这一刻",
      "就在",
      "就是现在",
    ],
    intensifier: [
      "瞬间",
      "根本",
      "狂暴",
      "极点",
      "恐怖",
      "直接",
      "彻底",
      "猛地",
      "死死",
      "狠狠",
      "精准",
      "极度",
      "极其",
      "绝对",
      "疯狂",
      "毫无",
      "完全",
      "无比",
      "无法形容",
      "非人",
    ],
  };
  const systemPanelCount = countOccurrences(
    normalizedText,
    /^【[^】\n]{0,90}(?:系统|剧本|角色|分配|完成度|结算|OOC|警报|检测|判定|观众信仰值|高维观测池)[^】\n]*】/gm,
  );
  const shortStats = shortSentenceStats(normalizedText, sentences);
  const paragraphStats = paragraphFragmentationStats(paragraphs);
  const texture = {
    simile_marker_per_1k: round(
      per1k(countSimileConstructions(normalizedText), charCount),
    ),
    poetic_abstraction_score_per_1k: round(
      per1k(
        sentences.reduce(
          (sum, sentence) => sum + poeticAbstractionScore(sentence),
          0,
        ),
        charCount,
      ),
    ),
    explanation_marker_per_1k: round(
      per1k(countTerms(normalizedText, textureTerms.explanation), charCount),
    ),
    transition_marker_per_1k: round(
      per1k(countTerms(normalizedText, textureTerms.transition), charCount),
    ),
    intensifier_per_1k: round(
      per1k(countTerms(normalizedText, textureTerms.intensifier), charCount),
    ),
    system_panel_count: systemPanelCount,
    system_panel_per_1k: round(per1k(systemPanelCount, charCount)),
    ...shortStats,
    ...paragraphStats,
  };

  const focalization = focalizationMetrics(paragraphs, options.protagonist);
  const summary = summarizeHits(hits);
  const patternScore = summary.reduce(
    (sum, item) => sum + item.count * severityScore(item.severity),
    0,
  );
  const metrics = {
    rhythm,
    punctuation,
    texture,
    focalization,
  };
  const metricScoring = scoreMetrics(metrics, charCount);
  const riskScore = patternScore + metricScoring.score;

  return {
    version: 5,
    protagonist: options.protagonist || null,
    risk_score: riskScore,
    pattern_score: patternScore,
    metric_score: metricScoring.score,
    metric_scoring: metricScoring,
    metrics,
    pattern_summary: summary,
    hits: hits.slice(0, options.top),
  };
}

function renderMarkdown(report) {
  const lines = [];
  lines.push("# Novel Style Scan");
  lines.push("");
  lines.push(`Risk score: ${report.risk_score}`);
  lines.push(
    `Pattern score: ${report.pattern_score} | Metric score: ${report.metric_score} (${report.metric_scoring.profile}, weight ${report.metric_scoring.sample_weight})`,
  );
  if (report.protagonist) {
    lines.push(`Protagonist: ${report.protagonist}`);
  }
  lines.push("");
  lines.push("## Metrics");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(report.metrics, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Metric Scoring");
  lines.push("");

  if (report.metric_scoring.triggered.length === 0) {
    lines.push("No metric deviations.");
  } else {
    lines.push("Group scores:");
    for (const group of report.metric_scoring.groups) {
      lines.push(
        `- ${group.label} (${group.id}): +${group.score}`,
      );
    }
    lines.push("");
    lines.push("Triggered metrics:");
    for (const item of report.metric_scoring.triggered.slice(0, 12)) {
      lines.push(
        `- ${item.id} (${item.label}): +${item.score} | value=${item.value}, expected ${item.expected}, hard ${item.hard}`,
      );
      lines.push(`  - ${item.reason}`);
    }
  }

  lines.push("");
  lines.push("## Pattern Summary");
  lines.push("");

  if (report.pattern_summary.length === 0) {
    lines.push("No pattern hits.");
  } else {
    for (const item of report.pattern_summary) {
      lines.push(
        `- ${item.label} (${item.id}, ${item.severity}): ${item.count}`,
      );
    }
  }

  lines.push("");
  lines.push("## Evidence");
  lines.push("");

  if (report.hits.length === 0) {
    lines.push("No evidence.");
  } else {
    for (const hit of report.hits) {
      lines.push(`- L${hit.line} ${hit.label} [${hit.severity}]`);
      lines.push(`  - ${hit.text}`);
      lines.push(`  - ${hit.advice}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command !== "compare" || !options.target) {
    process.stderr.write(usage());
    process.exit(2);
  }

  const text = await readTarget(options.target);
  const report = buildReport(text, options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(renderMarkdown(report));
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
