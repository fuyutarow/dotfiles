import type { ProfileStep } from "./profiles.ts";

export interface Adapter {
  probe(step: ProfileStep): string;
  action(step: ProfileStep): string;
}

export const noOpAdapter: Adapter = {
  probe(step) {
    return `NOOP probe ${step.probe}`;
  },
  action(step) {
    return `NOOP action ${step.action}`;
  },
};

export const dryRunAdapter: Adapter = {
  probe(step) {
    return `DRY-RUN probe ${step.probe}`;
  },
  action(step) {
    return `DRY-RUN action ${step.action}`;
  },
};
