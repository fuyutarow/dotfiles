// The CONFIG REGISTRY — every configuration surface this repo governs, in one file: what declares
// it, how it reaches the machine, who consumes it, who may write it, and what verifies it.
// `mise run config:map` prints it; `mise run config:map -- --check` fails when a config-shaped
// file in the repo is in no row (scripts/config-map.ts). Consumers of the tables:
//   scripts/link-dots.ts       LINKS, ETC_LINKS, RETIRED, TOOL_OWNED
//   scripts/render-home.ts     RENDERED (destinations; the render logic stays there)
//   scripts/doctor.ts          RENDERED (fresh-render comparison)
//   scripts/one-writer-check.ts RENDERED (no symlink at a rendered path)
//
// INV-8 (README → Design): data flows one way — declaration (repo) → deploy → $HOME → runtime —
// and every file has ONE writer. Each row names that writer. The kinds:
//   link          one declaration verbatim at one path (link-dots)       writer: human, in the repo
//   etc-link      the same under /etc, via sudo (WSL)                    writer: human, in the repo
//   rendered      a function of several declarations (render-home)        writer: render-home.ts
//   tool-owned    a real machine-local file a tool rewrites on command    writer: that tool
//   fan-out       one source → N agent tools (mise run link:skills)       writer: human, in the repo
//   applied       converged into a tool or the OS by a task               writer: the task (from the repo)
//   in-place      read from the checkout itself, never deployed           writer: as named
//   machine-local exists only on the machine, never in the repo           writer: the human there
//
// Zero-dep (node: only), like link-dots.ts and render-home.ts which import it.

// Where a link applies. Required on every row: no row is "everywhere" by omission.
export type When = "all" | "mac" | "wsl" | "linux" | "not-mac";

// Landing targets are SSH aliases; connection details remain in ~/.ssh/config.local.
export const LAND_HOSTS: readonly string[] = ["sol", "r99-u26"];

