import { append, read } from "./log.ts";
import { live, leases as foldLeases, runs } from "./fold.ts";
import type { Observer } from "./observe.ts";

export type CoreCli = {
  dir: string;
  observer: Observer;
  print: (line: string) => void;
};
const emit = (cli: CoreCli, value: unknown) => {
  cli.print(JSON.stringify(value));
};

export function ls(cli: CoreCli): void {
  for (const run of runs(read(cli.dir).events, cli.observer)) emit(cli, run);
}
export function show(cli: CoreCli, run_id: string): void {
  emit(
    cli,
    runs(read(cli.dir).events, cli.observer).find(
      (run) => run.run_id === run_id,
    ) ?? null,
  );
}
export function leases(cli: CoreCli): void {
  for (const lease of foldLeases(read(cli.dir).events, cli.observer))
    emit(cli, lease);
}
export function judge(
  cli: CoreCli,
  run_id: string,
  decision: string,
  note?: string,
  refs?: string[],
): void {
  const result = append(cli.dir, {
    type: "judged",
    run_id,
    decision,
    ...(note === undefined ? {} : { note }),
    ...(refs === undefined ? {} : { refs }),
  });
  emit(cli, result);
}
export function abandon(cli: CoreCli, run_id: string): void {
  const result = append(cli.dir, {
    type: "terminal",
    run_id,
    outcome: "abandoned",
  });
  emit(cli, result);
}

export const liveRuns = (cli: CoreCli) =>
  live(read(cli.dir).events, cli.observer);
