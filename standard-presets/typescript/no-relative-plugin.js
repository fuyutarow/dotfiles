// A fourth module identity for the dotfiles relative-import ban. Its own rule key lets an override
// switch the ban off (a self-contained skill script, a template) without also dropping the house
// syntax bans, the zod restriction or the one-home selectors, which share no-restricted-syntax and
// would be replaced, not merged, by an override naming the same key. Consumers do not load this.
export { default } from "oxlint-plugin-eslint";
