export const STUDIO_FORMATS = ["短剧改编向", "万字短篇"] as const;
export type StudioFormat = (typeof STUDIO_FORMATS)[number];

const formats = {
  短剧改编向: {
    description: "从脑洞展开为可改编小说。每段冲突有可见行动、代价和接得住的后果。",
    targetWords: 40_000,
    wordsPerChapter: 2000,
    narrativePerson: "第三人称限知",
    safeStockLine: 5,
  },
  万字短篇: {
    description: "按盐言故事方向构思一篇完整故事。默认一万字，五节收束。",
    targetWords: 10_000,
    wordsPerChapter: 2000,
    narrativePerson: "第一人称",
    safeStockLine: 5,
  },
} satisfies Record<
  StudioFormat,
  {
    description: string;
    targetWords: number;
    wordsPerChapter: number;
    narrativePerson: string;
    safeStockLine: number;
  }
>;

export function isStudioFormat(value?: string): value is StudioFormat {
  return STUDIO_FORMATS.some((format) => value === format);
}

export function studioFormatDefaults(format: StudioFormat) {
  const { description, ...positioning } = formats[format];
  return { description, positioning };
}