// [when, repo-relative source, home-relative destination]
export const LINKS: readonly (readonly [When, string, string])[] = [
  // --- zsh ---
  ["all", "zsh/zshenv", ".zshenv"],
  ["all", "zsh/zshrc", ".zshrc"],
  ["mac", "zsh/zprofile.mac", ".zprofile"],
  // zprofile.wsl is the Linux login profile (brew shellenv, PATH, sheldon → aliases); its WSL-only
  // parts are guarded. Plain Linux gets it too: without it linuxbrew is off PATH, sheldon never
  // runs and no alias exists (2026-10-05, Vast box: `l`/`p`/`h` not found).
  ["not-mac", "zsh/zprofile.wsl", ".zprofile"],
  ["all", "sheldon", ".config/sheldon"],
  // bash where it is still the login shell and chsh is not ours (a shared server, sol): the login
  // is handed to zsh, and `ssh host 'cmd'` (read: herdr --remote) gets zshenv's PATH. Plain Linux
  // only — WSL's login shell is zsh and its distro ~/.bashrc is not ours to move aside.
  ["linux", "zsh/bash_profile", ".bash_profile"],
  ["linux", "zsh/bashrc", ".bashrc"],

  // --- git (per-OS identity/credential include) ---
  // git reads BOTH ~/.config/git/config and ~/.gitconfig. The repo's config is linked to the
  // XDG one, which git only reads; ~/.gitconfig is TOOL_OWNED below, so `git config --global`
  // (and gh/lfs, which call it) writes there, not through a link into the repo (INV-8, measured).
  ["all", "git/gitconfig", ".config/git/config"],
  ["mac", "git/local.mac", ".local-gitconfig"],
  ["wsl", "git/local.wsl", ".local-gitconfig"],

  // --- ssh (client POLICY only; the host inventory stays machine-local) ---
  // ssh/config Includes ~/.ssh/config.local FIRST, and that file holds HostName/Port/User — a
  // tailnet map that must never enter this PUBLIC repo. A missing config.local is not an error
  // (ssh -G still resolves, exit 0), so a fresh clone links cleanly and simply has no hosts yet.
  // The smart-open attach file is linked separately: it needs OpenSSH >= 9.9 (linkSshAttach).
  ["all", "ssh/config", ".ssh/config"],

  // --- tmux / herdr (herdr: the config file only — ~/.config/herdr/ also holds live sockets) ---
  ["all", "tmux/tmux.conf", ".tmux.conf"],
  ["all", "herdr/config.toml", ".config/herdr/config.toml"],

  // --- claude code (user-level config; the repo's own project .claude/ is separate) ---
  // The statusline is tools/statusline (package `bin`, ~/.bun/bin/statusline); no link here.
  ["all", "agents/claude/hooks", ".claude/hooks"],
  // ~/.claude/CLAUDE.md, ~/.claude/settings.json and ~/.codex/hooks.json are RENDERED, not linked:
  // each is a function of several declarations (scripts/render-home.ts, renderHome below).
  ["all", "agents/claude/keybindings.json", ".claude/keybindings.json"],
  // Per-file, NOT the whole ~/.claude/agents dir — that directory also holds an unrelated
  // personal agent this repo does not own. Each Claude row of the dispatch roster is its own link.
  [
    "all",
    "agents/claude/agents/sonnet-high.md",
    ".claude/agents/sonnet-high.md",
  ],
  [
    "all",
    "agents/claude/agents/opus-medium.md",
    ".claude/agents/opus-medium.md",
  ],
  [
    "all",
    "agents/claude/agents/sonnet-medium.md",
    ".claude/agents/sonnet-medium.md",
  ],

  // --- codex (user-level hooks; AGENTS.md / prompts / skills fan out via link:skills) ---
  ["all", "agents/codex/hooks", ".codex/hooks"],

  // --- vendor-neutral hooks (the hook analogue of ~/.agents/skills) ---
  // hooks.toml there is wired into BOTH the rendered ~/.claude/settings.json and ~/.codex/hooks.json
  // by scripts/render-home.ts, and both call them through this one path.
  ["all", "agents/hooks", ".agents/hooks"],

  // NOTE for every systemd unit below: `systemctl --user disable <unit>` DELETES the symlink placed
  // in ~/.config/systemd/user/ (systemd treats any symlink in the unit path as an enablement link),
  // so a disable leaves the unit `not-found`, not `disabled`. Re-run `mise run link:dots` after one.
  //
  // --- cocoindex-code (declarative global settings = no interactive `ccc init`) ---
  [
    "all",
    "cocoindex/global_settings.yml",
    ".cocoindex_code/global_settings.yml",
  ],
  // The daemon needs a systemd owner or it is spawned uncapped by whichever client calls first.
  // Linking the unit also arms the client-side guard in zsh/zshenv. Activate: mise run wsl:ccc-daemon
  [
    "wsl",
    "cocoindex/ccc-daemon.service.wsl",
    ".config/systemd/user/ccc-daemon.service",
  ],
  [
    "wsl",
    "cocoindex/repo-retrieve-rerank.socket.wsl",
    ".config/systemd/user/repo-retrieve-rerank.socket",
  ],
  [
    "wsl",
    "cocoindex/repo-retrieve-rerank.service.wsl",
    ".config/systemd/user/repo-retrieve-rerank.service",
  ],
  [
    "wsl",
    "wsl/wsl-capacity-recover.service.wsl",
    ".config/systemd/user/wsl-capacity-recover.service",
  ],
  [
    "wsl",
    "wsl/wsl-capacity-recover.timer.wsl",
    ".config/systemd/user/wsl-capacity-recover.timer",
  ],

  // --- update steps, process monitor, jj ---
  ["all", "topgrade/topgrade.toml", ".config/topgrade.toml"],
  ["all", "bottom/bottom.toml", ".config/bottom/bottom.toml"],
  // jj reads every conf.d/*.toml beside its user config; `jj config set --user` writes config.toml
  // (TOOL_OWNED below) — but conf.d when config.toml is missing, hence the empty file (measured).
  ["all", "jj/config.toml", ".config/jj/conf.d/dotfiles.toml"],

  // --- lazygit (config dir differs by OS) ---
  [
    "mac",
    "lazygit/config.yml",
    "Library/Application Support/lazygit/config.yml",
  ],
  ["not-mac", "lazygit/config.yml", ".config/lazygit/config.yml"],

  // --- karabiner (whole directory; a real one is moved aside only under --force) ---
  ["mac", "karabiner", ".config/karabiner"],

  // --- smart-open receiver (macOS: the machine you sit at; opens URLs forwarded from remote `o`) ---
  [
    "mac",
    "tools/smart-open/smart-open-receiver.plist.mac",
    "Library/LaunchAgents/dotfiles.smart-open-receiver.plist",
  ],
];

