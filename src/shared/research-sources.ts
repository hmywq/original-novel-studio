export interface ResearchPlatform {
  id: string;
  name: string;
  url: string;
  description: string;
  keywords: readonly string[];
}

export interface ResearchLead {
  id: string;
  platformId: string;
  title: string;
  author?: string;
  url: string;
  note: string;
  tags: readonly string[];
  kind: string;
}

export const RESEARCH_PLATFORMS: readonly ResearchPlatform[] = [
  {
    id: "fanqie",
    name: "番茄小说",
    url: "https://fanqienovel.com/rank/",
    description: "看阅读榜、新书榜和作家专区。记录具体分类与观测日，也可从改编编辑推荐倒查原著。",
    keywords: ["短故事", "改编风向标", "现言脑洞", "都市日常", "年代经营"],
  },
  {
    id: "qidian",
    name: "起点中文网",
    url: "https://www.qidian.com/",
    description:
      "首页有月票、追读、留存、潜力等榜单入口。借书页核对题材和连载状态，用于观察长线故事如何持续产生新问题。",
    keywords: ["脑洞", "年代", "职业流", "城市悬疑", "时空穿梭"],
  },
  {
    id: "yanyan",
    name: "盐言故事",
    url: "https://soia.zhihu.com/",
    description:
      "官网提供 App 入口。网页版可看官方圆桌、版权合作介绍和作者入口，具体作品的可读范围随账号和版权而变化。",
    keywords: ["短篇故事影响力榜", "轻悬疑", "家庭关系", "第一人称", "证据反转"],
  },
  {
    id: "douyin",
    name: "抖音",
    url: "https://www.douyin.com/",
    description: "观察短剧、短视频和公开话题。网页视频依赖动态加载，可在官方客户端按关键词继续查看。",
    keywords: ["真人短剧", "现实题材", "社区生活", "职业观察"],
  },
  {
    id: "xiaohongshu",
    name: "小红书",
    url: "https://www.xiaohongshu.com/explore",
    description: "从生活场景、日常烦恼和兴趣话题找灵感。需要登录的内容可在官方网页或客户端查看。",
    keywords: ["生活观察", "社区日常", "职场观察", "红镜短剧计划"],
  },
  {
    id: "jinjiang",
    name: "晋江文学城",
    url: "https://www.jjwxc.net/channeltopten.php?channelid=117",
    description: "中短篇频道有月度排行，可查完结字数、关系类型与作品积分。",
    keywords: ["言情", "纯爱", "百合", "无CP", "完结"],
  },
  {
    id: "douban",
    name: "豆瓣阅读",
    url: "https://read.douban.com/essays/",
    description: "短篇频道可看新作与编辑推荐，适合观察现实生活、家庭、职业与悬疑。",
    keywords: ["短篇", "现实生活", "家庭", "编辑推荐"],
  },
  {
    id: "hongguo",
    name: "红果短剧",
    url: "https://www.shortdramas.com/",
    description: "看短剧创作者中心与分赛道征集，核对剧本要求和改编项目。",
    keywords: ["真人短剧", "改编", "拍摄", "剧本征集"],
  },
];

