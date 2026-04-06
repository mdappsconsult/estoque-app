#!/usr/bin/env node
/**
 * Cancela deployments em QUEUED, exceto o mais recente (mesmo serviço linkado).
 * Útil quando vários pushes encheram a fila e a Railway mostra manutenção/backpressure.
 *
 * Requer token de API (conta ou workspace): https://railway.com/account/tokens
 *   export RAILWAY_TOKEN="..."
 *
 * Opções:
 *   --dry-run     só lista o que seria cancelado
 *   --keep N      mantém os N mais recentes QUEUED (padrão: 1)
 *
 * A lista de deployments usa a sessão da CLI (`railway deployment list`); as mutações usam a API.
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

const API = "https://backboard.railway.com/graphql/v2";

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  let keep = 1;
  const ki = argv.indexOf("--keep");
  if (ki !== -1 && argv[ki + 1]) {
    keep = Math.max(1, parseInt(argv[ki + 1], 10) || 1);
  }
  return { dryRun, keep };
}

function listDeploymentsJson() {
  const out = execFileSync(
    "railway",
    ["deployment", "list", "--json", "--limit", "50"],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

async function deploymentCancel(token, id) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      query: "mutation ($id: String!) { deploymentCancel(id: $id) }",
      variables: { id },
    }),
  });
  const j = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(j)}`);
  }
  if (j.errors?.length) {
    throw new Error(JSON.stringify(j.errors, null, 2));
  }
  return j.data?.deploymentCancel;
}

async function main() {
  const { dryRun, keep } = parseArgs(process.argv.slice(2));
  const token = process.env.RAILWAY_TOKEN?.trim();
  if (!token && !dryRun) {
    console.error(
      "Defina RAILWAY_TOKEN (token de conta/workspace em https://railway.com/account/tokens ).",
    );
    process.exit(1);
  }

  let list;
  try {
    list = listDeploymentsJson();
  } catch (e) {
    console.error("Falha em `railway deployment list`:", e.message || e);
    process.exit(2);
  }

  const queued = list
    .filter((d) => d.status === "QUEUED")
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (queued.length === 0) {
    console.log("Nenhum deployment QUEUED na lista.");
    return;
  }

  const keepIds = new Set(queued.slice(0, keep).map((d) => d.id));
  const toCancel = queued.filter((d) => !keepIds.has(d.id));

  console.log(
    `QUEUED na fila: ${queued.length}. Manter os ${keep} mais recente(s). Cancelar: ${toCancel.length}.`,
  );
  for (const d of queued) {
    const mark = keepIds.has(d.id) ? "manter" : "cancelar";
    const hash = d.meta?.commitHash?.slice(0, 7) || "";
    console.log(`  [${mark}] ${d.id} ${hash} ${d.meta?.queuedReason || ""}`);
  }

  if (toCancel.length === 0) {
    return;
  }

  if (dryRun) {
    console.log("\n--dry-run: nenhuma chamada à API.");
    if (!token) {
      console.log("(Com RAILWAY_TOKEN definido, os itens “cancelar” seriam enviados à API.)");
    }
    return;
  }

  for (const d of toCancel) {
    process.stdout.write(`Cancelando ${d.id}… `);
    try {
      const ok = await deploymentCancel(token, d.id);
      console.log(ok === true ? "ok" : String(ok));
    } catch (e) {
      console.log("erro:", e.message || e);
    }
  }
  console.log("\nFeito. Confira: railway deployment list --json  ou  npm run railway:diagnose");
}

main();
