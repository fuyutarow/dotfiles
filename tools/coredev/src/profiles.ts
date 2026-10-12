// Compatibility type only. Task selection is declared in scripts/config-registry.ts; coredev
// intentionally has no host profile, installer, or provider policy of its own.
export type HostKind = "linux" | "wsl" | "mac";
