import { PROMPT_VERSION } from "./prompt-version";
import type { QualityBenchmarkFixture } from "./quality-benchmark";

export interface QualityBenchmarkCase {
  fixture: QualityBenchmarkFixture;
  baselineOutput: { issues: Array<{ severity: string; category: string; message: string; evidence: string }> };
}

export const QUALITY_BENCHMARK = {
  corpusVersion: "2026-11-24.public.v1",
  promptVersion: PROMPT_VERSION,
  minimumAverageScore: 90,
  cases: [
    {
      fixture: {
        id: "launch-character-dossier-knowledge-boundary",
        title: "完整人物档案不等于角色知晓全局秘密",
        genre: "都市脑洞",
        stage: "开篇",
        chapterKind: "开篇",
        chapter: "许澄第一次见到顾闻，就说出了顾闻藏在旧站地下室的录音带。",
        contextEvidence: ["人物档案中的作者设定：只有顾闻知道录音带位置，许澄尚未获得任何相关线索。"],
        expectedIssues: [
          { id: "dossier-secret", category: "知识边界", severity: "硬性", matchAny: ["录音带", "尚未", "顾闻"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "知识边界",
            message: "许澄直接使用了仅顾闻知晓的人物档案秘密，尚未取得线索",
            evidence: "说出了顾闻藏在旧站地下室的录音带",
          },
        ],
      },
    },
    {
      fixture: {
        id: "knowledge-boundary-password",
        title: "角色越过知识边界",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "林舟看了一眼紧闭的门，直接说出了密码是7319。",
        contextEvidence: ["机房密码只有反派周成知晓，林舟尚未获得密码。"],
        expectedIssues: [
          { id: "unknown-password", category: "知识边界", severity: "硬性", matchAny: ["密码", "尚未获得"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "知识边界",
            message: "林舟使用了尚未获得的密码",
            evidence: "直接说出了密码是7319",
          },
        ],
      },
    },
    {
      fixture: {
        id: "resource-conservation-spirit-stones",
        title: "资源数量不守恒",
        genre: "玄幻/仙侠",
        stage: "扩张",
        chapter: "沈砚取出八十枚灵石交给掌柜，买下了赤炎炉。",
        contextEvidence: ["沈砚当前仅剩五十枚灵石。"],
        expectedIssues: [
          {
            id: "insufficient-stones",
            category: "资源一致性",
            severity: "硬性",
            matchAny: ["八十枚", "五十枚", "不足"],
          },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "资源一致性",
            message: "现有五十枚灵石不足以支付八十枚",
            evidence: "沈砚当前仅剩五十枚灵石",
          },
        ],
      },
    },
    {
      fixture: {
        id: "timeline-impossible-travel",
        title: "时间地点冲突",
        genre: "历史权谋",
        stage: "中期",
        chapter: "午时刚过，陆青已经站在三百里外的北仓城头。",
        contextEvidence: ["当日辰时，陆青仍在京城参加朝会；京城至北仓快马需两日。"],
        expectedIssues: [
          { id: "impossible-travel", category: "时间线", severity: "硬性", matchAny: ["三百里", "两日", "午时"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "时间线",
            message: "陆青无法在半日内抵达三百里外的北仓",
            evidence: "京城至北仓快马需两日",
          },
        ],
      },
    },
    {
      fixture: {
        id: "repeated-payoff-loop",
        title: "连续章节重复同一回报机制",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "众人再次震惊，经理当众认错，所有人都不敢相信林舟的能力。",
        contextEvidence: ["前两章均采用围观质疑、展示能力、众人震惊、对手认错的结构。"],
        expectedIssues: [
          { id: "repeated-loop", category: "重复疲劳", severity: "警告", matchAny: ["震惊", "重复", "前两章"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "警告",
            category: "重复疲劳",
            message: "连续三章重复围观震惊与当众认错的回报机制",
            evidence: "众人再次震惊",
          },
        ],
      },
    },
    {
      fixture: {
        id: "clean-causal-progression",
        title: "正常推进不得误报",
        genre: "年代重生",
        stage: "开篇",
        chapterKind: "开篇",
        chapter:
          "许棠先核对供销社的进货单，再用三天做出样品。主任验收后给了她第一张正式订单。她把订单折好，决定明早去找运输队。",
        contextEvidence: ["许棠会裁缝，目标是获得第一张订单；供销社主任有权验收样品。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["能力冲突", "无因获得订单", "知识边界"],
      },
      baselineOutput: { issues: [] },
    },
    {
      fixture: {
        id: "scene-summary-dump",
        title: "概述替代关键场景",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "林舟想起了那天的争执，也想了很多以后要做的事。几天后，事情就这样过去了，他决定继续调查。",
        contextEvidence: ["本章章纲要求林舟当面向搭档说明证据并承担关系破裂的风险。"],
        expectedIssues: [
          {
            id: "skipped-scene-choice",
            category: "场景推进",
            severity: "警告",
            matchAny: ["概述", "选择", "关系", "风险"],
          },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "警告",
            category: "场景推进",
            message: "本章用概述跳过了当面说明证据、承担关系风险这一关键选择，关系位移没有被呈现。",
            evidence: "几天后，事情就这样过去了",
          },
        ],
      },
    },
    {
      fixture: {
        id: "flat-but-valid",
        title: "平淡但无硬伤的章节不得误报",
        genre: "都市脑洞",
        stage: "中期",
        chapterKind: "过渡",
        chapter:
          "林舟把录音笔收进外套内袋，沿走廊走到尽头。值班室的灯亮着，他隔着玻璃看了两分钟，确认里面只有一个人。回程路上他买了两个包子，边吃边把今天的见闻记进本子。明天还要来一次。",
        contextEvidence: ["本章为过渡章，章纲只要求确认值班室人员，不要求兑现冲突。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["平淡", "文风", "节奏缓慢", "缺少冲突", "情绪温度"],
      },
      baselineOutput: { issues: [] },
    },
    {
      fixture: {
        id: "setup-chapter-no-payoff",
        title: "蓄势章未兑现回报不得判为问题",
        genre: "玄幻/仙侠",
        stage: "扩张",
        chapterKind: "蓄势",
        chapter:
          "沈砚在丹房外站了很久，手里那封信始终没有拆。师父说过，赤炎炉的火候要等三天，他数着日子，把每一味药材都重新称了一遍。夜里他梦见炉火熄灭，醒来时天还没亮。",
        contextEvidence: ["本章章纲标注为蓄势章，回报预计在第 47 章兑现。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["回报落空", "未兑现", "缺乏回报", "没有爽点"],
      },
      baselineOutput: { issues: [] },
    },
    {
      fixture: {
        id: "observation-only-length",
        title: "字数与密度偏低只作观察",
        genre: "年代重生",
        stage: "追读",
        chapter: "许棠把最后一针收好，布料叠成方块。她数了数剩下的线，够再做两件。",
        contextEvidence: ["本章目标字数为 2200，实际偏短；无契约或事实冲突。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["字数", "篇幅", "过短", "感官密度", "具身情绪"],
      },
      baselineOutput: { issues: [] },
    },
    {
      fixture: {
        id: "apocalypse-rule-violation",
        title: "灾变规则被违反（新增题材基线）",
        genre: "科幻末世",
        stage: "追读",
        chapter: "周野在辐射区待了整整两天，没有补充抑制剂，也没有出现任何异变。",
        contextEvidence: ["灾变规则：暴露超过六小时必然出现异变，必须靠抑制剂压制。"],
        expectedIssues: [
          { id: "rule-broken", category: "设定一致性", severity: "硬性", matchAny: ["六小时", "异变", "抑制剂"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "设定一致性",
            message: "暴露超过六小时却未出现异变，违反已建立的灾变规则",
            evidence: "在辐射区待了整整两天，没有补充抑制剂，也没有出现任何异变",
          },
        ],
      },
    },
    {
      fixture: {
        id: "deduction-leap",
        title: "推理跳步（新增题材基线）",
        genre: "悬疑推理",
        stage: "扩张",
        chapter: "程夏只看了一眼鞋印，就断定凶手是住在三楼的护士。",
        contextEvidence: ["现场鞋印只有尺码信息，尚未比对人选；护士尚未进入嫌疑名单。"],
        expectedIssues: [
          { id: "evidence-leap", category: "知识边界", severity: "硬性", matchAny: ["鞋印", "尚未", "断定"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "知识边界",
            message: "仅凭鞋印尺码直接断定凶手，缺少可复核的证据链",
            evidence: "只看了一眼鞋印，就断定凶手是住在三楼的护士",
          },
        ],
      },
    },
    {
      fixture: {
        id: "short-drama-causal-hook",
        title: "短剧改编向的下一集因果有待呈现",
        genre: "都市脑洞",
        stage: "开篇",
        chapterKind: "开篇",
        chapter: "调度台多了一张纸。陈实扫了一眼，上面写着旧站的夜班时刻表。他把纸折起来。阵雨停了，天还很黑。",
        contextEvidence: [
          "篇幅形态：短剧改编向。计划对应第一集末。时刻表标着末班空车的去向，旧站明早换锁，陈实必须决定是否今晚带同事追回失踪的登记册。",
        ],
        expectedIssues: [
          { id: "unshown-next-action", category: "短剧改编向", severity: "警告", matchAny: ["行动", "登记册", "因果"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "警告",
            category: "短剧改编向",
            message: "陈实收起了时刻表，但没有用行动交代换锁和追回登记册的关系。",
            evidence: "他把纸折起来。阵雨停了，天还很黑",
          },
        ],
      },
    },
    {
      fixture: {
        id: "wanzi-short-story-ending",
        title: "万字短篇终局的支线应服从兑现",
        genre: "都市脑洞",
        stage: "收束",
        chapterKind: "高潮",
        chapter:
          "林鸢并排放好两枚印章。邻居认出领条上的缺口，撤掉了对母亲的指认。信封里又落出一张地下城地图。林鸢决定去找城主。",
        contextEvidence: [
          "篇幅形态：万字短篇。第五节兑现前文印章缺口留下的伏笔，主线承诺是替母亲澄清冤情；地下城与城主此前未建立。",
        ],
        expectedIssues: [
          { id: "late-new-mainline", category: "万字短篇", severity: "警告", matchAny: ["终局", "新主线", "城主"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "警告",
            category: "万字短篇",
            message: "印章伏笔已经兑现，去找城主的目标在终局开启了与本篇承诺无关的新主线。",
            evidence: "林鸢决定去找城主",
          },
        ],
      },
    },
    // 固定离线评测样稿及人工期望输出；不是一次真实模型效果评估。
    {
      fixture: {
        id: "continuity-partner-identity-drift",
        title: "同一值班搭档无解释换名",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "我今晚唯一的值班搭档罗修推门进来，手上还拎着昨晚那把断柄的提灯。",
        contextEvidence: ["前章：我的值班搭档唐晖昨夜拿走了那把断柄的提灯，今晚仍由我们俩值班。没有换班或改名情节。"],
        expectedIssues: [
          { id: "partner-drift", category: "事实冲突", severity: "硬性", matchAny: ["搭档", "唐晖", "罗修"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "事实冲突",
            message: "同一值班搭档从唐晖无解释变为罗修",
            evidence: "我今晚唯一的值班搭档罗修推门进来",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-explicit-narrative-person-drift",
        title: "明确第一人称约定下无说明切换第三人称",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "乔蔓拔掉读卡器。她想起自己答应过唐晖，打算先去门房找他。",
        contextEvidence: ["作者已批准乔蔓第一人称视角，前章由‘我’叙述；本章不是引语、回忆插入或约定的多视角章节。"],
        expectedIssues: [
          { id: "person-drift", category: "契约一致性", severity: "硬性", matchAny: ["第一人称", "第三人称", "视角"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "契约一致性",
            message: "明确第一人称视角无说明切成第三人称内心叙述",
            evidence: "乔蔓拔掉读卡器。她想起自己答应过唐晖",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-dead-partner-present",
        title: "已故搭档无解释现场行动",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "宋澜现在就站在机房门边，把备用钥匙塞进我手里。",
        contextEvidence: ["前章：维修员宋澜三年前去世；当前场景没有梦境、回忆、录像或复生设定。"],
        expectedIssues: [
          { id: "dead-present", category: "事实冲突", severity: "硬性", matchAny: ["宋澜", "去世", "现场"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "事实冲突",
            message: "已经去世的宋澜无解释地在现场交出钥匙",
            evidence: "宋澜现在就站在机房门边，把备用钥匙塞进我手里",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-seal-removal-denied",
        title: "剪断封条后否认已完成改动",
        genre: "都市脑洞",
        stage: "收束",
        chapter: "从我接管档案柜起，柜上的铅封一直完好，我从没剪断过封条。",
        contextEvidence: ["前章：我剪断了档案柜上的封条，把两半放进信封。从那以后没有更换封条。"],
        expectedIssues: [
          { id: "cut-denied", category: "事实冲突", severity: "硬性", matchAny: ["封条", "剪断", "否认"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "事实冲突",
            message: "本章否认前章已经剪断封条的行为",
            evidence: "柜上的铅封一直完好，我从没剪断过封条",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-same-deposit-refunded-twice",
        title: "同一笔已结清预付款再次全额退款",
        genre: "都市脑洞",
        stage: "收束",
        chapter: "我把那笔一百二十元租灯预付款重新全额退还给石骏，算是第一次结清。",
        contextEvidence: ["前章：退回石骏唯一一笔一百二十元租灯预付款，石骏签收；没有新的收款。"],
        expectedIssues: [
          { id: "duplicate-refund", category: "资源一致性", severity: "硬性", matchAny: ["预付款", "退还", "结清"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "资源一致性",
            message: "同一笔已结清的预付款再次被全额退还且声称首次结清",
            evidence: "那笔一百二十元租灯预付款重新全额退还给石骏",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-date-anchor-changed",
        title: "同一回执的既定日期被无解释改写",
        genre: "都市脑洞",
        stage: "收束",
        chapter: "那张交接回执只盖了一个日期章，显示十月十二日，从来不是九月。",
        contextEvidence: ["前章：只有一张交接回执，盖着九月十二日。交接双方核对过，回执未调换也未补盖章。"],
        expectedIssues: [
          { id: "date-drift", category: "时间线", severity: "硬性", matchAny: ["九月", "十月", "回执"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "硬性",
            category: "时间线",
            message: "同一回执的九月十二日被无解释改成十月十二日",
            evidence: "显示十月十二日，从来不是九月",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-opening-page-unpaid",
        title: "明确终章遗漏开篇失页承诺",
        genre: "都市脑洞",
        stage: "收束",
        chapterKind: "高潮",
        chapter: "交班完毕，我把椅子推回桌下。在这座车站值夜班的日子就这么结束了。",
        contextEvidence: [
          "已批准的第五节终章；开篇唯一主悬念是登记册缺失的那一页，创作契约承诺交代页上的记录及谁将它取走。",
        ],
        expectedIssues: [
          { id: "page-unpaid", category: "期待兑现", severity: "警告", matchAny: ["失页", "悬念", "终章"] },
        ],
      },
      baselineOutput: {
        issues: [
          {
            severity: "警告",
            category: "期待兑现",
            message: "终章已结束，但开篇失页的核心悬念没有兑现",
            evidence: "在这座车站值夜班的日子就这么结束了",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-repeated-principle-warning",
        title: "重复原则宣讲不升级硬性门禁",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "每次交接必须留存签名。我又读了一遍：每次交接必须留存签名。没签名就不能交接。",
        contextEvidence: ["前两章已用同样的话反复解释交接签名，本章没有新分歧或行动。"],
        expectedIssues: [{ id: "principle-loop", category: "重复疲劳", severity: "警告", matchAny: ["重复", "签名"] }],
      },
      baselineOutput: {
        issues: [
          {
            severity: "警告",
            category: "重复疲劳",
            message: "反复解释交接签名，没有推进选择或行动",
            evidence: "我又读了一遍：每次交接必须留存签名",
          },
        ],
      },
    },
    {
      fixture: {
        id: "continuity-alias-memory-and-quotation-valid",
        title: "已交代别名与回忆引语不误报身份生死视角",
        genre: "都市脑洞",
        stage: "追读",
        chapter: "唐晖的旧工牌上写着罗修。经过机房时，我想起宋澜生前常说：‘我来锁门。’那是三年前的事了。",
        contextEvidence: ["唐晖已说明罗修是自己的旧名；维修员宋澜三年前去世。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["身份冲突", "死者复活", "视角违规"],
      },
      baselineOutput: { issues: [] },
    },
    {
      fixture: {
        id: "continuity-separate-payments-and-state-change-valid",
        title: "不同款项退款与明确状态变化不误报",
        genre: "都市脑洞",
        stage: "收束",
        chapter:
          "昨天租灯预付款已退清。石骏今天另付二十元电池费，我按新回执退了这二十元。登记之后，我把剪断的封条移入证物袋。",
        contextEvidence: ["前章：租灯预付款已退；封条已经剪断，经登记可以移入证物袋。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["重复退款", "状态冲突"],
      },
      baselineOutput: { issues: [] },
    },
    {
      fixture: {
        id: "continuity-open-ending-respected",
        title: "作者约定开放结局不强制回收支线",
        genre: "都市脑洞",
        stage: "收束",
        chapter: "她交回借来的工具，把地图留在架上。她想等到换班，再决定要不要走另一条路。",
        contextEvidence: ["已批准开放结局：主线只要求归还工具；地图是未约定到期的支线，走哪条路刻意留白。"],
        expectedIssues: [],
        forbiddenIssueTerms: ["必须沿地图", "主线未兑现", "必须回收全部"],
      },
      baselineOutput: { issues: [] },
    },
  ] satisfies QualityBenchmarkCase[],
} as const;
