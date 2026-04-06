'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Printer, RefreshCw, Save, Server } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import {
  type ConfigImpressaoPiRow,
  type ImpressaoPiPapel,
  listConfigsImpressaoPi,
  updateConfigImpressaoPi,
} from '@/lib/services/config-impressao-pi';
import { errMessage } from '@/lib/errMessage';

function mensagemIndicaTunnelMorto(msg: string): boolean {
  return /ENOTFOUND|getaddrinfo ENOTFOUND/i.test(msg);
}

const ROTULO: Record<ImpressaoPiPapel, { titulo: string; descricao: string }> = {
  estoque: {
    titulo: 'Ponte estoque (Separar por Loja)',
    descricao:
      'Usada em Separar por Loja e, por padrão, no teste de impressão. Primeiro Raspberry / Zebra da operação loja.',
  },
  industria: {
    titulo: 'Ponte indústria (segundo Raspberry)',
    descricao:
      'Reservada para o segundo Pi (ex.: Produção). Configure aqui quando o hardware estiver pronto; use o segredo de sincronização desta linha no .env desse Pi.',
  },
};

function ImpressoraCard({
  row,
  onSaved,
}: {
  row: ConfigImpressaoPiRow;
  onSaved: () => void;
}) {
  const meta = ROTULO[row.papel];
  const [wsPublicUrl, setWsPublicUrl] = useState(row.ws_public_url);
  const [wsToken, setWsToken] = useState(row.ws_token);
  const [cupsQueue, setCupsQueue] = useState(row.cups_queue);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [statusOk, setStatusOk] = useState<boolean | null>(null);

  useEffect(() => {
    setWsPublicUrl(row.ws_public_url);
    setWsToken(row.ws_token);
    setCupsQueue(row.cups_queue);
  }, [row.ws_public_url, row.ws_token, row.cups_queue, row.updated_at]);

  const salvar = async () => {
    setSaving(true);
    try {
      await updateConfigImpressaoPi(row.papel, {
        ws_public_url: wsPublicUrl.trim(),
        ws_token: wsToken.trim(),
        cups_queue: cupsQueue.trim(),
      });
      onSaved();
    } catch (e: unknown) {
      alert(errMessage(e, 'Erro ao salvar'));
    } finally {
      setSaving(false);
    }
  };

  const verificar = useCallback(async () => {
    setChecking(true);
    setStatusMsg(null);
    setStatusOk(null);
    try {
      const res = await fetch(`/api/impressoras/status?papel=${encodeURIComponent(row.papel)}`, {
        cache: 'no-store',
      });
      const body = (await res.json()) as { online?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setStatusOk(false);
        setStatusMsg(body.error || `HTTP ${res.status}`);
        return;
      }
      setStatusOk(Boolean(body.online));
      setStatusMsg(body.message || (body.online ? 'Online' : 'Offline'));
    } catch (e: unknown) {
      setStatusOk(false);
      setStatusMsg(errMessage(e, 'Falha na verificação'));
    } finally {
      setChecking(false);
    }
  }, [row.papel]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 pb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Server className="w-5 h-5 text-emerald-700" />
            {meta.titulo}
          </h2>
          <p className="text-sm text-gray-600 mt-1 max-w-xl">{meta.descricao}</p>
          <p className="text-xs text-gray-400 mt-2">
            Atualizado: {new Date(row.updated_at).toLocaleString('pt-BR')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void verificar()}
            disabled={checking}
          >
            {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            <span className="ml-1">Verificar agora</span>
          </Button>
        </div>
      </div>

      {statusMsg !== null && (
        <p
          className={`text-sm rounded-lg px-3 py-2 border ${
            statusOk === true
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}
        >
          <strong>{statusOk === true ? 'Online' : 'Offline / indisponível'}:</strong> {statusMsg}
        </p>
      )}

      {statusMsg !== null && statusOk !== true && mensagemIndicaTunnelMorto(statusMsg) && (
        <div className="text-sm rounded-lg px-3 py-2 border border-blue-200 bg-blue-50 text-blue-950 space-y-2">
          <p className="font-medium text-blue-900">O que significa ENOTFOUND aqui</p>
          <p className="text-blue-900/90 leading-relaxed">
            O app lê a URL <strong className="font-mono text-xs">wss://…</strong> abaixo (Supabase) e testa o host na
            internet. <strong>ENOTFOUND</strong> = esse hostname <strong>não existe mais no DNS</strong> — típico do
            túnel <strong>quick</strong> Cloudflare (<code className="text-[11px]">*.trycloudflare.com</code>) depois de
            reiniciar o <code className="text-[11px]">cloudflared</code>: cada subdomínio é novo.
          </p>
          <ul className="list-disc pl-5 text-blue-900/90 space-y-1">
            <li>
              No Raspberry: <code className="text-[11px]">journalctl -u cloudflared-pi-print-ws -n 30 --no-pager</code>{' '}
              (ou o serviço do túnel) e copie a URL <code className="text-[11px]">https://…trycloudflare.com</code>{' '}
              atual; converta para <code className="text-[11px]">wss://…</code> e <strong>Salve</strong> aqui, ou deixe o
              script de sync (<code className="text-[11px]">PI_TUNNEL_SYNC_SECRET</code>) atualizar o banco.
            </li>
            <li>
              Em <strong>localhost</strong> a verificação usa o <strong>mesmo</strong> registro no Supabase que produção
              — não é a impressora USB; é só o túnel público que está desatualizado.
            </li>
          </ul>
          <p className="text-xs text-blue-800/90">
            Doc: <code className="text-[11px]">docs/IMPRESSAO_PI_ACESSO_REMOTO.md</code>
          </p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">URL pública WebSocket (wss://)</label>
          <Input
            value={wsPublicUrl}
            onChange={(e) => setWsPublicUrl(e.target.value)}
            placeholder="wss://seu-tunel.example.com"
            className="font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Túnel Cloudflare ou hostname fixo. O sync automático do Pi atualiza este campo (RPC) para o papel certo.
          </p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Token da ponte (PRINT_WS_TOKEN)</label>
          <Input
            type="password"
            value={wsToken}
            onChange={(e) => setWsToken(e.target.value)}
            placeholder="Mesmo valor do .env no Raspberry"
            className="font-mono text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fila CUPS (opcional)</label>
          <Input
            value={cupsQueue}
            onChange={(e) => setCupsQueue(e.target.value)}
            placeholder="ZebraZD220"
            className="font-mono text-sm"
          />
        </div>
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
        <strong>Segredo do túnel</strong> (<code className="text-[11px]">PI_TUNNEL_SYNC_SECRET</code>) fica só no banco —
        copie via SQL Editor: consulta em <code className="text-[11px]">docs/consultas-sql/config-impressao-pi.sql</code>{' '}
        (filtro por <code className="text-[11px]">papel</code>).
      </p>

      <Button variant="primary" onClick={() => void salvar()} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Salvar alterações
      </Button>
    </div>
  );
}

export default function ImpressorasConfigPage() {
  const [rows, setRows] = useState<ConfigImpressaoPiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const list = await listConfigsImpressaoPi();
      setRows(list);
    } catch (e: unknown) {
      setErr(errMessage(e, 'Erro ao carregar configurações'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/configuracoes/perfil"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar às configurações
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-emerald-100 rounded-lg flex items-center justify-center">
          <Printer className="w-5 h-5 text-emerald-800" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Impressoras (Pi / Zebra)</h1>
          <p className="text-sm text-gray-500">
            Duas pontes: estoque e indústria. Cada Raspberry usa o segredo da sua linha no Supabase.
          </p>
        </div>
      </div>

      <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50/90 px-4 py-3 text-sm text-indigo-950">
        <p className="font-medium text-indigo-900">URL estável (recomendado em produção)</p>
        <p className="mt-1 text-indigo-900/90 leading-relaxed">
          O túnel <strong>quick</strong> Cloudflare muda o endereço a cada reinício; o Pi pode{' '}
          <strong>atualizar o Supabase sozinho</strong> com o script <code className="text-[11px]">cloudflared-quick-tunnel-sync.sh</code>{' '}
          (sem copiar URL no app). Para um <strong>mesmo</strong> <code className="text-[11px]">wss://</code> sempre, use{' '}
          <strong>túnel nomeado</strong> no Cloudflare Zero Trust — guia no repositório:{' '}
          <a
            href="https://github.com/mdappsconsult/estoque-app/blob/main/docs/TUNEL_PERMANENTE_PRINT_PI.md"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 font-mono text-[13px]"
          >
            docs/TUNEL_PERMANENTE_PRINT_PI.md
          </a>
          .
        </p>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-gray-600 py-12 justify-center">
          <Loader2 className="w-6 h-6 animate-spin" />
          Carregando…
        </div>
      )}

      {!loading && err && (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm mb-4">{err}</div>
      )}

      {!loading && !err && rows.length === 0 && (
        <p className="text-gray-600 text-sm">
          Nenhuma linha encontrada. Aplique a migração <code className="text-xs">20260406120000_config_impressao_pi_papel.sql</code>{' '}
          no Supabase.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="space-y-8">
          {rows.map((r) => (
            <ImpressoraCard key={r.papel} row={r} onSaved={() => void carregar()} />
          ))}
        </div>
      )}
    </div>
  );
}
