'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck, Loader2, AlertTriangle, CheckCircle, X, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import {
  criarEnvioDiretoProducao,
  cancelarEnvioDiretoSemBips,
  listarDemandaBaldesProducaoPorLoja,
  listarEnviosDiretosEmAndamento,
  type DemandaPorLojaRow,
  type EnvioDiretoResumo,
} from '@/lib/services/envio-direto-producao';

interface LocalLoja {
  id: string;
  nome: string;
}

interface ProdutoBalde {
  id: string;
  nome: string;
}

export default function EnvioDiretoProducaoPage() {
  const { usuario } = useAuth();
  const [warehouses, setWarehouses] = useState<LocalLoja[]>([]);
  const [stores, setStores] = useState<LocalLoja[]>([]);
  const [produtosBaldes, setProdutosBaldes] = useState<ProdutoBalde[]>([]);
  const [origemId, setOrigemId] = useState('');
  const [lojaId, setLojaId] = useState('');
  const [produtoId, setProdutoId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [demanda, setDemanda] = useState<DemandaPorLojaRow[]>([]);
  const [envios, setEnvios] = useState<EnvioDiretoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const recarregarPaineis = useCallback(
    async (origem: string) => {
      if (!origem) {
        setDemanda([]);
        setEnvios([]);
        return;
      }
      try {
        const [d, e] = await Promise.all([
          listarDemandaBaldesProducaoPorLoja(origem),
          listarEnviosDiretosEmAndamento(origem),
        ]);
        setDemanda(d);
        setEnvios(e);
      } catch (err) {
        console.error('Falha ao carregar painel envio direto:', err);
      }
    },
    []
  );

  useEffect(() => {
    let ativo = true;
    const carregar = async () => {
      setCarregando(true);
      try {
        const [{ data: locais, error: eL }, { data: prods, error: eP }] = await Promise.all([
          supabase
            .from('locais')
            .select('id, nome, tipo')
            .eq('status', 'ativo')
            .order('nome', { ascending: true }),
          supabase
            .from('produtos')
            .select('id, nome')
            .eq('status', 'ativo')
            .eq('origem', 'PRODUCAO')
            .order('nome', { ascending: true }),
        ]);
        if (eL) throw eL;
        if (eP) throw eP;
        if (!ativo) return;
        const ws = (locais || [])
          .filter((l) => (l as { tipo: string }).tipo === 'WAREHOUSE')
          .map((l) => ({ id: (l as { id: string }).id, nome: (l as { nome: string }).nome }));
        const ss = (locais || [])
          .filter((l) => (l as { tipo: string }).tipo === 'STORE')
          .map((l) => ({ id: (l as { id: string }).id, nome: (l as { nome: string }).nome }));
        setWarehouses(ws);
        setStores(ss);
        setProdutosBaldes(
          (prods || []).map((p) => ({ id: (p as { id: string }).id, nome: (p as { nome: string }).nome }))
        );

        const padrao = usuario?.local_padrao_id?.trim();
        const origemInicial = padrao && ws.some((w) => w.id === padrao) ? padrao : ws[0]?.id || '';
        setOrigemId(origemInicial);
        if (origemInicial) {
          await recarregarPaineis(origemInicial);
        }
      } catch (err) {
        if (ativo) setErro(errMessage(err, 'Falha ao carregar dados.'));
      } finally {
        if (ativo) setCarregando(false);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [usuario?.local_padrao_id, recarregarPaineis]);

  useEffect(() => {
    if (origemId) void recarregarPaineis(origemId);
  }, [origemId, recarregarPaineis]);

  const carregarDaDemanda = (row: DemandaPorLojaRow) => {
    setLojaId(row.lojaId);
    setProdutoId(row.produtoId);
    setQuantidade(String(row.faltante));
    setAviso(null);
    setErro('');
  };

  const podeCriar = useMemo(() => {
    const q = Math.floor(Number(quantidade));
    return Boolean(origemId && lojaId && produtoId && Number.isFinite(q) && q >= 1);
  }, [origemId, lojaId, produtoId, quantidade]);

  const criar = async () => {
    if (!usuario || !podeCriar) return;
    const q = Math.floor(Number(quantidade));
    setErro('');
    setAviso(null);
    setCriando(true);
    try {
      const { transferenciaId } = await criarEnvioDiretoProducao({
        origemId,
        destinoId: lojaId,
        produtoId,
        quantidade: q,
        criadoPor: usuario.id,
      });
      setAviso(
        `Envio criado (${q} unidade(s)). Leve os baldes para a loja; a loja vai bipar cada QR para registrar o recebimento. (ID: ${transferenciaId.slice(0, 8)}…)`
      );
      setLojaId('');
      setProdutoId('');
      setQuantidade('');
      await recarregarPaineis(origemId);
    } catch (err) {
      setErro(errMessage(err, 'Erro ao criar o envio.'));
    } finally {
      setCriando(false);
    }
  };

  const cancelarEnvio = async (id: string) => {
    if (!usuario) return;
    const ok = window.confirm('Cancelar este envio antes de qualquer bip da loja?');
    if (!ok) return;
    setErro('');
    try {
      await cancelarEnvioDiretoSemBips(id, usuario.id);
      await recarregarPaineis(origemId);
    } catch (err) {
      setErro(errMessage(err, 'Erro ao cancelar.'));
    }
  };

  if (carregando) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Truck className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Envio direto da produção</h1>
          <p className="text-sm text-gray-500">
            Só baldes/caixas de produção. A loja bipa cada QR na chegada.
          </p>
        </div>
      </div>

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-900">{erro}</p>
          <button onClick={() => setErro('')} className="ml-auto" aria-label="Fechar">
            <X className="w-4 h-4 text-red-700" />
          </button>
        </div>
      )}

      {aviso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <p className="text-sm text-green-900">{aviso}</p>
          <button onClick={() => setAviso(null)} className="ml-auto" aria-label="Fechar">
            <X className="w-4 h-4 text-green-700" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Demanda das lojas</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          Mostra o que cada loja está pedindo (mínimo cadastrado − estoque atual). Toque em uma
          linha para preencher o formulário abaixo.
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select
              label="Indústria de origem"
              value={origemId}
              onChange={(e) => setOrigemId(e.target.value)}
              options={warehouses.map((w) => ({ value: w.id, label: w.nome }))}
            />
          </div>
        </div>

        {demanda.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhuma loja com falta de baldes de produção neste momento.
          </p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="min-w-[520px] w-full text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-600">
                  <th className="py-1 px-2 font-medium">Loja</th>
                  <th className="py-1 px-2 font-medium">Produto</th>
                  <th className="py-1 px-2 font-medium text-right">Min</th>
                  <th className="py-1 px-2 font-medium text-right">Atual</th>
                  <th className="py-1 px-2 font-medium text-right">Falta</th>
                  <th className="py-1 px-2 font-medium text-right">Indústria</th>
                  <th className="py-1 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {demanda.map((row) => (
                  <tr
                    key={`${row.lojaId}|${row.produtoId}`}
                    className="border-b border-gray-100 hover:bg-blue-50/40"
                  >
                    <td className="py-1.5 px-2 text-gray-800 max-w-[140px] truncate" title={row.lojaNome}>
                      {row.lojaNome}
                    </td>
                    <td className="py-1.5 px-2 text-gray-800 max-w-[160px] truncate" title={row.produtoNome}>
                      {row.produtoNome}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums">{row.estoqueMinimo}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-gray-700">
                      {row.estoqueAtualLoja}
                    </td>
                    <td className="py-1.5 px-2 text-right tabular-nums font-semibold text-red-700">
                      {row.faltante}
                    </td>
                    <td
                      className={`py-1.5 px-2 text-right tabular-nums ${
                        row.estoqueIndustria < row.faltante ? 'text-amber-700' : 'text-gray-700'
                      }`}
                      title={
                        row.estoqueIndustria < row.faltante
                          ? `Só ${row.estoqueIndustria} disponíveis na indústria — produzir mais antes de enviar tudo`
                          : 'Saldo na indústria selecionada'
                      }
                    >
                      {row.estoqueIndustria}
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => carregarDaDemanda(row)}
                        title="Pré-preencher o formulário abaixo"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Enviar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Criar envio</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          A indústria só informa <strong>loja</strong>, <strong>produto</strong> e <strong>quantidade</strong>. Os
          QRs específicos serão vinculados pela loja ao bipar cada balde na chegada.
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          <Select
            label="Loja de destino"
            value={lojaId}
            onChange={(e) => setLojaId(e.target.value)}
            options={[
              { value: '', label: 'Selecione a loja…' },
              ...stores.map((s) => ({ value: s.id, label: s.nome })),
            ]}
          />
          <Select
            label="Produto (balde / caixa de produção)"
            value={produtoId}
            onChange={(e) => setProdutoId(e.target.value)}
            options={[
              { value: '', label: 'Selecione…' },
              ...produtosBaldes.map((p) => ({ value: p.id, label: p.nome })),
            ]}
          />
        </div>
        <Input
          label="Quantidade de baldes a enviar"
          type="number"
          min={1}
          step={1}
          value={quantidade}
          onChange={(e) => setQuantidade(e.target.value)}
          placeholder="Ex.: 20"
        />
        <Button
          variant="primary"
          className="w-full sm:w-auto"
          disabled={!podeCriar || criando}
          onClick={() => void criar()}
        >
          {criando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Criar envio
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-800">Envios em andamento</h2>
        {envios.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum envio direto aberto.</p>
        ) : (
          <ul className="space-y-2">
            {envios.map((e) => {
              const completo = e.bipados >= e.quantidadeDemandada;
              return (
                <li
                  key={e.id}
                  className="border border-gray-200 rounded-lg px-3 py-2 flex flex-wrap items-center gap-2 sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate" title={`${e.origemNome} → ${e.destinoNome}`}>
                      {e.origemNome} → {e.destinoNome}
                    </p>
                    <p className="text-xs text-gray-600 truncate" title={e.produtoNome}>
                      {e.produtoNome}
                    </p>
                  </div>
                  <div className="text-xs text-gray-700 whitespace-nowrap">
                    <span className={`font-semibold ${completo ? 'text-green-700' : 'text-blue-700'}`}>
                      {e.bipados}
                    </span>
                    {' / '}
                    {e.quantidadeDemandada}
                  </div>
                  <div className="text-[11px] text-gray-500 whitespace-nowrap">
                    {new Date(e.criadoEm).toLocaleString('pt-BR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                  {e.bipados === 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void cancelarEnvio(e.id)}
                      title="Cancelar envio (nenhum balde bipado ainda)"
                    >
                      <X className="w-3.5 h-3.5 mr-1" /> Cancelar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