// WSL system config under /etc: needs root, so sudo is attempted only when a link is missing (a
// pull must not re-prompt). Symlinks, not copies: each reader follows links fine.
// .wslconfig is NOT here on purpose: the Windows-side WSL service cannot follow a WSL symlink, so
// it is COPIED by `mise run wsl:wslconfig` (scripts/wsl-wslconfig.ts).
export const ETC_LINKS: readonly (readonly [string, string, string])[] = [
  ["wsl/wsl.conf", "/etc/wsl.conf", "restart the distro"],
  // 50- so it applies after the distro's own 10-* drop-ins and before 99-sysctl.conf.
  ["wsl/sysctl.conf", "/etc/sysctl.d/50-dotfiles.conf", "sudo sysctl --system"],
  // Lets the newest ssh connection re-bind smart-open's forwarded socket.
  [
    "wsl/sshd-dotfiles.conf",
    "/etc/ssh/sshd_config.d/50-dotfiles.conf",
    "sudo systemctl reload ssh",
  ],
];

// Retired destinations: links that still RESOLVE but must not exist (the dangling prune cannot see
// them). Until 2026-09-13 three .ts CLIs were hand-symlinked into ~/.local/bin; they are now
// package.json `bin` entries that `bun link` (mise run deps) installs into ~/.bun/bin.
// ~/.agents/.skill-lock.json was a link into agents/skills-lock.json so that `skills add -g`
// wrote provenance THROUGH it into the repo; since 2026-10-06 (INV-8) scripts/vendor-skill.ts runs
// the CLI in a throwaway HOME and writes the ledger itself, so no deployed path writes the repo.
export const RETIRED = [
  ".agents/.skill-lock.json",
  // Linked until 2026-10-06; the tools WRITE these (measured), so they became TOOL_OWNED.
  ".gitconfig",
  ".config/jj/config.toml",
  ".local/bin/repo-search",
  ".local/bin/agent-resource-run",
  ".local/bin/serena-foreground",
  // Linked until SL3 (2026-10-08); statusLine.command now runs the tools/statusline bin.
  ".claude/statusline-command.ts",
] as const;

// Tool-owned: files a tool rewrites on command (`git config --global`, `jj config set --user`),
// so they must be REAL machine-local files, never links into the repo — the repo's half rides in a
// read-only path above (INV-8: data flows one way). Created empty when missing; never edited.
// Measured 2026-10-06 in a throwaway HOME: with a link here, both commands rewrote the repo file
// and kept the link; with the layout above, both wrote only this file.
export const TOOL_OWNED = [".gitconfig", ".config/jj/config.toml"] as const;

// ── the rest of the registry: every surface that is not a plain link ─────────────────────────────

export type Kind =
  | "link"
  | "etc-link"
  | "rendered"
  | "tool-owned"
  | "fan-out"
  | "applied"
  | "in-place"
  | "machine-local";

/** One configuration surface. `sources` are repo-relative (a directory covers what is under it);
 * `deployed` is where the consumer reads it (~ = $HOME); `verify` is the command whose failure
 * means this surface is wrong, or "none" — a stated gap, never an omission. */
export type Surface = {
  readonly kind: Kind;
  readonly when: When;
  readonly sources: readonly string[];
  readonly deployed: string;
  readonly consumer: string;
  readonly writer: string;
  readonly verify: string;
};

/** The rendered half of $HOME: render-home.ts writes exactly these (home-relative), nothing else. */
export const RENDERED = [
  {
    dest: ".claude/settings.json",
    inputs: [
      "agents/claude/settings.json",
      "zsh/timezone",
      "agents/hooks/hooks.toml",
    ],
    machine: "~/.claude/settings.private.json",
    consumer:
      "Claude Code (user settings: hooks, permissions, autoMode, env.TZ)",
  },
  {
    dest: ".codex/hooks.json",
    inputs: ["agents/codex/hooks.json", "agents/hooks/hooks.toml"],
    machine: "",
    consumer: "Codex (user hooks)",
  },
  {
    dest: ".claude/CLAUDE.md",
    inputs: ["agents/claude/CLAUDE.md", "agents/models/dispatch-roster.toml"],
    machine: "",
    consumer: "Claude Code (user memory, read at session start)",
  },
] as const;

const DOCTOR = "mise run doctor";

