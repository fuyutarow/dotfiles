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
    id: "c-toolchain",
    host: "target",
    prerequisites: ["runtime"],
    adapter: "c-toolchain",
    probe: "cc-make-pkg-config-present",
    action: "apt-install-build-essential-pkg-config",
    timeoutSeconds: 900,
    failure: "c-toolchain-failed",
    verifier: "cc-make-pkg-config-present",
  },
  {
    id: "tools",
    host: "target",
    prerequisites: ["c-toolchain"],
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
  {
    id: "login-shell",
    host: "target",
    prerequisites: ["links"],
    adapter: "login-shell",
    probe: "passwd-zsh-listed-in-shells",
    action: "sudo-chsh-zsh",
    timeoutSeconds: 60,
    failure:
      "login shell must be zsh; probe reports the current shell and repair command",
    verifier: "passwd-zsh-listed-in-shells",
  },
  {
    id: "credentials",
    host: "target",
    prerequisites: ["links"],
    adapter: "credentials",
    probe: "configured-transfers-present",
    action: "push-configured-credentials",
    timeoutSeconds: 60,
    failure: "credentials-transfer-failed",
    verifier: "configured-transfers-present",
  },
  {
    id: "codex-config",
    host: "target",
    prerequisites: ["links", "credentials"],
    adapter: "codex-config",
    probe: "codex-config-no-drift",
    action: "run-codex-config",
    timeoutSeconds: 120,
    failure: "codex-config-failed",
    verifier: "codex-config-no-drift",
  },
  {
    id: "sccache",
    host: "target",
    prerequisites: ["tools"],
    adapter: "sccache",
    probe: "real-sccache-on-path",
    action: "install-sccache-runtime-bin",
    timeoutSeconds: 120,
    failure: "sccache-install-failed",
    verifier: "real-sccache-on-path",
  },
  {
    id: "herdr-server",
    host: "target",
    prerequisites: ["login-shell"],
    adapter: "herdr-server",
    probe: "herdr-server-shell-current",
    action: "stop-stale-herdr-servers",
    timeoutSeconds: 5,
    failure: "could not stop stale herdr server within 5 seconds",
    verifier: "no-stale-herdr-server",
  },
];

const wsl: readonly ProfileStep[] = [
  {
    id: "soks-govern",
    host: "wsl",
    prerequisites: ["c-toolchain", "credentials"],
    adapter: "soks-govern",
    probe: "soks-govern-version",
    action: "clone-and-cargo-install-soks-govern",
    timeoutSeconds: 900,
    failure: "soks-govern-install-failed",
    verifier: "soks-govern-version",
  },
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

const linux: readonly ProfileStep[] = [
  {
    id: "soks-govern",
    host: "linux",
    prerequisites: ["c-toolchain", "credentials"],
    adapter: "soks-govern",
    probe: "soks-govern-version",
    action: "clone-and-cargo-install-soks-govern",
    timeoutSeconds: 900,
    failure: "soks-govern-install-failed",
    verifier: "soks-govern-version",
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

export const profiles = { core, linux, wsl, mac } as const;
