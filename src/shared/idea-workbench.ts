import { resolveCreationPreset } from "./creation-presets";
import { getFanqieCategoryProfile } from "./fanqie-taxonomy";
import type { IdeaRecord, IncubationDraft } from "./incubation";
import { type StudioFormat, studioFormatDefaults } from "./studio-format";

export interface IdeaStarter {
  title: string;
  original: string;
  keep?: string;
  source: IdeaRecord["source"];
  reference?: string;
  referenceUrl?: string;
  insightIds?: readonly string[];
  tags: readonly string[];
}

export const ideaStarters: readonly IdeaStarter[] = [
  {
    title: "社区菜园的第二把钥匙",
    original: "下班后我发现公共菜园的工具柜还没关，借用登记上有两把钥匙，今天只有一人来签过字。",
    keep: "让登记表和真正的借用人同时进入场景。",
    source: "发散练习",
    reference: "公开版演示素材。",
    tags: ["社区", "物证", "日常悬疑"],
  },
  {
    title: "展览清单多一张椅子",
    original: "布展结束那天，库管让我报废一把清单上多出的椅子。借用单上却写着，开馆后每天都有人来坐。",
    keep: "用能被查到的第二份记录推进。",
    source: "发散练习",
    tags: ["职业流", "日常", "记录"],
  },
  {
    title: "归档以后不能撤回",
    original:
      "社区里一台用于迁移旧电脑的工具把明天才会签的调解单提前找了出来。我的名字在见证栏，调解内容却是把我母亲赶出家门。",
    source: "发散练习",
    tags: ["家庭关系", "AI", "时间差", "悬疑"],
  },
  {
    title: "把能力交给对手",
    original:
      "我能听见老照片拍下前的十秒钟。申请把家庭照用作证据那天，对方拿出更早的一张，要求我先听完自己开口说过的话。",
    source: "发散练习",
    tags: ["家庭关系", "异能", "物证", "反转"],
  },
  {
    title: "把职业规则当成障碍",
    original: "过秤员发现同一户人家今天交了两次救济粮。有人求她改一个数字，她必须在记录作废前找到没到场的领粮人。",
    source: "发散练习",
    tags: ["职业流", "家常", "物证"],
  },
  {
    title: "让一份利益出现两个主人",
    original: "办丧事的收据写了两个付款人，我可以用它领回一间房的押金。另一个付款人赶来，只求我先别退那只没还的锅。",
    source: "发散练习",
    tags: ["家庭关系", "日常悬疑", "小人物"],
  },
  {
    title: "在地方生活中找新局面",
    original:
      "搬迁前最后一场夜市，有人把失传的面点配方贴在旧摊位背面。开摊的人都认识那笔字，谁也不肯承认写字的人是自己的家人。",
    source: "发散练习",
    tags: ["返乡", "经营", "家族旧账"],
  },
  {
    title: "只保留一个异常",
    original:
      "我回到自己离家那天，公交卡里每刷掉一次余额就会多出别人记得的一句道歉。卡还有最后一次，我得决定先向谁问话。",
    source: "发散练习",
    tags: ["重生", "情感", "倒计时", "具象代价"],
  },
];

