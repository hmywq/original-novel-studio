export interface StoryTemplateSeed {
  id: string;
  categoryKey: string;
  title: string;
  tags: readonly string[];
  premise: string;
  protagonist: string;
  protagonistArc: string;
  conflict: string;
  relationship: string;
  secondaryRelationship: string;
  rule: string;
  secondaryRule: string;
  majorForces: readonly [string, string];
  engine: string;
  ending: string;
  beats: readonly [string, string, string, string, string];
  studio?:
    | { format: "万字短篇"; hook: string }
    | {
        format: "短剧改编向";
        hook: string;
        locations: readonly [string, string, string];
        episodes: readonly [string, string, string];
        productionNote: string;
      };
}

export interface StoryTemplateInput {
  templateId: string;
  title?: string;
  protagonistName?: string;
  targetWords?: number;
}
