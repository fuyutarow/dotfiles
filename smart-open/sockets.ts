// What the smart-open client (smart-open.ts), the receiver (receive.ts) and the doctor
// (scripts/doctor.ts, checkSmartOpen) must AGREE on, defined once so they cannot drift apart:
// the two socket paths, the two timings that couple the client's patience to the receiver's
// answer, and the one file operation the client performs on the remote socket.
// ssh/config's `RemoteForward` spells the path pair in ssh's own token syntax (%r = the remote
// user, %d = the local home); that is a different language and cannot import this file, so the
// doctor compares what ssh RESOLVES it to against the two path functions.
import { lstatSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { attempt } from "../agents/hooks/attempt.ts";

/** Where `smart-open` looks on the REMOTE box; sshd binds the forward there, once per user. */
export const remoteSocket = (username: string): string =>
  `/tmp/smart-open-${username}.sock`;

/** Where the receiver listens on the CLIENT machine; the forward carries the remote socket here. */
export const receiverSocket = (home: string): string =>
  join(home, ".cache/smart-open/receiver.sock");

/**
 * The ssh Host alias the CLIENT uses to reach the remote, as the remote learns it: ssh/config's
 * `SetEnv` sends it on the same connection that carries the forward, and wsl/sshd-dotfiles.conf's
 * `AcceptEnv` lets it in. A path request names it so the receiver can open the folder in an editor
 * connected to that very host (vscode-remote ssh-remote+<alias>) — the remote cannot know the
 * client's alias for it any other way.
 */
export const SSH_HOST_ENV = "SMART_OPEN_SSH_HOST";

/**
 * The alias the client's VS Code connects to for a path request: the attach alias + `-code`, which
 * must reach the same box WITHOUT the smart-open RemoteForward (receive.ts vouches both). Were
 * VS Code to use the attach alias itself, its ssh would take the forwarded socket over and leave a
 * dead bind behind when its window closed.
 */
export const editorHost = (host: string): string => `${host}-code`;

/** How long the client waits for the receiver's one-line answer before giving up on it (a URL then
 * opens here; a path stops). */
export const ACK_MS = 2_000;

/**
 * How long the receiver waits for its opener to finish before it answers `ok` anyway (the app is
 * cold-starting; it launched). It MUST stay below ACK_MS: a receiver that answers after the client
 * has given up would open the URL on the Mac AND have the client open it here — twice.
 */
export const SETTLE_MS = 1_500;

/** Which file a path named at one moment — device + inode survive a rename, a re-bind does not. */
export type FileKey = { dev: number; ino: number; socket: boolean };

export function fileKey(path: string): FileKey | undefined {
  const s = lstatSync(path, { throwIfNoEntry: false });
  return s === undefined
    ? undefined
    : { dev: s.dev, ino: s.ino, socket: s.isSocket() };
}

/**
 * Remove `path` only if it is still the very file `seen` described, and say whether it did. A dead
 * bind is worth removing; a LIVE one that a newer ssh connection bound at the same path while we
 * were probing is not. unlink-by-path cannot be made atomic with the check, so a window of
 * microseconds remains; sshd's own StreamLocalBindUnlink (wsl/sshd-dotfiles.conf) is the primary
 * recovery, this is the fallback. A failing unlink (the file vanished in that window, or the path is
 * not ours to remove) is "did not remove", never an exception: the caller's job is still to open the URL.
 */
export async function unlinkIfSame(
  path: string,
  seen: FileKey,
): Promise<boolean> {
  const now = fileKey(path);
  if (now === undefined || now.dev !== seen.dev || now.ino !== seen.ino)
    return false;
  return (await attempt(() => unlinkSync(path))).ok;
}