/** Surfaces with no row in the link tables above. */
const OTHER: readonly Surface[] = [
  {
    kind: "fan-out",
    when: "all",
    sources: ["agents/skills", "agents/commands", "agents/codex/AGENTS.md"],
    deployed:
      "~/.claude/skills/*, ~/.agents/skills, ~/.claude/commands, ~/.codex/prompts, ~/.codex/AGENTS.md",
    consumer: "Claude Code, Codex, Antigravity",
    writer:
      "human, in the repo; mise run link:skills deploys (skills:add imports a vendored skill)",
    verify: `${DOCTOR} (skills)`,
  },
  {
    kind: "applied",
    when: "all",
    sources: [".mcp.json"],
    deployed: "Claude Code (user scope) and Codex MCP registrations",
    consumer: "Claude Code, Codex",
    writer: "human, in the repo; mise run cc:install-mcp applies",
    verify: `${DOCTOR} (mcp)`,
  },
  {
    kind: "applied",
    when: "all",
    sources: ["agents/codex/app-server.toml"],
    deployed: "the Codex app-server daemon's remote-control setting",
    consumer: "Codex app-server (ChatGPT mobile app)",
    writer: "human, in the repo; mise run codex:remote-control converges",
    verify: `${DOCTOR} (codex-remote)`,
  },
  {
    kind: "applied",
    when: "all",
    sources: ["agents/codex/config.declared.toml"],
    deployed:
      "the Codex-owned ~/.codex/config.toml model limits and workspace-write network setting",
    consumer: "Codex workers using workspace-write sandbox",
    writer:
      "human, in the repo; mise run codex:config converges model_context_window, model_auto_compact_token_limit, and sandbox_workspace_write.network_access",
    verify: `${DOCTOR} (codex-config)`,
  },
  {
    kind: "applied",
    when: "all",
    sources: ["Brewfile", "Brewfile.core"],
    deployed: "installed CLIs (brew; mise on a plain Linux box)",
    consumer: "every shell",
    writer: "human, in the repo; brew bundle / mise run linux:init install",
    verify: `${DOCTOR} (brew) · mise run tools:audit`,
  },
  {
    kind: "applied",
    when: "all",
    sources: ["package.json"],
    deployed: "node_modules, and ~/.bun/bin for the `bin` commands",
    consumer: "this repo's scripts; PATH commands (rr, agent-resource-run, …)",
    writer: "human, in the repo; mise run deps installs",
    verify: `${DOCTOR} (deps, bins)`,
  },
  {
    kind: "in-place",
    when: "all",
    sources: [
      "tools/shared/package.json",
      "tools/agx-usehooks/package.json",
      "tools/smart-open/package.json",
      "tools/repo-retrieve/package.json",
      "tools/agent-resource-run/package.json",
      "tools/disk-reclaim/package.json",
      "tools/storage-headroom/package.json",
      "tools/statusline/package.json",
      "tools/serena-foreground/package.json",
      "tools/agx/package.json",
      "tools/coredev/package.json",
    ],
    deployed: "the checkout",
    consumer:
      "Bun package metadata of the tools/ packages (shared modules; each CLI reads its own version)",
    writer: "human, in the repo",
    verify: "mise run lint:ts · typecheck",
  },
  {
    kind: "applied",
    when: "mac",
    sources: ["macos/defaults.ts"],
    deployed: "macOS defaults domains",
    consumer: "macOS",
    writer: "human, in the repo; mise run mac:defaults writes",
    verify: "none",
  },
  {
    kind: "applied",
    when: "mac",
    sources: ["iterm2"],
    deployed: "iTerm2's custom preferences folder (points at the repo)",
    consumer: "iTerm2",
    writer:
      "iTerm2 itself when 'save changes' is on (an editor, like a GUI), else human",
    verify: `${DOCTOR} (iterm2)`,
  },
  {
    kind: "applied",
    when: "mac",
    sources: ["obsidian/app.json", "obsidian/plugins.json"],
    deployed: "each registered vault's .obsidian/",
    consumer: "Obsidian",
    writer: "human, in the repo; mise run mac:obsidian merges",
    verify: "none",
  },
  {
    kind: "applied",
    when: "mac",
    sources: ["obsidian/local-plugins/doc-view/manifest.json"],
    deployed:
      "each registered vault's .obsidian/plugins/doc-view/ (staged directory swap)",
    consumer: "Obsidian",
    writer:
      "human, in the repo; obsidian/apply.ts copies via mise run mac:obsidian",
    verify: "bun test obsidian/apply.test.ts",
  },
  {
    kind: "applied",
    when: "mac",
    sources: ["edge/policy.plist.mac"],
    deployed: "/Library/Managed Preferences (COPY, sudo)",
    consumer: "Microsoft Edge",
    writer: "human, in the repo; mise run edge:policy copies",
    verify: `${DOCTOR} (edge-policy)`,
  },
  {
    kind: "applied",
    when: "wsl",
    sources: ["wsl/wslconfig.win"],
    deployed:
      "%USERPROFILE%\\.wslconfig (COPY: Windows cannot follow a WSL link)",
    consumer: "the Windows WSL service",
    writer: "human, in the repo; mise run wsl:wslconfig copies",
    verify: `${DOCTOR} (wslconfig)`,
  },
  {
    kind: "applied",
    when: "wsl",
    sources: ["wsl/winget.win.json"],
    deployed: "the Windows host's winget packages",
    consumer: "winget",
    writer:
      "mise run wsl:winget:dump CAPTURES the host into it (an explicit import, reviewed as a diff); wsl:winget:restore applies",
    verify: "none",
  },
  {
    kind: "applied",
    when: "linux",
    sources: ["wsl/sshd-dotfiles.conf"],
    deployed:
      "/etc/ssh/sshd_config.d/50-dotfiles.conf (COPY by linux:init, sudo)",
    consumer: "sshd",
    writer:
      "human, in the repo; mise run linux:init installs where sudo is ours",
    verify: "mise run doctor:remote (smart-open)",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["zsh/aliases.zsh", "zsh/mac.zsh", "zsh/wsl.zsh"],
    deployed:
      "the checkout (sheldon sources aliases.zsh; it sources the OS file)",
    consumer: "interactive zsh",
    writer: "human, in the repo",
    verify: "mise run test:zsh · lint:zsh",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["tmux/clipboard.conf"],
    deployed: "the checkout (tmux.conf source-file)",
    consumer: "tmux",
    writer: "human, in the repo",
    verify: "none",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["zsh/timezone"],
    deployed:
      "the checkout (zshenv, bashrc), rendered into Claude Code's env.TZ",
    consumer: "every shell, Claude Code, doctor:remote",
    writer: "human, in the repo",
    verify: `${DOCTOR} (rendered) · mise run doctor:remote (time-zone)`,
  },
  {
    kind: "in-place",
    when: "all",
    sources: [
      "agents/hooks/storage-headroom.toml",
      "agents/hooks/model-floor.toml",
    ],
    deployed: "the checkout, via ~/.agents/hooks",
    consumer: "the storage-headroom and model-floor hooks (Claude Code, Codex)",
    writer: "human, in the repo",
    verify: "mise run test:hooks",
  },
  {
    kind: "in-place",
    when: "all",
    sources: [
      "agents/models/dispatch-roster.toml",
      "agents/models/dispatch-roster.contract.md",
    ],
    deployed: "the checkout; rendered into ~/.claude/CLAUDE.md",
    consumer: "dispatch hook, agx dispatch, codex worker, render-home",
    writer:
      "human, in the repo (CONFIGURATION CONTRACT: dispatch-roster.contract.md)",
    verify: `mise run test:hooks · test:agx · ${DOCTOR} (rendered)`,
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["agents/models/releases.toml"],
    deployed: "the checkout",
    consumer: "mise run models:audit (check-releases.ts)",
    writer: "human, in the repo",
    verify: "mise run models:audit",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["tools/agent-resource-run/resource-policy.toml"],
    deployed: "the checkout",
    consumer: "agent-resource-run (admission)",
    writer: "human, in the repo",
    verify: "mise run test:resource-control",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["tools/disk-reclaim/reclaim.toml"],
    deployed: "the checkout",
    consumer: "disk-reclaim",
    writer: "human, in the repo",
    verify: "bun test tools/disk-reclaim",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["tools/repo-retrieve/retrieval.toml"],
    deployed: "the checkout",
    consumer: "rr / repo-retrieve and its search gate",
    writer: "human, in the repo",
    verify: "mise run test:retrieval-control",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["agents/skills-lock.json"],
    deployed: "the checkout",
    consumer: "skills-doctor (provenance ledger)",
    writer:
      "scripts/vendor-skill.ts (mise run skills:add) — never the skills CLI",
    verify: `${DOCTOR} (skills)`,
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["agents/skills-listing-budget.json"],
    deployed: "the checkout",
    consumer: "mise run lint:skills-floor",
    writer: "human, in the repo (a ratchet)",
    verify: "mise run lint:skills-floor",
  },
  {
    kind: "in-place",
    when: "all",
    sources: ["oxlint-policy.toml", ".oxlintrc.json"],
    deployed: "the checkout (.oxlintrc.json is GENERATED from the policy)",
    consumer: "oxlint (mise run lint:ts)",
    writer: "human writes the TOML; mise run oxlint:render writes the JSON",
    verify: "mise run lint:oxlint-policy · test:scripts (oxlint-policy)",
  },
  {
    kind: "in-place",
    when: "all",
    sources: [".oxfmtrc.json", ".rumdl.toml", "tsconfig.json", "mise.toml"],
    deployed: "the checkout",
    consumer: "oxfmt, rumdl, tsgo, mise",
    writer: "human, in the repo",
    verify: "mise run fmt:check · lint:md · typecheck · mise tasks",
  },
  {
    kind: "in-place",
    when: "all",
    sources: [".claude/settings.json"],
    deployed: "the checkout (project scope)",
    consumer: "Claude Code inside this repo (denies git: jj only)",
    writer: "human, in the repo",
    verify: "none",
  },
  {
    kind: "in-place",
    when: "all",
    sources: [".cocoindex_code/settings.yml"],
    deployed:
      "the checkout (the index DB itself lives in ~/.cache, see zsh/zshenv)",
    consumer:
      "ccc daemon (what to index) and the search-route gate (an operational ccc repo)",
    writer: "human, in the repo",
    verify: "none",
  },
  {
    kind: "in-place",
    when: "all",
    sources: [".vscode/settings.json"],
    deployed: "the checkout (workspace scope)",
    consumer: "VS Code",
    writer:
      "human, in the repo (VS Code's settings UI writes it too: an editor)",
    verify: "none",
  },
  {
    kind: "machine-local",
    when: "all",
    sources: [],
    deployed: "~/.claude/settings.private.json",
    consumer: "render-home.ts (merged into ~/.claude/settings.json)",
    writer: "the human on that machine (autoMode and other private rules)",
    verify: `${DOCTOR} (rendered: unreadable JSON is FATAL)`,
  },
  {
    kind: "machine-local",
    when: "all",
    sources: [],
    deployed: "~/.ssh/config.local",
    consumer: "ssh (Included first by ssh/config)",
    writer:
      "the human on that machine (the host inventory never enters the public repo)",
    verify: "mise run doctor:remote (reach)",
  },
];

