'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Truck, Loader2, QrCode, CheckCircle, X, Wand2, Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/QRScanner';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { getItemPorCodigoEscaneado } from '@/lib/services/itens';
import { criarTransferencia } from '@/lib/services/transferencias';
import { criarViagem } from '@/lib/services/viagens';
import { getResumoReposicaoLoja } from '@/lib/services/reposicao-loja';
import { upsertEtiquetasSeparacaoLoja } from '@/lib/services/etiquetas';
import {
  confirmarImpressao,
  imprimirEtiquetasEmJobUnico,
  obterFormatoImpressaoPadrao,
} from '@/lib/printing/label-print';
import { supabase } from '@/lib/supabase';
import { Local } from '@/types/database';

interface ItemEscaneado {
  id: string;
  token_qr: string;
  token_short?: string | null;
  produto_nome: string;
  produto_id: string;
  data_validade?: string | null;
}

interface ResumoReposicaoTela {
  produto_id: string;
  produto_nome: string;
  estoque_minimo_loja: number;
  quantidade_contada: number;
  faltante: number;
  disponivel_origem: number;
}

export default function SepararPorLojaPage() {
  const { usuario } = useAuth();
  const { data: locais, loading } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const lojas = locais.filter(l => l.tipo === 'STORE');
  const warehouses = locais.filter(l => l.tipo === 'WAREHOUSE');

  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarEntradaManual, setMostrarEntradaManual] = useState(false);
  const [itensEscaneados, setItensEscaneados] = useState<ItemEscaneado[]>([]);
  const [modoSeparacao, setModoSeparacao] = useState<'reposicao' | 'manual'>('reposicao');
  const [resumoReposicao, setResumoReposicao] = useState<ResumoReposicaoTela[]>([]);
  const [carregandoReposicao, setCarregandoReposicao] = useState(false);
  const [aplicandoSugestao, setAplicandoSugestao] = useState(false);
  const [imprimindoEtiquetas, setImprimindoEtiquetas] = useState(false);
  const [mensagemReposicao, setMensagemReposicao] = useState('');
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  const faltantesPendentes = useMemo(
    () => resumoReposicao.filter((item) => item.faltante > 0),
    [resumoReposicao]
  );

  const carregarResumoReposicao = async () => {
    if (!origemId || !destinoId) return;
    setCarregandoReposicao(true);
    setMensagemReposicao('');
    try {
      const resumo = await getResumoReposicaoLoja(destinoId);
      const produtoIds = resumo.map((item) => item.produto_id);
      let disponivelPorProduto = new Map<string, number>();

      if (produtoIds.length > 0) {
        const { data: itensOrigem, error: itensError } = await supabase
          .from('itens')
          .select('produto_id')
          .eq('estado', 'EM_ESTOQUE')
          .eq('local_atual_id', origemId)
          .in('produto_id', produtoIds);
        if (itensError) throw itensError;

        disponivelPorProduto = new Map<string, number>();
        (itensOrigem || []).forEach((item) => {
          disponivelPorProduto.set(item.produto_id, (disponivelPorProduto.get(item.produto_id) || 0) + 1);
        });
      }

      const apenasFaltantes = resumo
        .map((item) => ({
          ...item,
          disponivel_origem: disponivelPorProduto.get(item.produto_id) || 0,
        }))
        .filter((item) => item.faltante > 0);
      setResumoReposicao(apenasFaltantes);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar a reposição');
    } finally {
      setCarregandoReposicao(false);
    }
  };

  const processarEscaneamento = async (codigo?: string) => {
    const raw = (codigo ?? tokenInput).trim();
    if (!raw) return;
    if (!origemId) {
      setErro('Selecione a origem (indústria) antes de escanear.');
      return;
    }
    setErro('');
    try {
      const item = await getItemPorCodigoEscaneado(raw);
      if (!item) {
        setErro('Item não encontrado. Confira o código e tente novamente.');
        return;
      }
      if (item.estado !== 'EM_ESTOQUE') {
        setErro('Item não está em estoque');
        return;
      }
      if (item.local_atual_id !== origemId) {
        setErro('Item não está no local de origem selecionado');
        return;
      }

      let adicionou = false;
      setItensEscaneados((prev) => {
        if (prev.some((i) => i.id === item.id)) {
          return prev;
        }
        adicionou = true;
        return [
          ...prev,
          {
            id: item.id,
            token_qr: item.token_qr,
            token_short: item.token_short,
            produto_id: item.produto_id,
            produto_nome: item.produto?.nome || '',
            data_validade: item.data_validade,
          },
        ];
      });

      if (!adicionou) {
        setErro('Item já escaneado nesta separação');
        return;
      }
      setTokenInput('');
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Não foi possível buscar o item. Tente novamente.');
    }
  };

  const removerItem = (id: string) => {
    setItensEscaneados(prev => prev.filter(i => i.id !== id));
  };

  const aplicarSugestaoReposicao = async () => {
    if (!origemId || !destinoId) return;
    if (faltantesPendentes.length === 0) {
      setMensagemReposicao('Nenhum faltante encontrado para esta loja.');
      return;
    }
    setAplicandoSugestao(true);
    setErro('');
    try {
      const produtosComFalta = faltantesPendentes
        .filter((item) => item.faltante > 0)
        .map((item) => item.produto_id);
      const { data: itensOrigem, error: itensError } = await supabase
        .from('itens')
        .select('id, token_qr, token_short, produto_id, data_validade, produto:produtos(nome)')
        .eq('estado', 'EM_ESTOQUE')
        .eq('local_atual_id', origemId)
        .in('produto_id', produtosComFalta)
        .order('created_at', { ascending: true });
      if (itensError) throw itensError;

      const porProduto = new Map<string, any[]>();
      (itensOrigem || []).forEach((item) => {
        const atual = porProduto.get(item.produto_id) || [];
        atual.push(item);
        porProduto.set(item.produto_id, atual);
      });

      const selecionados: ItemEscaneado[] = [];
      const pendencias: string[] = [];
      faltantesPendentes.forEach((resumo) => {
        const disponiveis = porProduto.get(resumo.produto_id) || [];
        const qtdSelecionada = Math.min(disponiveis.length, resumo.faltante);
        if (qtdSelecionada < resumo.faltante) {
          pendencias.push(`${resumo.produto_nome} (faltam ${resumo.faltante - qtdSelecionada})`);
        }
        disponiveis.slice(0, qtdSelecionada).forEach((item) => {
          selecionados.push({
            id: item.id,
            token_qr: item.token_qr,
            token_short: item.token_short,
            produto_id: item.produto_id,
            produto_nome: item.produto?.nome || resumo.produto_nome,
            data_validade: item.data_validade,
          });
        });
      });

      setItensEscaneados(selecionados);
      if (pendencias.length > 0) {
        setMensagemReposicao(`Sugestão aplicada com saldo insuficiente em: ${pendencias.join(', ')}.`);
      } else {
        setMensagemReposicao('Sugestão aplicada com sucesso.');
      }
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha ao aplicar sugestão de reposição');
    } finally {
      setAplicandoSugestao(false);
    }
  };

  const imprimirEtiquetasSeparacao = async () => {
    if (itensEscaneados.length === 0) return;
    const formato = obterFormatoImpressaoPadrao();
    if (!confirmarImpressao(itensEscaneados.length, formato)) return;

    setImprimindoEtiquetas(true);
    try {
      await upsertEtiquetasSeparacaoLoja(
        itensEscaneados.map((item) => ({
          id: item.id,
          produto_id: item.produto_id,
          data_validade: item.data_validade,
        })),
        { lote: 'SEPARACAO-LOJA', mode: 'impresso_agora' }
      );

      const nomeLojaDestino = lojas.find((l) => l.id === destinoId)?.nome || '—';
      const agora = new Date().toISOString();
      const abriu = imprimirEtiquetasEmJobUnico(
        itensEscaneados.map((item) => ({
          id: item.id,
          produtoNome: item.produto_nome,
          dataManipulacao: agora,
          dataValidade: item.data_validade || agora,
          lote: 'SEPARACAO-LOJA',
          tokenQr: item.token_qr,
          tokenShort: item.token_short || item.id.slice(0, 8).toUpperCase(),
          responsavel: usuario?.nome || 'OPERADOR',
          nomeLoja: nomeLojaDestino,
          dataGeracaoIso: agora,
        })),
        formato
      );
      if (!abriu) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setImprimindoEtiquetas(false);
    }
  };

  const criarSeparacao = async () => {
    if (!usuario) return alert('Faça login');
    const confirmou = window.confirm(
      `Confirmar criação da separação com ${itensEscaneados.length} item(ns)?`
    );
    if (!confirmou) return;
    setSaving(true);
    try {
      // Criar viagem
      const viagem = await criarViagem({ status: 'PENDING' });

      await upsertEtiquetasSeparacaoLoja(
        itensEscaneados.map((item) => ({
          id: item.id,
          produto_id: item.produto_id,
          data_validade: item.data_validade,
        })),
        { lote: `SEP-${viagem.id}`, mode: 'manter_impressa_se_existir' }
      );

      // Criar transferência
      await criarTransferencia(
        {
          tipo: 'WAREHOUSE_STORE',
          origem_id: origemId,
          destino_id: destinoId,
          viagem_id: viagem.id,
          criado_por: usuario.id,
          status: 'AWAITING_ACCEPT',
        },
        itensEscaneados.map(i => i.id)
      );

      setSucesso(true);
      setItensEscaneados([]);
      setDestinoId('');
      setResumoReposicao([]);
      setMensagemReposicao('');
      setMostrarEntradaManual(false);
    } catch (err: any) {
      alert(err?.message || 'Erro');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Separar por Loja</h1>
          <p className="text-sm text-gray-500">Warehouse → Store</p>
        </div>
      </div>

      {sucesso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div>
            <p className="font-semibold text-green-800">Separação criada!</p>
            <p className="text-sm text-green-600">Aguardando aceite do motorista</p>
          </div>
          <button onClick={() => setSucesso(false)} className="ml-auto"><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        <Select label="Origem (Indústria)" required options={[{ value: '', label: 'Selecione...' }, ...warehouses.map(l => ({ value: l.id, label: l.nome }))]} value={origemId} onChange={(e) => setOrigemId(e.target.value)} />
        <Select
          label="Destino (Loja)"
          required
          options={[{ value: '', label: 'Selecione...' }, ...lojas.map(l => ({ value: l.id, label: l.nome }))]}
          value={destinoId}
          onChange={(e) => {
            setDestinoId(e.target.value);
            setResumoReposicao([]);
            setMensagemReposicao('');
          }}
        />
      </div>

      {origemId && destinoId && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <Button
                variant={modoSeparacao === 'reposicao' ? 'primary' : 'outline'}
                onClick={() => setModoSeparacao('reposicao')}
              >
                Modo reposição
              </Button>
              <Button
                variant={modoSeparacao === 'manual' ? 'primary' : 'outline'}
                onClick={() => setModoSeparacao('manual')}
              >
                Modo manual
              </Button>
            </div>
            {modoSeparacao === 'reposicao' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-600 leading-relaxed">
                  O <strong>mínimo</strong> vem de{' '}
                  <Link href="/cadastros/reposicao-loja" className="text-blue-600 underline underline-offset-2">
                    Reposição de estoque por loja
                  </Link>
                  . A <strong>quantidade contada</strong> vem do que o funcionário informa em{' '}
                  <Link href="/contagem-loja" className="text-blue-600 underline underline-offset-2">
                    Declarar estoque na loja
                  </Link>
                  . O <strong>faltante</strong> é mínimo menos o que tem na loja. Use &quot;Carregar faltantes&quot; e
                  depois &quot;Aplicar sugestão automática&quot; para pré-selecionar itens na origem.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => void carregarResumoReposicao()} disabled={carregandoReposicao}>
                    {carregandoReposicao ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    Carregar faltantes da loja
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => void aplicarSugestaoReposicao()}
                    disabled={aplicandoSugestao || carregandoReposicao || resumoReposicao.length === 0}
                  >
                    {aplicandoSugestao ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Wand2 className="w-4 h-4 mr-2" />}
                    Aplicar sugestão automática
                  </Button>
                </div>
                {mensagemReposicao && <p className="text-xs text-gray-600">{mensagemReposicao}</p>}
                {resumoReposicao.length === 0 && !carregandoReposicao && (
                  <p className="text-xs text-gray-500">
                    Nenhum faltante para esta loja no momento.
                  </p>
                )}
                {resumoReposicao.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-56 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-left text-gray-600">
                            <th className="px-3 py-2">Produto</th>
                            <th className="px-3 py-2">Contado</th>
                            <th className="px-3 py-2">Mín.</th>
                            <th className="px-3 py-2">Falt.</th>
                            <th className="px-3 py-2">Origem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {resumoReposicao.map((linha) => (
                            <tr key={linha.produto_id} className="border-t border-gray-100">
                              <td className="px-3 py-2">{linha.produto_nome}</td>
                              <td className="px-3 py-2">{linha.quantidade_contada}</td>
                              <td className="px-3 py-2">{linha.estoque_minimo_loja}</td>
                              <td className="px-3 py-2 font-semibold">{linha.faltante}</td>
                              <td className="px-3 py-2">{linha.disponivel_origem}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Escanear QR do item</label>
            <QRScanner
              onScan={(code) => void processarEscaneamento(code)}
              label="Escanear com câmera"
              autoOpen={Boolean(origemId && destinoId)}
            />
            {!mostrarEntradaManual ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setMostrarEntradaManual(true)}
              >
                Não conseguiu ler? Digitar código
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite o código QR ou token curto"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && void processarEscaneamento()}
                  />
                  <Button variant="primary" onClick={() => void processarEscaneamento()} aria-label="Confirmar código">
                    <QrCode className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMostrarEntradaManual(false);
                    setTokenInput('');
                  }}
                >
                  Fechar digitação manual
                </Button>
              </div>
            )}
            {erro && <p className="text-sm text-red-500 mt-2">{erro}</p>}
          </div>

          {itensEscaneados.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-900">Itens separados</p>
                <Badge variant="info">{itensEscaneados.length} itens</Badge>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {itensEscaneados.map(item => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.produto_nome}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.token_qr}</p>
                    </div>
                    <button onClick={() => removerItem(item.id)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full mb-3"
            onClick={() => void imprimirEtiquetasSeparacao()}
            disabled={imprimindoEtiquetas || itensEscaneados.length === 0}
          >
            {imprimindoEtiquetas ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
            Imprimir etiquetas da separação
          </Button>
          <p className="text-xs text-gray-500 -mt-2 mb-3">
            Ao imprimir ou ao criar a separação, o sistema grava/atualiza a linha em <strong>etiquetas</strong> (mesmo id do
            item), lote <code className="text-[11px]">SEPARACAO-LOJA</code> ou <code className="text-[11px]">SEP-…</code>{' '}
            (viagem). Itens sem validade usam data sentinela, como na entrada de compra.
          </p>

          <Button variant="primary" className="w-full" onClick={criarSeparacao} disabled={saving || itensEscaneados.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Truck className="w-4 h-4 mr-2" />}
            Criar Separação ({itensEscaneados.length} itens)
          </Button>
        </>
      )}
    </div>
  );
}
