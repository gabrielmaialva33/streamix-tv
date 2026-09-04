/**
 * Deep merge for the device config objects.
 *
 * This exists to keep `lodash-es` off the boot path: `merge` was the only
 * lodash function the app used, and pulling it in dragged 96 modules (~62kB of
 * source) into the entry chunk that every TV parses before the first frame.
 *
 * Scope is deliberately narrow — plain objects nested a few levels deep, which
 * is all the per-device config files and `app/lightning.ts` ever merge. Arrays and
 * class/function values are replaced wholesale rather than merged element-wise.
 * That differs from lodash for arrays, so `mergeConfig.test.ts` asserts the
 * result stays identical to lodash's for the real device configs.
 */

type Plain = Record<string, unknown>;

/**
 * Config overrides are partial all the way down — `devices/tizen` supplies just
 * `lightning.rendererOptions.boundsMargin`, not a whole rendererOptions. Arrays
 * and functions are left intact so keymaps and `initialize` keep their types.
 */
export type DeepPartial<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly unknown[]
    ? T
    : T extends object
      ? { [K in keyof T]?: DeepPartial<T[K]> }
      : T;

function isPlainObject(value: unknown): value is Plain {
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function mergeInto(target: Plain, source: Plain): Plain {
  for (const key of Object.keys(source)) {
    const incoming = source[key];
    // lodash skips undefined sources so a partial override can't blank a key.
    if (incoming === undefined) continue;

    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(incoming)) {
      target[key] = mergeInto({ ...existing }, incoming);
    } else {
      target[key] = incoming;
    }
  }
  return target;
}

// The public signatures take `object`, not `Plain`: the real callers pass
// interfaces (DeviceConfig, Lightning's Config) which have no index signature.
/** Merge `sources` left to right into a fresh object; later sources win. */
export function mergeConfig<T extends object>(...sources: Array<DeepPartial<T> | undefined>): T {
  const result: Plain = {};
  for (const source of sources) {
    if (source) mergeInto(result, source as Plain);
  }
  return result as T;
}

/** Merge `source` into `target` in place, for callers holding a live object. */
export function mergeConfigInto<T extends object>(target: T, source: DeepPartial<T>): T {
  return mergeInto(target as unknown as Plain, source as Plain) as unknown as T;
}
