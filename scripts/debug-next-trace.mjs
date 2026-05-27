import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NEXT = path.join(ROOT, ".next");
const TRACE = path.join(NEXT, "trace");

function statSafe(p) {
  try {
    return { ok: true, st: fs.statSync(p) };
  } catch (e) {
    return { ok: false, code: e.code, message: e.message };
  }
}

async function main() {
  const nextStat = statSafe(NEXT);

  const traceStat = statSafe(TRACE);
  void nextStat;
  void traceStat;

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
  void writeProbe;

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
  void unlinkTrace;

  const inDocuments = ROOT.toLowerCase().includes("documents");
  void inDocuments;
}

main();
