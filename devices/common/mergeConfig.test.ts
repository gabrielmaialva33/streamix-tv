import { merge } from "lodash-es";
import { describe, expect, it } from "vitest";
import { mergeConfig, mergeConfigInto } from "./mergeConfig";

/**
 * `mergeConfig` replaced lodash's `merge` to keep 96 lodash modules off the
 * boot chunk. These tests pin the behaviour that swap depends on: for the
 * shapes the device configs actually use, the two must agree exactly.
 */
describe("mergeConfig vs lodash merge", () => {
  const cases: Array<{ name: string; sources: Array<Record<string, unknown>> }> = [
    {
      name: "nested renderer options, the shape devices/*/index.ts merges",
      sources: [
        {
          name: "common",
          lightning: {
            fontSettings: { fontFamily: "NotoSans", fontSize: 40 },
            rendererOptions: {
              appWidth: 1920,
              numImageWorkers: 0,
              textureMemory: { criticalThreshold: 180e6, debugLogging: false },
            },
          },
        },
        {
          name: "tizen",
          lightning: {
            rendererOptions: {
              boundsMargin: 560,
              textureMemory: { criticalThreshold: 80e6, doNotExceedCriticalThreshold: true },
            },
          },
        },
      ],
    },
    {
      name: "scalar overriding an array (tizen Back: 10009 over ['b', 66])",
      sources: [{ keys: { Back: ["b", 66], Left: ["ArrowLeft", 37] } }, { keys: { Back: 10009, Left: 37 } }],
    },
    {
      name: "array overriding an array (firetv Back: [27, 8, 166])",
      sources: [{ keys: { Back: ["b", 66] } }, { keys: { Back: [27, 8, 166] } }],
    },
    {
      name: "undefined source values must not blank an existing key",
      sources: [{ a: 1, b: 2 }, { b: undefined }],
    },
    {
      name: "three sources, later wins",
      sources: [{ a: { x: 1, y: 2 } }, { a: { y: 3 } }, { a: { z: 4 } }],
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const mine = mergeConfig(...testCase.sources);
      const theirs = merge({}, ...testCase.sources.map(source => structuredClone(source)));
      expect(mine).toEqual(theirs);
    });
  }
});

describe("mergeConfig", () => {
  it("does not mutate its sources", () => {
    const base = { lightning: { rendererOptions: { appWidth: 1920 } } };
    const override = { lightning: { rendererOptions: { appWidth: 1280 } } };
    mergeConfig(base, override);
    expect(base.lightning.rendererOptions.appWidth).toBe(1920);
  });

  it("replaces arrays wholesale instead of merging element-wise", () => {
    // The documented divergence from lodash. Element-wise merging would leave
    // a stale trailing element behind, which for a keymap means a phantom key.
    expect(mergeConfig({ keys: [1, 2, 3] }, { keys: [9] })).toEqual({ keys: [9] });
  });

  it("mergeConfigInto mutates the target, for live config objects", () => {
    const target = { lightning: { debug: false, fontSize: 40 } };
    mergeConfigInto(target, { lightning: { debug: true } });
    expect(target.lightning).toEqual({ debug: true, fontSize: 40 });
  });
});
