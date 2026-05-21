'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle,
  Loader2,
  QrCode,
  Store,
  Truck,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import QRScanner from '@/components/QRScanner';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import {
  coletarBaldeVencidoNaLoja,
  contarBaldesVencidosNaLoja,
  type ColetarBaldeVencidoResultado,
} from '@/lib/services/retorno-baldes-loja';
import { errMessage } from '@/lib/errMessage';
import type { Local } from '@/types/database';

type ColetadoSessao = ColetarBaldeVencidoResultado & { coletadoEm: string };

function formatarValidade(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export default function ColetaBaldesLojaPage() {
  const { usuario } = useAuth();
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });

  const lojas = useMemo(() => locais.filter((l) => l.tipo === 'STORE'), [locais]);
  const warehouses = useMemo(() => locais.filter((l) => l.tipo === 'WAREHOUSE'), [locais]);

  const defaultIndustriaId = useMemo(() => {
    if (warehouses.length === 0) return '';
    const byUser = usuario?.local_padrao_id?.trim();
    if (byUser && warehouses.some((w) => w.id === byUser)) return byUser;
    const industria = warehouses.find((w) => /ind[uú]stria/i.test(w.nome));
    return industria?.id ?? warehouses[0]!.id;
  }, [warehouses, usuario?.local_padrao_id]);

  const [lojaId, setLojaId] = useState('');
  const [localIndustriaId, setLocalIndustriaId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const [vencidosNaLoja, setVencidosNaLoja] = useState<number | null>(null);
  const [carregandoContagem, setCarregandoContagem] = useState(false);
  const [coletados, setColetados] = useState<ColetadoSessao[]>([]);
  const [ultimo, setUltimo] = useState<ColetarBaldeVencidoResultado | null>(null);

  useEffect(() => {
    if (!defaultIndustriaId) return;
    setLocalIndustriaId((prev) => (prev ? prev : defaultIndustriaId));
  }, [defaultIndustriaId]);

  const recarregarContagem = useCallback(async () => {
    if (!lojaId) {
      setVencidosNaLoja(null);
      return;
    }
    setCarregandoContagem(true);
    try {
      const n = await contarBaldesVencidosNaLoja(lojaId);
      setVencidosNaLoja(n);
    } catch {
      setVencidosNaLoja(null);
    } finally {
      setCarregandoContagem(false);
    }
  }, [lojaId]);

  useEffect(() => {
    void recarregarContagem();
  }, [recarregarContagem]);

  const processarCodigo = async (raw: string) => {
    const t = raw.trim();
    if (!t || !usuario?.id) return;
    if (!lojaId) {
      setErro('Selecione a loja onde você está coletando.');
      return;
    }
    if (!localIndustriaId) {
      setErro('Selecione o armazém da indústria (destino).');
      return;
    }

    setProcessando(true);
    setErro('');
    setUltimo(null);
    try {
      const res = await coletarBaldeVencidoNaLoja({
        codigoQr: t,
        lojaId,
        localIndustriaId,
        usuarioId: usuario.id,
      });
      setUltimo(res);
      setColetados((prev) => [{ ...res, coletadoEm: new Date().toISOString() }, ...prev]);
      setTokenInput('');
      await recarregarContagem();
    } catch (e: unknown) {
      setErro(errMessage(e, 'Falha na coleta.'));
    } finally {
      setProcessando(false);
    }
  };

  const nomeLoja = lojas.find((l) => l.id === lojaId)?.nome ?? '—';

  return (
    <div className="max-w-lg mx-auto space-y-5 px-1 sm:px-0">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-sky-100 rounded-lg flex items-center justify-center shrink-0">
          <Truck className="w-5 h-5 text-sky-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Coleta — baldes vencidos</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Na loja: bipe só baldes vencidos. Eles entram no estoque da indústria aguardando triagem.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950">
        Depois da coleta, na indústria use{' '}
        <Link href="/retorno-baldes-industria" className="font-semibold underline">
          Triagem — baldes das lojas
        </Link>{' '}
        (caixa ou descarte) e só então{' '}
        <Link href="/producao-envase-caixa" className="font-semibold underline">
          Envase — caixas
        </Link>
        .
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <Select
          label="Loja (onde você está)"
          required
          value={lojaId}
          onChange={(e) => setLojaId(e.target.value)}
          options={[{ value: '', label: 'Selecione a loja…' }, ...lojas.map((l) => ({ value: l.id, label: l.nome }))]}
        />
        <Select
          label="Indústria destino"
          required
          value={localIndustriaId}
          onChange={(e) => setLocalIndustriaId(e.target.value)}
          disabled={Boolean(defaultIndustriaId)}
          options={[
            { value: '', label: 'Selecione…' },
            ...warehouses.map((w) => ({ value: w.id, label: w.nome })),
          ]}
        />
        {lojaId && (
          <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-900 flex items-center justify-between gap-2">
            <span>
              Vencidos nesta loja:{' '}
              {carregandoContagem ? (
                <Loader2 className="inline w-4 h-4 animate-spin" />
              ) : (
                <strong>{vencidosNaLoja ?? '—'}</strong>
              )}
            </span>
            <Badge variant="error">só estes entram na coleta</Badge>
          </div>
        )}
      </div>

      {ultimo && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 space-y-1">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-5 h-5 shrink-0" />
            Coletado — enviado para estoque da indústria (aguarda triagem)
          </div>
          <p>
            {ultimo.produtoNome} ·{' '}
            <span className="font-mono">{ultimo.tokenShort || ultimo.tokenQr.slice(0, 12)}</span>
          </p>
          <p className="text-xs opacity-90">
            De: {ultimo.lojaNome} · Val.: {formatarValidade(ultimo.dataValidade)}
          </p>
          <Link
            href="/retorno-baldes-industria"
            className="inline-flex items-center gap-1 text-xs font-semibold text-green-800 underline mt-1"
          >
            Ir para triagem na indústria <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <QrCode className="w-4 h-4" /> Bipar balde vencido
        </p>
        {!lojaId && (
          <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            Selecione a loja antes de escanear.
          </p>
        )}
        <QRScanner
          onScan={(code) => void processarCodigo(code)}
          label="Ativar leitor de QR (câmera)"
        />
        {!mostrarManual ? (
          <Button type="button" variant="outline" className="w-full" onClick={() => setMostrarManual(true)}>
            Digitar código manualmente
          </Button>
        ) : (
          <div className="flex gap-2">
            <Input
              placeholder="Token ou QR"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void processarCodigo(tokenInput)}
            />
            <Button
              type="button"
              variant="primary"
              onClick={() => void processarCodigo(tokenInput)}
              disabled={processando || !lojaId}
            >
              {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Coletar'}
            </Button>
          </div>
        )}
        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>
        )}
      </div>

      {coletados.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Store className="w-4 h-4" />
            Coletados nesta sessão ({coletados.length}) — {nomeLoja}
          </p>
          <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 text-xs">
            {coletados.map((c) => (
              <li key={`${c.itemId}-${c.coletadoEm}`} className="py-2 flex justify-between gap-2">
                <span className="font-mono truncate">{c.tokenShort || c.tokenQr}</span>
                <span className="text-gray-500 shrink-0">{formatarValidade(c.dataValidade)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
