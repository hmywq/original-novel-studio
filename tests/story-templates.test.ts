import { expect, it } from "vitest";
import { validateIpcArgs } from "../electron/ipc-validation";
import { missingContractApprovalFields } from "../src/shared/contract-service";
import { getFanqieCategoryProfile } from "../src/shared/fanqie-taxonomy";
import { draftVariantsFromTemplate, prepareStoryTemplate, storyTemplates } from "../src/shared/story-templates";

it("提供覆盖不同频道与题材的完整成品，每套都有五章独立细纲", () => {
  expect(storyTemplates.length).toBeGreaterThanOrEqual(36);
  expect(new Set(storyTemplates.map((item) => item.id)).size).toBe(storyTemplates.length);
  expect(new Set(storyTemplates.map((item) => item.categoryKey)).size).toBeGreaterThanOrEqual(16);
  for (const item of storyTemplates) {
    expect(getFanqieCategoryProfile(item.categoryKey)).toBeDefined();
    expect(item.protagonist).toContain("{{主角}}");
    expect(new Set(item.beats).size).toBe(5);
    expect(item.premise.length + item.engine.length + item.ending.length).toBeGreaterThan(60);
    const { contract } = prepareStoryTemplate({ templateId: item.id }, () => "unused", "2026-11-18T12:00:00Z");
    expect(missingContractApprovalFields({ ...contract, approved: false, version: 1, updatedAt: "" })).toEqual([]);
    expect(new Set(contract.keyRelationships).size).toBe(2);
    expect(new Set(contract.worldRules).size).toBe(2);
    expect(new Set(contract.majorForces).size).toBe(2);
  }
});

it("套用时保存作者变量、三段长线和五章草稿，不预先审批或声称已有正文", () => {
  let id = 0;
  const result = prepareStoryTemplate(
    { templateId: "m-tomorrow-lost", title: "失物室测试", protagonistName: "陈弦", targetWords: 600000 },
    () => String(++id),
    "2026-11-18T12:00:00Z",
  );
  expect(result.input.title).toBe("失物室测试");
  expect(result.input.targetWords).toBe(600000);
  expect(result.contract.genreSpecificSections?.[0].items[0]).toContain("陈弦");
  expect(JSON.stringify(result)).not.toContain("{{主角}}");
  expect(result.planning.plans.filter((p) => p.kind === "宏观阶段")).toHaveLength(3);
  expect(result.planning.plans.every((p) => p.status === "草稿")).toBe(true);
  expect(result.planning.chapters.map((chapter) => chapter.number)).toEqual([1, 2, 3, 4, 5]);
  expect(result.planning.chapters.every((chapter) => chapter.content === "" && chapter.status === "章纲")).toBe(true);
});

it("拒绝不存在的模板，防止创建无内容作品", () => {
  expect(() => prepareStoryTemplate({ templateId: "bogus" }, () => "id", "now")).toThrow(/模板/);
});

it("公开短篇样例的开篇动作在第一节保持连续，并保留叙述视角", () => {
  const result = prepareStoryTemplate({ templateId: "s-demo-seed-ledger" }, () => "id", "now");
  expect(result.contract.openingMechanism).toContain("我剪开了封签");
  expect(result.planning.chapters[0].outline).toContain("已剪开的袋口");
  expect(result.planning.chapters[0].outline).toContain("暂扣剩下的种袋");
  expect(result.contract.genreSpecificSections?.find((section) => section.label === "叙述视角")?.items).toEqual([
    result.positioning.narrativePerson,
  ]);
});

it("从模板展开的立项草稿可以通过桌面保存校验", () => {
  let id = 0;
  const draft = draftVariantsFromTemplate(
    { templateId: "m-tomorrow-lost", title: "失物室测试", targetWords: 600_000 },
    () => `draft-${++id}`,
    "2026-11-18T12:00:00.000Z",
  );

  expect(validateIpcArgs("saveIncubation", [draft])).toEqual([draft]);
  expect(draft.positioning.targetWords).toBe(600_000);
});

it("短剧模板保留前三集预演与制作弹性，盐言模板落下五节总预算", () => {
  let id = 0;
  for (const format of ["短剧改编向", "万字短篇"] as const) {
    const templates = storyTemplates.filter((item) => item.studio?.format === format);
    expect(templates.length).toBeGreaterThanOrEqual(6);
    for (const item of templates) {
      const result = prepareStoryTemplate({ templateId: item.id }, () => String(++id), "2026-11-18T12:00:00Z");
      expect(result.contract.lengthShape).toBe(format);
      expect(result.contract.openingMechanism).toBeTruthy();
      if (format === "短剧改编向") {
        expect(result.input.targetWords).toBe(40_000);
        expect(
          result.contract.genreSpecificSections?.find((section) => section.label === "前三集改编预演")?.items,
        ).toHaveLength(3);
      } else {
        expect(result.input.targetWords).toBe(10_000);
        expect(result.planning.chapters.map((chapter) => chapter.title)).toEqual([
          "事件立钩",
          "选择与代价",
          "证据换义",
          "行动兑现",
          "余波收束",
        ]);
        expect(result.planning.chapters.reduce((sum, chapter) => sum + (chapter.targetWords ?? 0), 0)).toBe(10_000);
      }
    }
  }
});
