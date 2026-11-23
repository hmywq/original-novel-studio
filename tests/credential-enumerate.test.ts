import { describe, expect, it } from "vitest";
import { parseAiProfileCredentialTargets } from "../electron/credential-store";

describe("凭据列举解析", () => {
  it("只识别原创工作台来源凭据", () => {
    const output = [
      "cn.local.original.novelstudio/ai/profile-a",
      "cn.local.original.novelstudio/model-api",
      "cn.local.original.novelstudio/ai/profile-b",
      "cn.local.fanqie.novelstudio/ai/upstream-profile",
      "",
      "  cn.local.original.novelstudio/ai/profile-c  ",
    ].join("\r\n");
    expect(parseAiProfileCredentialTargets(output)).toEqual(["profile-a", "profile-b", "profile-c"]);
  });

  it("空输出返回空数组", () => {
    expect(parseAiProfileCredentialTargets("")).toEqual([]);
  });
});
