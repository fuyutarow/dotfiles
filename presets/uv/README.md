# uv project configuration

Apply with `mise run preset -- apply uv --to <repo>` and compare with
`mise run preset -- diff uv --to <repo>`. The target directory must exist.

`pyproject.toml` combines the writing-python skill's uv guard, conservative
Python floor, exact Ruff pin, house Ruff policy, and strict Pyright setting.
`uv-project` and `0.1.0` are scaffold metadata: rename them for the project.
The default is an application without a build backend. Use `uv add` for actual
runtime dependencies and commit the resulting `uv.lock`; no generated lockfile
or environment is shipped here. Update the Ruff dependency and hook revision
together when deliberately upgrading.

`mise.toml` preserves the task fragment from
`agents/skills/wiring-mise-tasks/templates/python.mise.toml:1`. That skill is
outside this ticket's edit scope; preset-mise will replace its copy with a link.
The tasks assume uv and the deployed `fmt-staged`, `mise-contract`, and
`jj-commit` helpers. Select runtime pins in `[tools]` for the actual repository,
and remove jj-only tasks for a Git-only repository, as the source template says.
Applying files does not provision these tools or run their tasks.

The manifest also ships two optional examples, without activating them:

- `examples/pyproject-pytorch.toml` is a fragment to merge only for PyTorch
  projects. It preserves the skill's dependencies, platform markers, and indexes.
- `examples/script.py` carries the original PEP 723 header. Adapt its dependency
  list for the script being authored; it is independent of the enclosing project.

The skill retains conditional rules for dependency groups, workspace membership,
non-PyPI sources, publishing backends, custom-index isolation, and incremental
strict rollout. These describe choices for a particular project, rather than
additional configuration to apply to every empty repository.
