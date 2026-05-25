import "dotenv/config";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { runAllSignals, runAllTriggers } from "../agents/researchers.js";
import { scoreAccount } from "../agents/accountScorer.js";
import type { AccountScore, SignalFinding, TriggerFinding } from "../schemas/research.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, "../../public");
const DATA_DIR = resolve(__dirname, "../../data");
const RESULTS_FILE = resolve(DATA_DIR, "territory-results.json");

const PORT = Number(process.env.PORT ?? 4000);
// How many ACCOUNTS to research in parallel. Each account itself fans out to
// ~12 researchers (internally concurrency-capped), so keep this modest to avoid
// hammering Serper / the model API. Tune via SCORE_CONCURRENCY.
const ACCOUNT_CONCURRENCY = Number(process.env.SCORE_CONCURRENCY ?? 2);

// ---------------------------------------------------------------------------
// Types + in-memory store
// ---------------------------------------------------------------------------

type JobStatus = "idle" | "queued" | "running" | "done" | "error";

interface AccountRecord {
  id: string;
  name: string;
  country: string;
  industry: string;
  headcount: string;
  growth: string;
  techStack: string;
  domain: string;
  linkedinUrl: string;
  status: JobStatus;
  error?: string;
  scoredAt?: string;
  fit_score?: number;
  timing_score?: number;
  overall_score?: number;
  confidence?: string;
  cap_applied?: string | null;
  summary?: string;
  recommended_persona?: string;
  message_angle?: string;
  top_drivers?: string[];
  triggers?: TriggerFinding[];
  signals?: SignalFinding[];
}

const accounts = new Map<string, AccountRecord>();

function loadResults(): void {
  if (!existsSync(RESULTS_FILE)) return;
  try {
    const saved = JSON.parse(readFileSync(RESULTS_FILE, "utf8")) as AccountRecord[];
    for (const rec of saved) accounts.set(rec.id, rec);
    console.log(`[server] restored ${saved.length} scored accounts from disk`);
  } catch (error) {
    console.error("[server] could not read results file:", error);
  }
}

function persist(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(RESULTS_FILE, JSON.stringify([...accounts.values()], null, 2));
}

// ---------------------------------------------------------------------------
// CSV parsing (RFC-4180-ish: handles quotes, escaped quotes, embedded newlines)
// ---------------------------------------------------------------------------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\r") {
      // ignore
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normalizeDomain(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function ingestCsv(text: string): AccountRecord[] {
  const grid = parseCsv(text);
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => h.trim());
  const idx = (name: string) => headers.indexOf(name);

  const col = {
    name: idx("Account Name"),
    accountId: idx("Account ID"),
    country: idx("K - Country"),
    industry: idx("Industry"),
    headcount: idx("K - LinkedIn Headcount"),
    growth: idx("K - Headcount growth"),
    techStack: idx("K - Identified Tech Stack"),
    website: idx("Website"),
    linkedin: idx("LinkedIn Company URL")
  };

  const ingested: AccountRecord[] = [];
  for (let r = 1; r < grid.length; r += 1) {
    const cells = grid[r];
    const name = (col.name >= 0 ? cells[col.name] : "")?.trim();
    if (!name) continue;

    const domain = col.website >= 0 ? normalizeDomain(cells[col.website] ?? "") : "";
    const id =
      (col.accountId >= 0 ? cells[col.accountId]?.trim() : "") || domain || name;

    const existing = accounts.get(id);
    const base: AccountRecord = {
      id,
      name,
      country: (col.country >= 0 ? cells[col.country] : "")?.trim() ?? "",
      industry: (col.industry >= 0 ? cells[col.industry] : "")?.trim() ?? "",
      headcount: (col.headcount >= 0 ? cells[col.headcount] : "")?.trim() ?? "",
      growth: (col.growth >= 0 ? cells[col.growth] : "")?.trim() ?? "",
      techStack: (col.techStack >= 0 ? cells[col.techStack] : "")?.trim() ?? "",
      domain,
      linkedinUrl: (col.linkedin >= 0 ? cells[col.linkedin] : "")?.trim() ?? "",
      status: existing?.status === "running" ? "idle" : (existing?.status ?? "idle")
    };

    // Preserve any prior scoring result for this id.
    const merged: AccountRecord = existing
      ? { ...existing, ...base, status: base.status }
      : base;
    accounts.set(id, merged);
    ingested.push(merged);
  }
  persist();
  return ingested;
}

