import { jsonOf, z } from "../../shared/src/zod.ts";
import { fromThrowable } from "neverthrow";

const RunSchema = z.looseObject({
  kind: z.literal("run"),
  host: z.string().optional(),
  started_at: z.string().optional(),
  pick: z.looseObject({ source: z.string().optional(), choice: z.string() }),
  route: z.enum(["codex", "claude"]).optional(),
  stats: z
    .looseObject({
      row: z.string().optional(),
      route: z.enum(["codex", "claude"]).optional(),
    })
    .optional(),
});

export type DispatchStatsInput = Readonly<{
  log: string;
  now: number;
}>;

type Bucket = {
  picks: number;
  by_route: Record<"codex" | "claude", number>;
  by_row: Record<string, number>;
};

const SOURCES = ["jev", "default", "resume"] as const;
const WINDOWS = { "24h": 24 * 60 * 60 * 1000, "7d": 7 * 24 * 60 * 60 * 1000 };

function bucket(): Bucket {
  return { picks: 0, by_route: { codex: 0, claude: 0 }, by_row: {} };
}

export function dispatchStats({ log, now }: DispatchStatsInput) {
  const runs = log
    .split("\n")
    .filter((line) => line !== "")
    .flatMap((line) => {
      const parsed = jsonOf(RunSchema).safeParse(line);
      if (!parsed.success) return [];
      const started = parsed.data.started_at;
      const parsedAt =
        started === undefined
          ? undefined
          : fromThrowable(
              () => Temporal.Instant.from(started).epochMilliseconds,
              (error) => error,
            )();
      const at = parsedAt?.isOk() === true ? parsedAt.value : Number.NaN;
      const route = parsed.data.route ?? parsed.data.stats?.route;
      const row = parsed.data.stats?.row ?? parsed.data.pick.choice;
      if (!Number.isFinite(at) || route === undefined || row === undefined)
        return [];
      return [
        { ...parsed.data, at, route, row, host: parsed.data.host ?? "unknown" },
      ];
    });
  const hosts = [...new Set(runs.map((run) => run.host))].toSorted();
  return Object.fromEntries(
    hosts.map((host) => [
      host,
      Object.fromEntries(
        Object.entries(WINDOWS).map(([window, duration]) => {
          const within = runs.filter(
            (run) =>
              run.host === host && run.at >= now - duration && run.at <= now,
          );
          const bySource = Object.fromEntries(
            SOURCES.map((source) => {
              const counted = within.filter(
                (run) => run.pick.source === source,
              );
              const total = bucket();
              for (const run of counted) {
                total.picks += 1;
                total.by_route[run.route] += 1;
                total.by_row[run.row] = (total.by_row[run.row] ?? 0) + 1;
              }
              return [
                source,
                {
                  ...total,
                  codex_share_pct:
                    total.picks === 0
                      ? 0
                      : Math.round((total.by_route.codex / total.picks) * 100),
                },
              ];
            }),
          );
          return [window, bySource];
        }),
      ),
    ]),
  );
}
