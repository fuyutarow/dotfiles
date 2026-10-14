// Compatibility entrypoint for readers. narrow.ts owns the implementation so existing
// candidate files can be copied without pulling in a newly added module.
export {
  arr,
  at,
  bool,
  num,
  obj,
  str,
  strAt,
  strsAt,
  type Obj,
} from "./narrow.ts";
