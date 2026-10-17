// Shadow registration, pinned plugin install, and Restricted-mode trust need a full ACK.
// The receiver's operation is bounded below the sender's patience; no early success reply.
export const OBSIDIAN_ACK_MS = 300_000;
export const OBSIDIAN_OPEN_MS = 280_000;