export const marketIdeaStarters: readonly IdeaStarter[] = [
  {
    title: "职场与婚恋都落在一张交接单上",
    original:
      "正式离职的那天，我去归还工牌。接手我项目的人是结婚前突然走掉的搭档，而他只肯把出问题的客户名单，当着我从前带的实习生给我。",
    source: "市场线索",
    reference: "2026-11-16｜番茄改编风向标：女频真人案例涵盖职场婚恋、破镜重圆和人物反差。这里是原创发散题。",
    referenceUrl: "https://fanqienovel.com/writer/zone/article/7708711073439825945",
    tags: ["职场", "破镜重圆", "身份反差", "女性成长"],
  },
  {
    title: "家里谁能证明她来过",
    original:
      "老屋要交割了，我在外婆最后一本水表抄数本上发现了自己的字。那一页的日期，我记得自己正在另一个城市等一份重要的面试结果。",
    source: "市场线索",
    reference: "2026-03-16｜《文艺报》梳理盐言的女性言情与现实悬疑。试把家庭关系和物证推进合在一起。",
    referenceUrl: "https://wyb.chinawriter.com.cn/Pad/content/202603/16/content83120.html",
    tags: ["现实悬疑", "女性成长", "家庭关系", "物证"],
  },
  {
    title: "她把收购信送错了车间",
    original:
      "重回乡厂倒闭前一天的女儿要买下厂里剩的机器。她找遍账册只见到母亲替她交过的一笔担保，唯一知道本金去向的人正在装车离开。",
    source: "市场线索",
    reference: "2026-11-16｜番茄改编风向标的重生、年代经营方向。例题加入两代家庭的立场差。",
    referenceUrl: "https://fanqienovel.com/writer/zone/article/7708711073439825945",
    tags: ["重生", "年代", "经营", "家庭关系"],
  },
  {
    title: "第二版接驳图",
    original: "便利店门上贴着两张接驳图。值夜班的店员认出了其中一张上的手写标记，那是她每天替乘客指路时画的。",
    source: "市场线索",
    reference: "公开版演示素材，用于练习从现实职业中找公开可核查的细节。",
    tags: ["现实题材", "职业流", "社区"],
  },
  {
    title: "两份轮班表",
    original: "剧场调度员收到不同时间发出的两份轮班表。她要在开场前弄清，谁已经按旧表离开。",
    source: "市场线索",
    reference: "公开版演示素材，用于练习用期限和物证推进。",
    tags: ["倒计时", "职场", "证据"],
  },
];

export function ideaReferenceUrl(value?: string) {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if ((url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password) return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

export function startIdeaDraft(
  input: {
    title: string;
    original: string;
    keep: string;
    source: IdeaRecord["source"];
    reference: string;
    referenceUrl?: string;
    parentId?: string;
    insightIds?: readonly string[];
    tags: readonly string[];
    format: StudioFormat;
    categoryKey: string;
  },
  id: string,
  now: string,
): IncubationDraft {
  if (!input.original.trim()) throw new Error("先记一句你的脑洞。");
  const category = getFanqieCategoryProfile(input.categoryKey);
  if (!category) throw new Error("请选择要尝试的题材。");
  const defaults = studioFormatDefaults(input.format).positioning;
  const preset = resolveCreationPreset({ categoryKey: category.key });
  const original = input.original.trim().slice(0, 1600);
  const title = input.title.trim().slice(0, 80) || original.replace(/\s+/g, " ").slice(0, 28);
  const keep = input.keep.trim().slice(0, 600);
  const tags = Array.from(new Set(input.tags.map((tag) => tag.trim().slice(0, 24)).filter(Boolean))).slice(0, 6);
  return {
    id,
    status: "孵化中",
    step: "定位",
    path: "探索",
    idea: {
      title,
      original,
      keep,
      source: input.source,
      reference: input.reference.trim().slice(0, 600),
      tags,
      referenceUrl: ideaReferenceUrl(input.referenceUrl),
      parentId: input.parentId,
    },
    positioning: {
      genre: category.genre,
      fanqieCategoryKey: category.key,
      subGenreIds: [],
      openingArchetype: preset.openingArchetypes[0],
      lengthShape: input.format,
      ...defaults,
      protagonistRoles: preset.protagonistRoles,
      toneTags: preset.toneTags,
      secondaryGenres: category.narrativeGenres,
      genreElements: tags,
      customGenreDirection: "",
      updateCadence: "每日 2 章",
      readerPersona: category.readerAgeBand,
      readerPromise: "",
      commercialBoundary: keep,
    },
    evidence: {
      insightIds: [...(input.insightIds ?? [])],
      marketOpportunityKeys: [],
      categoryTags: [],
      skipped: !input.insightIds?.length,
    },
    seed: original,
    candidates: [],
    selectedCandidateId: null,
    skeleton: null,
    review: { acknowledged: [] },
    createdProjectId: null,
    createdAt: now,
    updatedAt: now,
  };
}