export const RESEARCH_LEADS: readonly ResearchLead[] = [
  {
    id: "jinjiang-short-month",
    platformId: "jinjiang",
    title: "晋江中短篇月度排行榜",
    url: "https://www.jjwxc.net/channeltopten.php?channelid=117",
    note: "2026-11-18 可查看页中有言情、纯爱、百合和无CP。作品积分是晋江站内指标。",
    tags: ["中短篇", "月榜", "言情", "纯爱", "无CP"],
    kind: "榜单入口",
  },
  {
    id: "jinjiang-short-4676050",
    platformId: "jinjiang",
    title: "[公路]逃婚的我,找的保镖竟是婚约对象",
    author: "神俏",
    url: "https://www.jjwxc.net/onebook.php?novelid=4676050",
    note: "站内完结言情，作品页显示 20,612 字。可观察同一组角色怎样在既有成见上产生新判断。",
    tags: ["言情", "身份差", "公路", "完结"],
    kind: "书目来源",
  },
  {
    id: "jinjiang-short-11113902",
    platformId: "jinjiang",
    title: "一个香港男人的三段情史",
    author: "一海橙子",
    url: "https://www.jjwxc.net/onebook.php?novelid=11113902",
    note: "站内完结纯爱，榜单显示 15,980 字。用于比较短篇内关系线和时段组织。",
    tags: ["纯爱", "关系", "完结"],
    kind: "书目来源",
  },
  {
    id: "douban-short-front",
    platformId: "douban",
    title: "豆瓣阅读短篇频道",
    url: "https://read.douban.com/essays/",
    note: "可查看最新发布和平台推荐。两种书单分别记录，最新发布页显示的互动不能代表长周期热度。",
    tags: ["短篇", "现实生活", "编辑推荐"],
    kind: "作品入口",
  },
  {
    id: "hongguo-studio",
    platformId: "hongguo",
    title: "短剧创作者中心",
    url: "https://www.shortdramas.com/",
    note: "官方公开主页说明编剧可选 IP、投稿剧本。具体投稿和合作信息在账号后台查看。",
    tags: ["真人短剧", "剧本征集", "改编"],
    kind: "改编入口",
  },
  {
    id: "hongguo-caixin",
    platformId: "hongguo",
    title: "财新 × 红果现实题材剧本共创计划",
    url: "https://video.caixin.com/shortdramas/",
    note: "项目公开材料可参考分集结构与现实题材方向。活动要求人工编剧，限制以 AI 为主要创作手段。",
    tags: ["真人短剧", "现实题材", "分集"],
    kind: "征稿与改编",
  },
  {
    id: "fanqie-ranking",
    platformId: "fanqie",
    title: "番茄小说官方排行榜",
    url: "https://fanqienovel.com/rank/",
    note: "官方页面可核对分区和榜单口径。2026-11-18 所见统计截止到 11-17 24:00。阅读榜与新书榜按不同篇幅口径分开记录。",
    tags: ["榜单", "新书", "在读"],
    kind: "榜单入口",
  },
  {
    id: "fanqie-adaptation-20261116",
    platformId: "fanqie",
    title: "改编风向标｜CP拉扯×人设反差",
    url: "https://fanqienovel.com/writer/zone/article/7708711073439825945",
    note: "2026-11-16 的平台编辑观察，分列真人短剧和漫剧。可抽象关系如何递进、反差如何由行动展示。样本只代表该期编辑选例。",
    tags: ["短剧改编", "人设反差", "关系拉扯", "年代经营"],
    kind: "编辑动向",
  },
  {
    id: "fanqie-echo-3",
    platformId: "fanqie",
    title: "番茄短故事「IP回响计划」第三期",
    url: "https://fanqienovel.com/writer/zone/article/7690521379786997822",
    note: "2026-10-29 公告。番茄筛选原创短故事，入选作品可进入真人短剧改编评估。活动窗口、签约与具体题材以公告为准。",
    tags: ["短故事", "真人改编", "IP"],
    kind: "征稿与改编",
  },
  {
    id: "qidian-home-charts",
    platformId: "qidian",
    title: "起点首页的追读、留存和月票入口",
    url: "https://www.qidian.com/",
    note: "公开首页可核对这些榜型和示例书目。完整排行页是动态页面，具体实时位置在原站查看。每种榜型各记自己的数据。",
    tags: ["追读", "留存", "月票"],
    kind: "榜单入口",
  },
  {
    id: "qidian-1984-sichuan",
    platformId: "qidian",
    title: "《1984：从川菜馆开始》",
    url: "https://book.qidian.com/honor/1044818845/",
    note: "可核对的起点荣誉记录显示它获得 2026 年 10 月男频月票榜第七。可抽象练习如何让地方生活、职业手艺与一处固定空间持续发生人物选择。",
    tags: ["年代", "职业流", "地方生活"],
    kind: "书目来源",
  },
  {
    id: "qidian-new-speculative",
    platformId: "qidian",
    title: "起点用户书单里的《异度旅社》",
    url: "https://book.qidian.com/booklist/detail/565573/",
    note: "书单显示 2026-11-18 更新，并列出《异度旅社》及其科幻时空穿梭分类。练习把日常场所改造成有行动代价的故事入口。该书单由站内用户维护。",
    tags: ["科幻", "异空间", "日常异常"],
    kind: "书目来源",
  },
  {
    id: "yanyan-2026-short-influence",
    platformId: "yanyan",
    title: "2026 短篇故事影响力榜",
    url: "https://www.zhihu.com/roundtable/2026duanpiangushiyingxianglibang",
    note: "知乎公开圆桌可核对盐言故事档案局等主办信息。这是年度短篇活动专题，具体入选与获奖作品以活动更新为准。",
    tags: ["盐言短篇", "原创IP", "年度专题"],
    kind: "官方专题",
  },
  {
    id: "yanyan-ip",
    platformId: "yanyan",
    title: "盐珍阁版权合作",
    url: "https://ip.zhihu.com/fiore/copyright/transactions-platform",
    note: "知乎旗下盐言故事版权交易平台。公开页可核对机构和入口，具体作品授权范围与合作条件看平台合同。",
    tags: ["盐言", "版权", "改编"],
    kind: "版权入口",
  },
  {
    id: "yanyan-author",
    platformId: "yanyan",
    title: "盐言故事内容合作平台",
    url: "https://cp.zhihu.com/",
    note: "官方页面可见登录入口。已登录作者能看到的投稿字数、完稿格式和 AI 相关条款留给实际投稿入口核对。",
    tags: ["投稿", "短篇", "作者端"],
    kind: "作者入口",
  },
  {
    id: "douyin-hot-words",
    platformId: "douyin",
    title: "抖音开放平台实时热点词文档",
    url: "https://open.douyin.com/platform/resource/docs/openapi/data-open-service/hot-video-data/get-current-hot-words/",
    note: "官方热点词端点需要应用申请 hotsearch 权限。影视综榜单另有权限。若自行取得授权，可以把有权使用的数据整理为本地 CSV。",
    tags: ["热点词", "开放平台", "授权"],
    kind: "官方数据说明",
  },
  {
    id: "xiaohongshu-hot-guide",
    platformId: "xiaohongshu",
    title: "小红书官方热点榜单说明",
    url: "https://fe.xiaohongshu.com/ditto/vincent/c45978d1a53d4dec963167ebd6f1802e?fullscreen=true&naviHidden=yes",
    note: "公开说明列出真实生活分享和品类趋势等选取范围，并提示展示可能随刷新和用户变化。记录观察日期和所见口径。",
    tags: ["生活观察", "热点", "规则"],
    kind: "官方数据说明",
  },
  {
    id: "xiaohongshu-first-red-series",
    platformId: "xiaohongshu",
    title: "FIRST × 小红书红镜短剧计划",
    url: "https://www.firstfilm.org.cn/surprise/fantasticredmirronshort/",
    note: "2025 年联合活动由主办方公开，可看竖屏高概念项目与剧本赛道。活动的时长规格仅适用于该活动，可借鉴选题如何把生活观点拍出来。",
    tags: ["高概念", "竖屏", "短剧"],
    kind: "征稿与改编",
  },
];
