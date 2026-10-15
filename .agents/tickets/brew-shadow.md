+++
schema = 2
name = "brew-shadow"
outcome = "a command that Brewfile.core/Brewfile.ondemand declares resolves to the Homebrew copy in every shell kind, and a second copy is caught: on 2026-10-16 coralbase found ~/.local/bin/mise (a 158 MB standalone ELF, 2026.10.4, mtime 2026-10-07, left from the pre-brew install) while brew's mise is 2026.10.7; an agent shell whose PATH had ~/.local/bin before /home/linuxbrew/.linuxbrew/bin ran the old one and failed `min_version = 2026.10.7`; add a doctor check (and a tools:audit line) that fails when any declared brew command also exists as a regular file in another PATH directory such as ~/.local/bin, naming both paths and the repair (`rip <shadow>`), using tools/tool-tiers/src/tool-commands.tsv as the command list; and make the install path (`mise run install:tools` or the brew bundle step) report such shadows after installing"
writes = ["scripts/doctor*.ts", "scripts/tests/doctor*.test.ts", "scripts/check-tools*", "tools/tool-tiers/**", "mise.toml", "tools/*/.changes/*.md"]
verify = ["bun test tools/tool-tiers", "mise run lint:ts", "mise run typecheck", "mise run lint:no-sync"]
timeout_s = 2400
premises = ["file:tools/tool-tiers/src/tool-commands.tsv", "file:Brewfile.core"]

[proposition]
id = "BREW-SHADOW"
claim = "fixture: a PATH with a fake ~/.local/bin/mise ahead of a fake brew bin makes the doctor check FAIL naming both paths and `rip`; without the shadow it passes; run read-only on this machine (before the coordinator removes the file) it reports ~/.local/bin/mise"
refuted_by = "the fixture shadow passing, or the live run not reporting ~/.local/bin/mise while it exists"
+++

Do not delete anything on this machine; the coordinator removes the shadow after the owner agrees. Add no sync calls. Do
not rebase; land rebases. Record `mise run hook:pre-commit` exit code and last line in the checks field of your JSON
return. Test data outside the workspace. Do not commit or push.
