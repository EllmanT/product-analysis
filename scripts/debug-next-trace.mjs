/**
 * Pre-build diagnostics for Windows EPERM on `.next/trace`.
 * Maps to hypotheses H1–H5; logs via debug ingest (session 8b5c9e).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NEXT = path.join(ROOT, ".next");
const TRACE = path.join(NEXT, "trace");

const ENDPOINT =
  "http://127.0.0.1:7467/ingest/2de68ee5-e25c-499c-9697-defc2dfd27b9";
const SESSION = "8b5c9e";

function send(payload) {
  const body = JSON.stringify({
    sessionId: SESSION,
    runId: process.env.DEBUG_RUN_ID || "pre-build",
    timestamp: Date.now(),
    ...payload,
  });
  return fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": SESSION,
    },
    body,
  }).catch(() => {});
}

function statSafe(p) {
  try {
    return { ok: true, st: fs.statSync(p) };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

async function main() {
  // #region agent log
  await send({
    hypothesisId: "H0",
    location: "debug-next-trace.mjs:boot",
    message: "diagnostic start",
    data: {
      platform: process.platform,
      cwd: process.cwd(),
      root: ROOT,
      node: process.version,
    },
  });
  // #endregion

  const nextStat = statSafe(NEXT);
  // #region agent log
  await send({
    hypothesisId: "H2",
    location: "debug-next-trace.mjs:.next-stat",
    message: ".next folder stat",
    data: nextStat.ok
      ? {
          exists: true,
          isDirectory: nextStat.st.isDirectory(),
          mode: nextStat.st.mode.toString(8),
          mtimeMs: nextStat.st.mtimeMs,
        }
      : { exists: false, ...nextStat },
  });
  // #endregion

  const traceStat = statSafe(TRACE);
  // #region agent log
  await send({
    hypothesisId: "H3",
    location: "debug-next-trace.mjs:trace-stat",
    message: ".next/trace stat",
    data: traceStat.ok
      ? {
          exists: true,
          isFile: traceStat.st.isFile(),
          isDirectory: traceStat.st.isDirectory(),
          size: traceStat.st.size,
          mode: traceStat.st.mode.toString(8),
        }
      : { exists: false, ...traceStat },
  });
  // #endregion

  // H2/H5: can we write under .next?
  const probe = path.join(NEXT, "__agent_write_probe__");
  let writeProbe = { ok: false };
  try {
    fs.mkdirSync(NEXT, { recursive: true });
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    writeProbe = { ok: true };
  } catch (e) {
    writeProbe = { ok: false, code: e.code, message: e.message };
  }
  // #region agent log
  await send({
    hypothesisId: "H2",
    location: "debug-next-trace.mjs:write-probe",
    message: "write+unlink under .next",
    data: writeProbe,
  });
  // #endregion

  // H6: Next uses createWriteStream on `.next/trace` (to-json). A prior open of the
  // same path (e.g. diagnostic) can race on Windows and yield EPERM; ensure Next opens first.
  let unlinkTrace = { attempted: true };
  try {
    fs.unlinkSync(TRACE);
    unlinkTrace = { ...unlinkTrace, ok: true, hadFile: true };
  } catch (e) {
    if (e.code === "ENOENT") {
      unlinkTrace = { ...unlinkTrace, ok: true, hadFile: false };
    } else {
      unlinkTrace = {
        ...unlinkTrace,
        ok: false,
        code: e.code,
        message: e.message,
      };
    }
  }
  // #region agent log
  await send({
    hypothesisId: "H6",
    location: "debug-next-trace.mjs:unlink-trace",
    message: "unlink .next/trace before next build",
    data: unlinkTrace,
  });
  // #endregion

  // H4: Documents path / controlled folders hint
  const inDocuments = ROOT.toLowerCase().includes("documents");
  // #region agent log
  await send({
    hypothesisId: "H4",
    location: "debug-next-trace.mjs:path-context",
    message: "path heuristics",
    data: {
      inDocuments,
      hasSpaceInPath: ROOT.includes(" "),
    },
  });
  // #endregion

  // #region agent log
  await send({
    hypothesisId: "H5",
    location: "debug-next-trace.mjs:done",
    message: "diagnostic end (trace cleared for next)",
    data: {},
  });
  // #endregion
}

main();
