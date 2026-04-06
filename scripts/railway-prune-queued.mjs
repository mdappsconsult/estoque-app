#!/usr/bin/env node
/**
 * Cancela deployments em QUEUED, exceto o mais recente (mesmo serviço linkado).
 * Útil quando vários pushes encheram a fila e a Railway mostra manutenção/backpressure.
 *
 * Autenticação (uma das opções):
 *   - Token de projeto (Settings → Tokens do projeto): export RAILWAY_PROJECT_TOKEN="..."
 *   - Token de conta/workspace: https://railway.com/account/tokens → export RAILWAY_TOKEN="..."
 *   O painel do projeto pode dizer RAILWAY_TOKEN para a CLI; na API GraphQL o token de **projeto**
 *   usa o header Project-Access-Token (este script trata os dois).
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

function authHeaders() {
  const project = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bearer = process.env.RAILWAY_TOKEN?.trim();
  if (project) {
    return {
      "Content-Type": "application/json",
      "Project-Access-Token": project,
    };
  }
  if (bearer) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
    };
  }
  return null;
}

async function deploymentCancel(headers, id) {
  const res = await fetch(API, {
    method: "POST",
    headers,
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
  const headers = authHeaders();
  if (!headers && !dryRun) {
    console.error(
      "Defina RAILWAY_PROJECT_TOKEN (token do projeto) ou RAILWAY_TOKEN (conta/workspace). Nunca commite tokens.",
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
    if (!headers) {
      console.log(
        "(Com RAILWAY_PROJECT_TOKEN ou RAILWAY_TOKEN definido, os itens “cancelar” seriam enviados à API.)",
      );
    }
    return;
  }

  for (const d of toCancel) {
    process.stdout.write(`Cancelando ${d.id}… `);
    try {
      const ok = await deploymentCancel(headers, d.id);
      console.log(ok === true ? "ok" : String(ok));
    } catch (e) {
      console.log("erro:", e.message || e);
    }
  }
  console.log("\nFeito. Confira: railway deployment list --json  ou  npm run railway:diagnose");
}

main();
