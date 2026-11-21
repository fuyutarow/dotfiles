// A third module identity for "this fact has one home" selectors. Its rule can be switched off
// for the home itself (and a named exception) without also dropping the house syntax bans or
// the dotfiles zod restriction, which oxlint can only disable rule by rule. Consumers do not
// load this adapter.
export { default } from "oxlint-plugin-eslint";
