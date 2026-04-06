#!/usr/bin/env node
/**
 * Resume o estado da fila de deployments (Railway CLI).
 * Uso: na raiz do repo, com `railway link` feito.
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

function listDeployments() {
  const out = execFileSync(
    "railway",
    ["deployment", "list", "--json", "--limit", "25"],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

function isDockerManifest(d) {
  const b = d.meta?.serviceManifest?.build;
  return b?.builder === "DOCKERFILE";
}

function main() {
  let list;
  try {
    list = listDeployments();
  } catch (e) {
    console.error("Erro ao rodar `railway deployment list`:", e.message || e);
    process.exit(1);
  }

  if (!Array.isArray(list) || list.length === 0) {
    console.log("Nenhum deployment listado.");
    return;
  }

  const byStatus = {};
  for (const d of list) {
    byStatus[d.status] = (byStatus[d.status] || 0) + 1;
  }
  console.log("Resumo por status:", byStatus);
  console.log("");

  const deploying = list.filter((d) => d.status === "DEPLOYING");
  const building = list.filter((d) => d.status === "BUILDING");
  const initializing = list.filter((d) => d.status === "INITIALIZING");
  const queued = list.filter((d) => d.status === "QUEUED");

  const dockerActive = [...deploying, ...building, ...initializing].filter(
    isDockerManifest,
  );

  if (dockerActive.length > 0) {
    console.log(
      "⚠ Há deploy(s) ainda associados ao builder DOCKERFILE (commit antigo, antes de remover Dockerfile/railway.json):",
    );
    for (const d of dockerActive) {
      console.log(
        `   ${d.id}  ${d.status}  createdAt=${d.createdAt}`,
      );
    }
    console.log("");
    console.log(
      "   → No dashboard Railway: serviço → Deployments → cancele esses deploys presos.",
    );
    console.log(
      "   → A CLI não expõe “cancelar deployment”; só o painel (ou suporte Railway).",
    );
    console.log("");
  }

  const maintenance = queued.filter(
    (d) =>
      String(d.meta?.queuedReason || "").toLowerCase().includes("maintenance"),
  );
  if (maintenance.length > 0) {
    console.log(
      `⚠ ${maintenance.length} deployment(s) na fila com manutenção da plataforma:`,
    );
    for (const d of maintenance.slice(0, 5)) {
      console.log(`   ${d.id}  ${d.meta?.queuedReason || "QUEUED"}`);
    }
    console.log("");
    console.log(
      "   → É limitação/capacidade da Railway; aguarde ou abra ticket em status.railway.com.",
    );
    console.log("");
  }

  if (deploying.length >= 2) {
    console.log(
      "⚠ Vários deploys em DEPLOYING ao mesmo tempo — costuma travar a fila. Cancele os obsoletos no dashboard.",
    );
    console.log("");
  }

  console.log("Últimos 8 (mais recente primeiro):");
  for (const d of list.slice(0, 8)) {
    const docker = isDockerManifest(d) ? " [DOCKERFILE]" : "";
    const qr =
      d.meta?.queuedReason ||
      d.meta?.skippedReason ||
      "";
    const extra = qr ? ` | ${qr}` : "";
    console.log(`  ${d.status.padEnd(14)} ${d.id}${docker}${extra}`);
  }

  console.log("");
  console.log("Comandos úteis:");
  console.log("  railway open");
  console.log("  RAILWAY_TOKEN=… npm run railway:prune-queued -- --dry-run   # depois sem --dry-run");
  console.log("  railway logs --build -n 120 <DEPLOYMENT_ID>");
  console.log("  railway logs --deployment -n 120 <DEPLOYMENT_ID>");
}

main();
