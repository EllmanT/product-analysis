/**
 * Self-hosted scheduler for the POS background jobs. Use this when the app does not run on Vercel
 * (vercel.json already schedules the same two endpoints there).
 *
 *   node --env-file=.env.local scripts/run-cron.mjs [--base http://localhost:3000] [--once]
 *   npm run pos:cron
 *
 * Every minute it calls, with `Authorization: Bearer $CRON_SECRET`:
 *   GET /api/cron/pos-queue        retry unfiscalised sales (same fiscal day), reconcile unknown outcomes
 *   GET /api/cron/fiscal-schedule  automatic open/close of the shared fiscal day
 * Run it under a process manager (pm2, a Windows service, systemd) so it restarts with the machine.
 */
const args = process.argv.slice(2);
const baseArg = args.indexOf("--base");
const base = (baseArg !== -1 ? args[baseArg + 1] : process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const once = args.includes("--once");
const secret = process.env.CRON_SECRET;

if (!secret) {
  console.error("CRON_SECRET is not set. Put it in .env.local (and the app's environment) first.");
  process.exit(1);
}

const jobs = ["/api/cron/pos-queue", "/api/cron/fiscal-schedule"];

async function tick() {
  const at = new Date().toISOString();
  for (const path of jobs) {
    try {
      const res = await fetch(base + path, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(90_000),
      });
      const body = await res.text();
      console.log(`${at} ${path} -> ${res.status} ${body.slice(0, 200)}`);
    } catch (e) {
      console.error(`${at} ${path} failed: ${e instanceof Error ? e.message : e}`);
    }
  }
}

await tick();
if (!once) {
  // Aim at the top of each minute so open/close times match to the minute.
  const wait = () => 60_000 - (Date.now() % 60_000) + 500;
  const loop = async () => {
    await tick();
    setTimeout(loop, wait());
  };
  setTimeout(loop, wait());
}
