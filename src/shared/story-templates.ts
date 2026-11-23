import { resolveCreationPreset } from "./creation-presets";
import { getFanqieCategoryProfile } from "./fanqie-taxonomy";
import type { IncubationDraft, IncubationPositioning } from "./incubation";
import { DRAMA_STORY_TEMPLATES } from "./story-template-drama";
import { FEMALE_STORY_TEMPLATES } from "./story-template-female";
import { MALE_STORY_TEMPLATES } from "./story-template-male";
import { SHORT_STORY_TEMPLATES } from "./story-template-short";
import type { StoryTemplateInput } from "./story-template-type";
import { studioFormatDefaults } from "./studio-format";
import type { CreateProjectInput, PlanningGenerationResult, StoryContract } from "./types";

export const storyTemplates = [
  ...DRAMA_STORY_TEMPLATES,
  ...SHORT_STORY_TEMPLATES,
  ...MALE_STORY_TEMPLATES,
  ...FEMALE_STORY_TEMPLATES,
];
const byId = new Map(storyTemplates.map((item) => [item.id, item]));

export function prepareStoryTemplate(edited: StoryTemplateInput, newId: () => string, now: string) {
  const template = byId.get(edited.templateId);
  const profile = template && getFanqieCategoryProfile(template.categoryKey);
  if (!template || !profile) throw new Error("找不到这套开书模板。");
  const title = edited.title?.trim() || template.title;
  const name = edited.protagonistName?.trim() || (profile.channel === "男频" ? "林舟" : "乔蔓");
  const studio = template.studio;
  const defaults = studio && studioFormatDefaults(studio.format).positioning;
  const short = studio?.format === "万字短篇";
  const targetWords = edited.targetWords ?? defaults?.targetWords ?? 300_000;
  if (title.length > 100 || name.length > 30) throw new Error("书名最多100字，主角名最多30字。");
  if (!Number.isInteger(targetWords) || targetWords < 10_000 || targetWords > 10_000_000)
    throw new Error("全书目标须在1万至1000万字之间。");
  if (short && targetWords > 20_000) throw new Error("这套五节短篇模板的目标为 1–2 万字。");
  const preset = resolveCreationPreset({ categoryKey: template.categoryKey });
  const wordsPerChapter = short
    ? Math.ceil(targetWords / 5)
    : (defaults?.wordsPerChapter ?? preset.structure.chapterWords[0]);
  const personalize = (text: string) => text.replaceAll("{{主角}}", () => name);
  const protagonist = personalize(template.protagonist);
  const lengthShape = studio?.format ?? preset.lengthShape;
  const hook = studio ? personalize(studio.hook) : undefined;
  const input: CreateProjectInput = {
    title,
    genre: profile.genre,
    lengthShape,
    secondaryGenres: [...profile.narrativeGenres],
    genreElements: [...template.tags],
    targetWords,
    wordsPerChapter,
    safeStockLine: defaults?.safeStockLine ?? 10,
    updateCadence: preset.updateCadence,
  };
  const contract: Omit<StoryContract, "version" | "approved" | "updatedAt"> = {
    premise: template.premise,
    genreSubtype: template.tags.join(" · "),
    fanqieCategoryKey: template.categoryKey,
    lengthShape,
    secondaryGenres: [...profile.narrativeGenres],
    genreElements: [...template.tags],
    audience: profile.readerAgeBand,
    commercialHook: template.premise,
    openingMechanism: hook ?? template.beats[0],
    growthCarrier: template.engine,
    primaryPayoff: template.beats[2],
    longFormEngine: template.engine,
    protagonistDesire: protagonist,
    protagonistArc: template.protagonistArc,
    keyRelationships: [template.relationship, template.secondaryRelationship],
    worldRules: [template.rule, template.secondaryRule],
    majorForces: [...template.majorForces],
    timelineAnchors: [template.beats[0], template.beats[2], template.ending],
    genreSpecificSections: [
      { label: "主角", items: [protagonist] },
      { label: "叙述视角", items: [defaults?.narrativePerson ?? preset.narrativePerson] },
      ...(studio?.format === "短剧改编向"
        ? [
            { label: "前三集改编预演", items: studio.episodes.map(personalize) },
            { label: "制作弹性与复用场地", items: [...studio.locations, studio.productionNote].map(personalize) },
          ]
        : []),
    ],
    readerPromise: template.engine,
    coreEmotion: template.tags.at(-1) ?? profile.name,
    ending: template.ending,
    immutableRules: [template.rule, template.secondaryRule],
    prohibitedPatterns: [],
  };
  const stageNames = ["事件立钩", "选择与代价", "证据换义", "行动兑现", "余波收束"];
  const longStages = [
    { title: "立住开篇", goal: template.beats[0], conflict: template.beats[1], outcome: template.beats[2] },
    { title: "主线扩展", goal: template.engine, conflict: template.conflict, outcome: template.protagonistArc },
    { title: "终局兑现", goal: template.protagonistArc, conflict: template.rule, outcome: template.ending },
  ];
  const stages = short
    ? template.beats.map((beat, index) => ({
        title: stageNames[index],
        goal: beat,
        conflict: template.conflict,
        outcome: index === 4 ? template.ending : template.beats[index + 1],
      }))
    : longStages;
  const planning: PlanningGenerationResult = {
    startChapter: 1,
    plans: stages.map((item, index) => ({
      ...item,
      id: newId(),
      kind: "宏观阶段",
      ordinal: index + 1,
      targetWords: Math.floor(targetWords / stages.length) + (index < targetWords % stages.length ? 1 : 0),
      status: "草稿",
      parentId: null,
    })),
    chapters: template.beats.map((outline, index) => ({
      id: newId(),
      number: index + 1,
      title: short ? stageNames[index] : `第${index + 1}章`,
      outline: personalize(outline),
      content: "",
      wordCount: 0,
      status: "章纲",
      batchMode: short || index < 3 ? "逐章" : "五章批次",
      isKeyChapter: index < 3,
      targetWords: short ? Math.floor(targetWords / 5) + (index < targetWords % 5 ? 1 : 0) : wordsPerChapter,
      revision: 0,
      updatedAt: now,
    })),
  };
  const positioning: IncubationPositioning = {
    genre: profile.genre,
    fanqieCategoryKey: template.categoryKey,
    subGenreIds: [],
    openingArchetype: preset.openingArchetypes[0],
    lengthShape,
    narrativePerson: defaults?.narrativePerson ?? preset.narrativePerson,
    protagonistRoles: preset.protagonistRoles,
    toneTags: preset.toneTags,
    secondaryGenres: [...profile.narrativeGenres],
    genreElements: [...template.tags],
    customGenreDirection: "",
    targetWords,
    wordsPerChapter,
    updateCadence: preset.updateCadence,
    safeStockLine: input.safeStockLine ?? 10,
    readerPersona: profile.readerAgeBand,
    readerPromise: template.engine,
    commercialBoundary: "保留原创表达，允许更换职业、矛盾和叙事结构。",
  };
  const seed = [
    template.premise,
    protagonist,
    template.conflict,
    template.rule,
    template.secondaryRule,
    template.engine,
    template.ending,
    ...(hook ? [`开页钩子：${hook}`] : []),
  ].join("\n");
  return { input, contract, planning, positioning, seed };
}

export function draftVariantsFromTemplate(
  input: StoryTemplateInput,
  newId: () => string,
  now: string,
): IncubationDraft {
  const prepared = prepareStoryTemplate(input, newId, now);
  return {
    id: newId(),
    status: "孵化中",
    step: "定位",
    path: "定向",
    positioning: prepared.positioning,
    evidence: { insightIds: [], marketOpportunityKeys: [], categoryTags: [], skipped: true },
    seed: `基于以下方向构思两个独立的新版本，改变关键矛盾与主角行动路径。\n${prepared.seed}`,
    candidates: [],
    selectedCandidateId: null,
    skeleton: null,
    review: { acknowledged: [] },
    createdProjectId: null,
    createdAt: now,
    updatedAt: now,
  };
}
