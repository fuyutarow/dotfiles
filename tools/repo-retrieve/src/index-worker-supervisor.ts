import { superviseIndexWorker } from "./ccc-index.ts";

const requestId = process.env["REPO_RETRIEVE_INDEX_REQUEST_ID"];
if (requestId === undefined) {
  process.stderr.write("missing index request ID\n");
  process.exitCode = 1;
} else {
  process.exitCode = await superviseIndexWorker(
    process.cwd(),
    requestId,
    process.env["REPO_RETRIEVE_INDEX_ACCEPT_PLAN"] === "1",
  );
}