// ---------------------------------------------------------------------------
// Job queue
// ---------------------------------------------------------------------------

const queue: string[] = [];
let active = 0;

function enqueue(ids: string[]): void {
  for (const id of ids) {
    const rec = accounts.get(id);
    if (!rec) continue;
    if (rec.status === "queued" || rec.status === "running") continue;
    rec.status = "queued";
    rec.error = undefined;
    queue.push(id);
  }
  pump();
}

function pump(): void {
  while (active < ACCOUNT_CONCURRENCY && queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    active += 1;
    scoreOne(id).finally(() => {
      active -= 1;
      pump();
    });
  }
}

async function scoreOne(id: string): Promise<void> {
  const rec = accounts.get(id);
  if (!rec) return;
  rec.status = "running";
  const account = {
    id: rec.id,
    name: rec.name,
    domain: rec.domain || rec.name,
    linkedinUrl: rec.linkedinUrl || undefined
  };
  const t0 = Date.now();
  console.log(`[score] ${rec.name} ...`);
  try {
    const triggers = await runAllTriggers(account);
    const signals = await runAllSignals(account);
    const score: AccountScore = await scoreAccount(account, signals, triggers);

    rec.triggers = triggers;
    rec.signals = signals;
    rec.fit_score = score.fit_score;
    rec.timing_score = score.timing_score;
    rec.overall_score = score.overall_score;
    rec.confidence = score.confidence;
    rec.cap_applied = score.cap_applied;
    rec.summary = score.summary;
    rec.recommended_persona = score.recommended_persona;
    rec.message_angle = score.message_angle;
    rec.top_drivers = score.top_drivers;
    rec.status = "done";
    rec.scoredAt = new Date().toISOString();
    console.log(`[score] ${rec.name} -> ${score.overall_score} in ${Date.now() - t0}ms`);
  } catch (error) {
    rec.status = "error";
    rec.error = error instanceof Error ? error.message : String(error);
    console.error(`[score] ${rec.name} FAILED:`, rec.error);
  }
  persist();
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

function send(res: ServerResponse, status: number, body: unknown, type = "application/json"): void {
  const payload = type === "application/json" ? JSON.stringify(body) : String(body);
  res.writeHead(status, { "Content-Type": type });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((res, rej) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => res(data));
    req.on("error", rej);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    if (req.method === "GET" && (path === "/" || path === "/index.html")) {
      send(res, 200, readFileSync(resolve(PUBLIC_DIR, "index.html"), "utf8"), "text/html");
      return;
    }

    if (req.method === "POST" && path === "/api/upload") {
      const csv = await readBody(req);
      const ingested = ingestCsv(csv);
      send(res, 200, { count: ingested.length, accounts: [...accounts.values()] });
      return;
    }

    if (req.method === "GET" && path === "/api/state") {
      send(res, 200, {
        accounts: [...accounts.values()],
        concurrency: ACCOUNT_CONCURRENCY,
        active,
        queued: queue.length
      });
      return;
    }

    if (req.method === "GET" && path === "/api/account") {
      const id = url.searchParams.get("id") ?? "";
      const rec = accounts.get(id);
      if (!rec) {
        send(res, 404, { error: "not found" });
        return;
      }
      send(res, 200, rec);
      return;
    }

    if (req.method === "POST" && path === "/api/score") {
      const body = JSON.parse((await readBody(req)) || "{}") as { ids?: string[] };
      enqueue(Array.isArray(body.ids) ? body.ids : []);
      send(res, 200, { ok: true, active, queued: queue.length });
      return;
    }

    send(res, 404, { error: "not found" });
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

loadResults();
server.listen(PORT, () => {
  console.log(`\n  Zip Territory Research Agent`);
  console.log(`  ▶  http://localhost:${PORT}`);
  console.log(`  accounts scored in parallel: ${ACCOUNT_CONCURRENCY} (set SCORE_CONCURRENCY to change)\n`);
});
