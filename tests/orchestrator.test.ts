import { describe, expect, it } from "vitest";

import { parseAgentJson, parseAgentObject, parseScoreData } from "../src/orchestrator.js";

describe("agent JSON parsing", () => {
  it("parses clean JSON", () => {
    expect(parseAgentJson("test", '{"ok":true}')).toEqual({ ok: true });
  });

  it("extracts JSON from surrounding text", () => {
    expect(parseAgentObject("test", 'prefix {"ok":true} suffix')).toEqual({
      ok: true
    });
  });

  it("rejects non-object values where an object is required", () => {
    expect(() => parseAgentObject("test", '["nope"]')).toThrow(
      "test returned array, expected object"
    );
  });

  it("rejects invalid scoring payloads", () => {
    expect(() =>
      parseScoreData('{"score":"bad","confidence":"high","key_evidence":[]}')
    ).toThrow("scoring returned invalid score");
    expect(() =>
      parseScoreData('{"score":7,"confidence":"certain","key_evidence":[]}')
    ).toThrow("scoring returned invalid confidence");
  });
});
