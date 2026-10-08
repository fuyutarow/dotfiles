export type HostKind = "linux" | "wsl" | "mac";
export type ProfileStep = {
  id: string;
  host: HostKind | "target";
  prerequisites: readonly string[];
  adapter: string;
  probe: string;
  action: string;
  timeoutSeconds: number;
  failure: string;
  verifier: string;
};

const core: readonly ProfileStep[] = [
  {
    id: "runtime",
    host: "target",
    prerequisites: [],
    adapter: "runtime",
    probe: "runtime-present",
    action: "ensure-runtime",
    timeoutSeconds: 60,
    failure: "runtime-failed",
    verifier: "runtime-version",
  },
  {
    id: "tools",
    host: "target",
    prerequisites: ["runtime"],
    adapter: "tools",
    probe: "core-tools-present",
    action: "install-core-tools",
    timeoutSeconds: 900,
    failure: "tools-failed",
    verifier: "core-tools",
  },
  {
    id: "links",
    host: "target",
    prerequisites: ["tools"],
    adapter: "links",
    probe: "dotfiles-linked",
    action: "realize-dotfiles",
    timeoutSeconds: 120,
    failure: "links-failed",
    verifier: "dotfiles-check",
  },
];

const wsl: readonly ProfileStep[] = [
  {
    id: "tools",
    host: "wsl",
    prerequisites: ["runtime"],
    adapter: "wsl-tools",
    probe: "wsl-tools-present",
    action: "install-wsl-tools",
    timeoutSeconds: 900,
    failure: "wsl-tools-failed",
    verifier: "wsl-tools",
  },
  {
    id: "wsl-services",
    host: "wsl",
    prerequisites: ["links"],
    adapter: "wsl-services",
    probe: "services-ready",
    action: "enable-wsl-services",
    timeoutSeconds: 120,
    failure: "wsl-services-failed",
    verifier: "wsl-services",
  },
];

const mac: readonly ProfileStep[] = [
  {
    id: "tools",
    host: "mac",
    prerequisites: ["runtime"],
    adapter: "mac-tools",
    probe: "mac-tools-present",
    action: "install-mac-tools",
    timeoutSeconds: 900,
    failure: "mac-tools-failed",
    verifier: "mac-tools",
  },
  {
    id: "mac-defaults",
    host: "mac",
    prerequisites: ["links"],
    adapter: "mac-defaults",
    probe: "defaults-correct",
    action: "apply-mac-defaults",
    timeoutSeconds: 120,
    failure: "mac-defaults-failed",
    verifier: "mac-defaults",
  },
];

export const profiles = { core, wsl, mac } as const;
