import { describe, expect, it } from "vitest";
import {
  buildDimensionStates,
  getActiveTrialTypes,
  getBeltById,
  getNextBeltId,
  normalizeBeltId,
  normalizeGoalLevel,
  normalizeRequirements,
} from "./journeyModel";

describe("journey model helpers", () => {
  it("normalizes legacy belt and goal aliases", () => {
    expect(normalizeBeltId("Yellow Belt")).toBe("yellow");
    expect(getBeltById("not-a-belt").id).toBe("white");
    expect(getNextBeltId("yellow")).toBe("green");
    expect(normalizeGoalLevel("long_term")).toBe("vision");
    expect(normalizeGoalLevel("medium")).toBe("pillar");
    expect(normalizeGoalLevel("short")).toBe("outcome");
  });

  it("keeps trial requirement fallbacks active after extraction", () => {
    const requirements = normalizeRequirements({ reflection: { prompt: "Reflect" } }, "vision");

    expect(requirements.reflection.prompt).toBe("Reflect");
    expect(requirements.real_world.prompt).toBeTruthy();
    expect(getActiveTrialTypes(requirements)).toEqual(["reflection", "real_world", "behavioral"]);
  });

  it("builds stable dimension states from telemetry and trials", () => {
    const states = buildDimensionStates(
      [{ value: 80 }, { value: 60 }],
      [{ dimension_id: "vision", target_belt: "yellow", trial_type: "reflection", status: "passed" }],
      null,
      {},
      {}
    );

    expect(states.vision.name).toBe("Vision");
    expect(states.vision.currentBeltId).toBe("white");
    expect(states.vision.activeBeltId).toBe("white");
    expect(states.vision.completionScore).toBe(0);
    expect(states.vision.assessment).toContain("Start the White Belt trials");
  });
});