const topic = (src: string): string => src.split("/")[0] ?? src;

/** Every surface: the link tables expanded with their kind's defaults, then the rest. */
export function surfaces(): Surface[] {
  const links = LINKS.map(([when, src, dst]): Surface => ({
    kind: "link",
    when,
    sources: [src],
    deployed: `~/${dst}`,
    consumer: topic(src),
    writer: "human, in the repo",
    verify: `${DOCTOR} (links)`,
  }));
  const attach: Surface = {
    kind: "link",
    when: "all",
    sources: ["ssh/smart-open-attach.conf"],
    deployed: "~/.ssh/config.d/smart-open-attach.conf (OpenSSH >= 9.9 only)",
    consumer: "ssh (smart-open forward on attach)",
    writer: "human, in the repo",
    verify: `${DOCTOR} (links, smart-open)`,
  };
  const etc = ETC_LINKS.map(([src, dst, apply]): Surface => ({
    kind: "etc-link",
    when: "wsl",
    sources: [src],
    deployed: `${dst} (then: ${apply})`,
    consumer: topic(src),
    writer: "human, in the repo",
    verify: `${DOCTOR} (links)`,
  }));
  const rendered = RENDERED.map((r): Surface => ({
    kind: "rendered",
    when: "all",
    sources: r.inputs,
    deployed: `~/${r.dest}${r.machine === "" ? "" : ` (+ ${r.machine})`}`,
    consumer: r.consumer,
    writer: "scripts/render-home.ts (mise run link:dots)",
    verify: `${DOCTOR} (rendered) · lint:one-writer`,
  }));
  const tool = TOOL_OWNED.map((p): Surface => ({
    kind: "tool-owned",
    when: "all",
    sources: [],
    deployed: `~/${p}`,
    consumer: p.includes("jj") ? "jj" : "git",
    writer: p.includes("jj")
      ? "`jj config set --user` (the repo's half: jj/config.toml in conf.d)"
      : "`git config --global`, gh, git-lfs (the repo's half: git/gitconfig in ~/.config/git)",
    verify: "mise run link:dots -- --check",
  }));
  return [...links, attach, ...etc, ...rendered, ...tool, ...OTHER];
}
