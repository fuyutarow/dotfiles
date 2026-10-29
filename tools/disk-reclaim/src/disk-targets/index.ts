import { diskTargetName as tmpfs } from "./tmpfs.ts";
import { diskTargetName as clean } from "./clean.ts";
import { diskTargetName as cccIndexDb } from "./ccc-index-db.ts";
import { diskTargetName as builds } from "./builds.ts";
import { diskTargetName as rust } from "./rust.ts";
import { diskTargetName as toolchains } from "./toolchains.ts";
import { diskTargetName as miseConfigs } from "./mise-configs.ts";
import { diskTargetName as workspaces } from "./workspaces.ts";
import { diskTargetName as scratch } from "./scratch.ts";
import { diskTargetName as system } from "./system.ts";
import { diskTargetName as judgment } from "./judgment.ts";
import { diskTargetName as ripExpire } from "./rip-expire.ts";
import { diskTargetName as purge } from "./purge.ts";
import { diskTargetName as host } from "./host.ts";
import { diskTargetName as vhdx } from "./vhdx.ts";
import { diskTargetName as audit } from "./audit.ts";

export const diskTargetNames = new Set([
  tmpfs,
  clean,
  cccIndexDb,
  builds,
  rust,
  toolchains,
  miseConfigs,
  workspaces,
  scratch,
  system,
  judgment,
  ripExpire,
  purge,
  host,
  vhdx,
  audit,
]);
