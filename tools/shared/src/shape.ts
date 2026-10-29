// Compatibility entrypoint for readers. narrow.ts owns the implementation so existing
// candidate files can be copied without pulling in a newly added module.
export { strAt } from "./narrow.ts";
