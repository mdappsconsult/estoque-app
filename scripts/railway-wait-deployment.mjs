#!/usr/bin/env node
/**
 * Aguarda o deploy mais recente (ou um criado após o início do script) chegar a estado terminal.
 * Requer Railway CLI logada no projeto (`railway link`) e no PATH.
 *
 * Env: RAILWAY_WAIT_TIMEOUT_SEC (padrão 900)
 */
import { execFileSync } from "node:child_process";
import process from "node:process";

const intervalMs = 15_000;
const timeoutMs = (Number(process.env.RAILWAY_WAIT_TIMEOUT_SEC || 900)) * 1000;
const skewMs = 45_000;
const newDeployGraceMs = 120_000;

function listDeployments() {
  const out = execFileSync(
    "railway",
    ["deployment", "list", "--json", "--limit", "20"],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(out);
}

function formatDeployment(d) {
  const m = d.meta || {};
  const q = m.queuedReason || m.skippedReason || "";
  const commit = m.commitHash ? ` ${String(m.commitHash).slice(0, 7)}` : "";
  return `${d.status}${commit}${q ? ` — ${q}` : ""}`;
}

const scriptStart = Date.now();
let warnedFallback = false;

async function main() {
  const deadline = scriptStart + timeoutMs;
  for (;;) {
    if (Date.now() > deadline) {
      console.error(
        "Timeout: Railway não concluiu o deploy no tempo esperado. Veja o dashboard ou `railway deployment list`.",
      );
      process.exit(2);
    }

    let list;
    try {
      list = listDeployments();
    } catch (e) {
      console.error("Falha ao listar deployments (railway CLI):", e.message || e);
      process.exit(3);
    }

    if (!Array.isArray(list) || list.length === 0) {
      console.log("(sem deployments na lista)");
      await new Promise((r) => setTimeout(r, intervalMs));
      continue;
    }

    const recent = list.filter(
      (d) => new Date(d.createdAt).getTime() >= scriptStart - skewMs,
    );
    let target;
    if (recent.length > 0) {
      recent.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      target = recent[0];
    } else if (Date.now() - scriptStart >= newDeployGraceMs) {
      if (!warnedFallback) {
        console.warn(
          "Nenhum deployment novo detectado após 2 min; acompanhando o mais recente da fila.",
        );
        warnedFallback = true;
      }
      target = list[0];
    }

    if (target) {
      const line = `[${new Date().toISOString()}] ${target.id.slice(0, 8)}… ${formatDeployment(target)}`;
      console.log(line);

      const st = target.status;
      if (st === "SUCCESS") {
        console.log("Deploy concluído com sucesso.");
        process.exit(0);
      }
      if (st === "FAILED" || st === "CRASHED") {
        console.error("Deploy falhou. Logs: railway logs (ou dashboard Railway).");
        process.exit(1);
      }
    } else {
      console.log(
        `[${new Date().toISOString()}] Aguardando aparecer deployment novo (railway up / push git)…`,
      );
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

main();
