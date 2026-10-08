/** Build the environment used by every command spawned during linux:init. */
export function buildLinuxInitEnv(
  home: string,
  inherited: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const localBin = `${home}/.local/bin`;
  const runtimeBin = `${home}/.local/share/dotfiles/runtime/bin`;
  const inheritedPath = inherited.PATH;
  const path = [runtimeBin, localBin, inheritedPath]
    .filter((part) => part !== undefined && part !== "")
    .join(":");

  return { ...inherited, HOME: home, PATH: path };
}
