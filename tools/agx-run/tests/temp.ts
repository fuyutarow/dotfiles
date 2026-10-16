import { expect } from "bun:test";
import { existsSync } from "node:fs";

export function createTempTracker() {
  const created = new Set<string>();
  return {
    register: (path: string): string => {
      created.add(path);
      return path;
    },
    assertRemoved: () => {
      expect([...created].filter((path) => existsSync(path))).toEqual([]);
    },
  };
}
