'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Boxes,
  CheckCircle,
  Loader2,
  PackageX,
  QrCode,
  RefreshCw,
  Truck,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import QRScanner from '@/components/QRScanner';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { getItemPorCodigoEscaneado, type ItemCompleto } from '@/lib/services/itens';
import {
  listarFilaAguardandoTriagem,
  listarHistoricoRetornoRecentes,
  MOTIVOS_DESCARTE_PADRAO,
  triagemBaldeRetornoLoja,
  type FilaTriagemRow,
  type LinhaHistoricoRetorno,
  type TriagemBaldeRetornoResultado,
} from '@/lib/services/retorno-baldes-loja';
import { errMessage } from '@/lib/errMessage';
import type { Local } from '@/types/database';

function formatarValidade(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function labelAcaoHistorico(acao: string): { texto: string; variant: 'success' | 'error' | 'info' | 'warning' } {
  if (acao === 'COLETA_BALDE_VENCIDO_LOJA') return { texto: 'Coleta', variant: 'info' };
  if (acao === 'TRIAGEM_BALDE_APROVADO_ENVASE') return { texto: 'Aprovado caixa', variant: 'success' };
  if (acao === 'TRIAGEM_BALDE_DESCARTE') return { texto: 'Descartado', variant: 'error' };
  return { texto: acao, variant: 'warning' };
}

export default function RetornoBaldesIndustriaPage() {
  const { usuario } = useAuth();
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });

  const warehouses = useMemo(() => locais.filter((l) => l.tipo === 'WAREHOUSE'), [locais]);
  const defaultWarehouseId = useMemo(() => {
    if (warehouses.length === 0) return '';
    const byUser = usuario?.local_padrao_id?.trim();
    if (byUser && warehouses.some((w) => w.id === byUser)) return byUser;
    const industria = warehouses.find((w) => /ind[uú]stria/i.test(w.nome));
    return industria?.id ?? warehouses[0]!.id;
  }, [warehouses, usuario?.local_padrao_id]);

  const [localId, setLocalId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState('');
  const [itemPreview, setItemPreview] = useState<ItemCompleto | null>(null);
  const [lojaOrigemPreview, setLojaOrigemPreview] = useState('');
  const [ultimoResultado, setUltimoResultado] = useState<TriagemBaldeRetornoResultado | null>(null);
  const [motivoDescarte, setMotivoDescarte] = useState('Produto vencido');
  const [motivoOutro, setMotivoOutro] = useState('');
  const [fila, setFila] = useState<FilaTriagemRow[]>([]);
  const [historico, setHistorico] = useState<LinhaHistoricoRetorno[]>([]);
  const [carregandoFila, setCarregandoFila] = useState(false);

  useEffect(() => {
    if (!defaultWarehouseId) return;
    setLocalId((prev) => (prev ? prev : defaultWarehouseId));
  }, [defaultWarehouseId]);

  const recarregarDados = useCallback(async () => {
    if (!localId) return;
    setCarregandoFila(true);
    try {
      const [f, h] = await Promise.all([
        listarFilaAguardandoTriagem(localId),
        listarHistoricoRetornoRecentes(localId),
      ]);
      setFila(f);
      setHistorico(h);
    } catch {
      setFila([]);
      setHistorico([]);
    } finally {
      setCarregandoFila(false);
    }
  }, [localId]);

  useEffect(() => {
    void recarregarDados();
  }, [recarregarDados]);

  const limparPreview = () => {
    setItemPreview(null);
    setLojaOrigemPreview('');
    setTokenInput('');
    setErro('');
  };

  const buscarItem = async (raw: string) => {
    const t = raw.trim();
    if (!t || !localId) return;
    setBuscando(true);
    setErro('');
    setUltimoResultado(null);
    setItemPreview(null);
    setLojaOrigemPreview('');
    try {
      const item = await getItemPorCodigoEscaneado(t);
      if (!item) {
        setErro('QR não encontrado.');
        return;
      }
      if (item.retorno_balde_status !== 'AGUARDANDO_TRIAGEM') {
        if (item.retorno_balde_status === 'APROVADO_ENVASE') {
          setErro('Este balde já foi aprovado para caixa. Use «Envase — caixas».');
        } else if (!item.retorno_balde_status) {
          setErro('Este balde não veio de coleta de retorno. Colete na loja primeiro.');
        } else {
          setErro('Este balde não está aguardando triagem.');
        }
        return;
      }
      if (item.local_atual_id !== localId) {
        setErro('Este balde não está neste armazém da indústria.');
        return;
      }
      const filaRow = fila.find((f) => f.id === item.id);
      setLojaOrigemPreview(filaRow?.loja_origem_nome ?? '—');
      setItemPreview(item);
      setTokenInput('');
    } catch (e: unknown) {
      setErro(errMessage(e, 'Erro ao buscar o QR.'));
    } finally {
      setBuscando(false);
    }
  };

  const confirmarTriagem = async (destino: 'ENVASE' | 'DESCARTE') => {
    if (!itemPreview || !usuario?.id || !localId) return;

    const motivo =
      destino === 'DESCARTE'
        ? motivoDescarte === 'Outro'
          ? motivoOutro.trim()
          : motivoDescarte
        : undefined;

    if (destino === 'DESCARTE' && !motivo) {
      setErro('Informe o motivo do descarte.');
      return;
    }

    const msgConfirm =
      destino === 'ENVASE'
        ? 'Aprovar este balde para envase (caixa)?'
        : `Descartar este balde?\nMotivo: ${motivo}`;
    if (!window.confirm(msgConfirm)) return;

    setProcessando(true);
    setErro('');
    try {
      const res = await triagemBaldeRetornoLoja({
        codigoQr: itemPreview.token_qr,
        destino,
        localIndustriaId: localId,
        usuarioId: usuario.id,
        motivoDescarte: motivo,
      });
      setUltimoResultado(res);
      limparPreview();
      await recarregarDados();
    } catch (e: unknown) {
      setErro(errMessage(e, 'Falha na triagem.'));
    } finally {
      setProcessando(false);
    }
  };

  const motivoOptions = MOTIVOS_DESCARTE_PADRAO.map((m) => ({ value: m, label: m }));

  return (
    <div className="max-w-lg mx-auto space-y-5 px-1 sm:px-0">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center shrink-0">
          <Boxes className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Triagem — baldes das lojas</h1>
          <p className="text-sm text-gray-600 mt-0.5">
            Na indústria: conferir baldes coletados e decidir caixa ou descarte.
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50/90 p-3 text-sm text-sky-950 flex flex-col gap-2">
        <span className="flex items-start gap-2">
          <Truck className="w-4 h-4 shrink-0 mt-0.5" />
          Baldes chegam aqui depois da{' '}
          <Link href="/coleta-baldes-loja" className="font-semibold underline">
            Coleta na loja
          </Link>
          .
        </span>
        <Link
          href="/producao-envase-caixa"
          className="inline-flex items-center gap-1 font-semibold text-emerald-800 underline"
        >
          Aprovados para caixa → Envase — caixas <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <Select
          label="Armazém da indústria"
          value={localId}
          onChange={(e) => setLocalId(e.target.value)}
          disabled={Boolean(defaultWarehouseId)}
          options={[{ value: '', label: 'Selecione…' }, ...warehouses.map((w) => ({ value: w.id, label: w.nome }))]}
        />
      </div>

      <div className="bg-white rounded-xl border border-orange-200 p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-sm font-semibold text-gray-900">
            Aguardando triagem ({fila.length})
          </p>
          <Button
            type="button"
            variant="ghost"
            className="h-8 px-2 text-xs"
            onClick={() => void recarregarDados()}
            disabled={carregandoFila}
          >
            {carregandoFila ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </Button>
        </div>
        {fila.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum balde pendente. Colete vencidos nas lojas primeiro.</p>
        ) : (
          <ul className="max-h-40 overflow-y-auto divide-y divide-gray-100 text-xs">
            {fila.map((f) => (
              <li key={f.id} className="py-2 flex flex-col gap-0.5">
                <span className="font-medium text-gray-900">{f.produto_nome}</span>
                <span className="flex justify-between gap-2 text-gray-600">
                  <span className="font-mono truncate">{f.token_short || f.token_qr.slice(0, 12)}</span>
                  <span className="shrink-0">Val. {formatarValidade(f.data_validade)}</span>
                </span>
                <span className="text-gray-500">De: {f.loja_origem_nome}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {ultimoResultado && (
        <div
          className={`rounded-xl border p-4 text-sm space-y-1 ${
            ultimoResultado.destino === 'ENVASE'
              ? 'border-green-200 bg-green-50 text-green-900'
              : 'border-yellow-200 bg-yellow-50 text-yellow-900'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle className="w-5 h-5 shrink-0" />
            {ultimoResultado.destino === 'ENVASE'
              ? 'Aprovado para caixa — use Envase — caixas'
              : 'Balde descartado'}
          </div>
          <p>
            {ultimoResultado.produtoNome} ·{' '}
            <span className="font-mono">{ultimoResultado.tokenShort || ultimoResultado.tokenQr.slice(0, 12)}</span>
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <QrCode className="w-4 h-4" /> Bipar balde da fila
        </p>
        <QRScanner onScan={(code) => void buscarItem(code)} label="Ativar leitor de QR (câmera)" />
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
              onKeyDown={(e) => e.key === 'Enter' && void buscarItem(tokenInput)}
            />
            <Button type="button" variant="primary" onClick={() => void buscarItem(tokenInput)} disabled={buscando}>
              {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
            </Button>
          </div>
        )}
        {erro && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{erro}</p>
        )}
      </div>

      {itemPreview && (
        <div className="bg-white rounded-xl border-2 border-amber-300 p-4 space-y-4 shadow-sm">
          <div>
            <p className="text-lg font-bold text-gray-900">{itemPreview.produto?.nome}</p>
            <p className="text-sm font-mono text-gray-500">{itemPreview.token_short || itemPreview.token_qr}</p>
            <div className="flex flex-wrap gap-2 mt-2">
              <Badge variant="warning">Aguardando triagem</Badge>
              {lojaOrigemPreview && <Badge variant="info">De: {lojaOrigemPreview}</Badge>}
            </div>
            <p className="text-sm text-gray-600 mt-2">
              Validade: <strong>{formatarValidade(itemPreview.data_validade)}</strong>
            </p>
          </div>

          <div className="space-y-2 border-t border-gray-100 pt-3">
            <p className="text-sm font-medium text-gray-800">Decisão</p>
            <Button
              type="button"
              variant="primary"
              className="w-full min-h-[48px] bg-emerald-600 hover:bg-emerald-700"
              disabled={processando}
              onClick={() => void confirmarTriagem('ENVASE')}
            >
              {processando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Boxes className="w-4 h-4 mr-2" />}
              Aprovar para caixa
            </Button>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50/50 p-3 space-y-2">
              <Select
                label="Motivo (se descartar)"
                value={motivoDescarte}
                onChange={(e) => setMotivoDescarte(e.target.value)}
                options={motivoOptions}
              />
              {motivoDescarte === 'Outro' && (
                <Input label="Descreva" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} />
              )}
              <Button
                type="button"
                variant="outline"
                className="w-full min-h-[48px] border-yellow-400 text-yellow-900 hover:bg-yellow-100"
                disabled={processando}
                onClick={() => void confirmarTriagem('DESCARTE')}
              >
                {processando ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <PackageX className="w-4 h-4 mr-2" />
                )}
                Descartar
              </Button>
            </div>
            <Button type="button" variant="ghost" className="w-full text-gray-500" onClick={limparPreview}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-900 mb-3">Histórico recente</p>
        {historico.length === 0 ? (
          <p className="text-xs text-gray-500">Nenhum registro ainda.</p>
        ) : (
          <ul className="max-h-48 overflow-y-auto divide-y divide-gray-100 text-xs">
            {historico.map((h) => {
              const det = (h.detalhes || {}) as Record<string, unknown>;
              const { texto, variant } = labelAcaoHistorico(h.acao);
              return (
                <li key={h.id} className="py-2 flex items-center justify-between gap-2">
                  <span className="text-gray-600 shrink-0">
                    {new Date(h.created_at).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    })}
                  </span>
                  <span className="flex-1 truncate text-gray-800">
                    {(det.loja_origem_nome as string) || '—'}
                  </span>
                  <Badge variant={variant}>{texto}</Badge>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
