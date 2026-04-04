'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Truck, Loader2, QrCode, CheckCircle, X, Wand2, Printer, FileDown, Server } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/QRScanner';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import { useAuth } from '@/hooks/useAuth';
import { getItemPorCodigoEscaneado } from '@/lib/services/itens';
import { criarTransferencia } from '@/lib/services/transferencias';
import { criarViagem } from '@/lib/services/viagens';
import { getResumoReposicaoLoja } from '@/lib/services/reposicao-loja';
import { upsertEtiquetasSeparacaoLoja } from '@/lib/services/etiquetas';
import {
  confirmarImpressao,
  FORMATO_CONFIG,
  FORMATO_ETIQUETA_FLUXO_OPERACIONAL,
  gerarDocumentoHtmlEtiquetas,
  imprimirEtiquetasEmJobUnico,
  type EtiquetaParaImpressao,
  type FormatoEtiqueta,
} from '@/lib/printing/label-print';
import {
  enviarHtmlParaPiPrintBridge,
  type PiPrintConnection,
} from '@/lib/printing/pi-print-ws-client';
import { baixarGuiaSeparacaoPdf } from '@/lib/printing/separacao-guia-pdf';
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

/** Impressão / guia antes de «Criar separação» pode gerar QR que não bate com `transferencia_itens`. */
const AVISO_IMPRESSAO_ANTES_DA_SEPARACAO =
  'No recebimento da loja, o QR só é aceito se a unidade estiver na transferência. O fluxo recomendado é confirmar «Criar separação» e imprimir quando o sistema oferecer (mesma lista da remessa).\n\n' +
  'Se você imprimir ou gerar a guia agora sem registrar a separação em seguida com exatamente estes itens — ou se a lista mudar depois — a leitura na loja pode falhar.\n\n' +
  'Deseja continuar mesmo assim?';

function montarEtiquetasSeparacaoParaImpressao(
  itens: ItemEscaneado[],
  ctx: { lote: string; nomeLoja: string; responsavel: string; agoraIso: string }
): EtiquetaParaImpressao[] {
  return itens.map((item) => ({
    id: item.id,
    produtoNome: item.produto_nome,
    dataManipulacao: ctx.agoraIso,
    dataValidade: item.data_validade || ctx.agoraIso,
    lote: ctx.lote,
    tokenQr: item.token_qr,
    tokenShort: item.token_short || item.id.slice(0, 8).toUpperCase(),
    responsavel: ctx.responsavel,
    nomeLoja: ctx.nomeLoja,
    dataGeracaoIso: ctx.agoraIso,
  }));
}

function mensagemConfirmarGuiaPdfEetiquetas(total: number, formato: FormatoEtiqueta): string {
  const cfg = FORMATO_CONFIG[formato];
  if (cfg.dualPorFolha) {
    const folhas = Math.ceil(total / 2);
    return (
      `Será baixado o PDF da guia de separação e aberta a janela de impressão de ${total} etiqueta(s) ` +
      `(${folhas} folha(s) física(s) 60×30 mm, 2 QR por folha). ` +
      `Formato de etiqueta: 60×30 mm (fluxo operacional). Deseja continuar?`
    );
  }
  return (
    `Será baixado o PDF da guia e aberta a impressão de ${total} etiqueta(s) (${cfg.label}). ` +
    `Na separação indústria → loja o padrão é 60×30 mm. Deseja continuar?`
  );
}

export default function SepararPorLojaPage() {
  const { usuario } = useAuth();
  const {
    loading: piCfgLoading,
    available: piPrintAvailable,
    connection: piConnection,
  } = usePiPrintBridgeConfig();
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
  /** HTTPS + ws:// bloqueado pelo navegador (conteúdo misto). */
  const [avisoHttpsPi, setAvisoHttpsPi] = useState(false);
  const reposicaoSyncEpoch = useRef(0);

  /** Busca faltantes da loja + disponível na origem (sem alterar estado de loading). */
  const loadResumoReposicaoData = useCallback(async (): Promise<ResumoReposicaoTela[]> => {
    if (!origemId || !destinoId) return [];
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

    return resumo
      .map((item) => ({
        ...item,
        disponivel_origem: disponivelPorProduto.get(item.produto_id) || 0,
      }))
      .filter((item) => item.faltante > 0);
  }, [origemId, destinoId]);

  const aplicarSugestaoAPartirDeResumo = useCallback(
    async (faltantesComDisponibilidade: ResumoReposicaoTela[]) => {
      if (!origemId || !destinoId) return;
      const pendentes = faltantesComDisponibilidade.filter((item) => item.faltante > 0);
      if (pendentes.length === 0) {
        setItensEscaneados([]);
        setMensagemReposicao('Nenhum faltante para esta loja no momento.');
        return;
      }

      const produtosComFalta = pendentes.map((item) => item.produto_id);
      const { data: itensOrigem, error: itensError } = await supabase
        .from('itens')
        .select('id, token_qr, token_short, produto_id, data_validade, produto:produtos(nome)')
        .eq('estado', 'EM_ESTOQUE')
        .eq('local_atual_id', origemId)
        .in('produto_id', produtosComFalta)
        .order('created_at', { ascending: true });
      if (itensError) throw itensError;

      type ItemOrigemItens = NonNullable<typeof itensOrigem>[number];
      const porProduto = new Map<string, ItemOrigemItens[]>();
      (itensOrigem || []).forEach((item) => {
        const atual = porProduto.get(item.produto_id) || [];
        atual.push(item);
        porProduto.set(item.produto_id, atual);
      });

      const selecionados: ItemEscaneado[] = [];
      const pendencias: string[] = [];
      pendentes.forEach((resumo) => {
        const disponiveis = porProduto.get(resumo.produto_id) || [];
        const qtdSelecionada = Math.min(disponiveis.length, resumo.faltante);
        if (qtdSelecionada < resumo.faltante) {
          pendencias.push(`${resumo.produto_nome} (faltam ${resumo.faltante - qtdSelecionada})`);
        }
        disponiveis.slice(0, qtdSelecionada).forEach((item) => {
          const prod = item.produto as { nome?: string } | null;
          selecionados.push({
            id: item.id,
            token_qr: item.token_qr,
            token_short: item.token_short,
            produto_id: item.produto_id,
            produto_nome: prod?.nome || resumo.produto_nome,
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
    },
    [origemId, destinoId]
  );

  const sincronizarReposicaoESugestao = useCallback(async () => {
    if (!origemId || !destinoId) return;
    reposicaoSyncEpoch.current += 1;
    const epoch = reposicaoSyncEpoch.current;
    setItensEscaneados([]);
    setMensagemReposicao('');
    setCarregandoReposicao(true);
    setAplicandoSugestao(true);
    setErro('');
    try {
      const data = await loadResumoReposicaoData();
      if (epoch !== reposicaoSyncEpoch.current) return;
      setResumoReposicao(data);
      await aplicarSugestaoAPartirDeResumo(data);
    } catch (err: unknown) {
      if (epoch !== reposicaoSyncEpoch.current) return;
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar a reposição');
      setResumoReposicao([]);
      setItensEscaneados([]);
    } finally {
      if (epoch === reposicaoSyncEpoch.current) {
        setCarregandoReposicao(false);
        setAplicandoSugestao(false);
      }
    }
  }, [origemId, destinoId, loadResumoReposicaoData, aplicarSugestaoAPartirDeResumo]);

  useEffect(() => {
    if (modoSeparacao !== 'reposicao' || !origemId || !destinoId) return;
    reposicaoSyncEpoch.current += 1;
    const epoch = reposicaoSyncEpoch.current;
    const timer = window.setTimeout(() => {
      void (async () => {
        setItensEscaneados([]);
        setMensagemReposicao('');
        setCarregandoReposicao(true);
        setAplicandoSugestao(true);
        setErro('');
        try {
          const data = await loadResumoReposicaoData();
          if (epoch !== reposicaoSyncEpoch.current) return;
          setResumoReposicao(data);
          await aplicarSugestaoAPartirDeResumo(data);
        } catch (err: unknown) {
          if (epoch !== reposicaoSyncEpoch.current) return;
          setErro(err instanceof Error ? err.message : 'Não foi possível carregar a reposição');
          setResumoReposicao([]);
          setItensEscaneados([]);
        } finally {
          if (epoch === reposicaoSyncEpoch.current) {
            setCarregandoReposicao(false);
            setAplicandoSugestao(false);
          }
        }
      })();
    }, 450);
    return () => window.clearTimeout(timer);
  }, [modoSeparacao, origemId, destinoId, loadResumoReposicaoData, aplicarSugestaoAPartirDeResumo]);

  useEffect(() => {
    if (!piConnection?.wsUrl) {
      setAvisoHttpsPi(false);
      return;
    }
    const u = piConnection.wsUrl.toLowerCase();
    setAvisoHttpsPi(window.location.protocol === 'https:' && u.startsWith('ws:'));
  }, [piConnection]);

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

  const upsertEMontarEtiquetasImpressaoSeparacao = async (
    itens: ItemEscaneado[],
    lote: string,
    nomeLojaDestino: string
  ): Promise<EtiquetaParaImpressao[]> => {
    await upsertEtiquetasSeparacaoLoja(
      itens.map((item) => ({
        id: item.id,
        produto_id: item.produto_id,
        data_validade: item.data_validade,
      })),
      { lote, mode: 'impresso_agora' }
    );
    const agora = new Date().toISOString();
    return montarEtiquetasSeparacaoParaImpressao(itens, {
      lote,
      nomeLoja: nomeLojaDestino,
      responsavel: usuario?.nome || 'OPERADOR',
      agoraIso: agora,
    });
  };

  const executarUpsertEAbrirJanelaEtiquetas = async (
    itens: ItemEscaneado[],
    lote: string,
    nomeLojaDestino: string
  ) => {
    const etiquetas = await upsertEMontarEtiquetasImpressaoSeparacao(itens, lote, nomeLojaDestino);
    const abriu = await imprimirEtiquetasEmJobUnico(etiquetas, FORMATO_ETIQUETA_FLUXO_OPERACIONAL);
    if (!abriu) {
      throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
    }
  };

  const executarUpsertEImprimirPi = async (
    itens: ItemEscaneado[],
    lote: string,
    nomeLojaDestino: string,
    conn: PiPrintConnection
  ) => {
    const etiquetas = await upsertEMontarEtiquetasImpressaoSeparacao(itens, lote, nomeLojaDestino);
    const html = await gerarDocumentoHtmlEtiquetas(etiquetas, FORMATO_ETIQUETA_FLUXO_OPERACIONAL);
    await enviarHtmlParaPiPrintBridge(html, { jobName: lote, connection: conn });
  };

  const imprimirEtiquetasSeparacao = async () => {
    if (itensEscaneados.length === 0) return;
    if (!window.confirm(AVISO_IMPRESSAO_ANTES_DA_SEPARACAO)) return;
    if (!confirmarImpressao(itensEscaneados.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)) return;

    const nomeLojaDestino = lojas.find((l) => l.id === destinoId)?.nome || '—';
    setImprimindoEtiquetas(true);
    try {
      await executarUpsertEAbrirJanelaEtiquetas(itensEscaneados, 'SEPARACAO-LOJA', nomeLojaDestino);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setImprimindoEtiquetas(false);
    }
  };

  const imprimirEtiquetasSeparacaoNoPi = async () => {
    if (itensEscaneados.length === 0) return;
    if (!piPrintAvailable || !piConnection) {
      alert(
        'Impressão na estação indisponível. Preencha a tabela config_impressao_pi no Supabase (URL wss:// do túnel) ou defina NEXT_PUBLIC_PI_PRINT_WS_URL. Veja docs/IMPRESSAO_PI_ACESSO_REMOTO.md.'
      );
      return;
    }
    if (!window.confirm(AVISO_IMPRESSAO_ANTES_DA_SEPARACAO)) return;
    if (!confirmarImpressao(itensEscaneados.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)) return;

    const nomeLojaDestino = lojas.find((l) => l.id === destinoId)?.nome || '—';
    setImprimindoEtiquetas(true);
    try {
      await executarUpsertEImprimirPi(itensEscaneados, 'SEPARACAO-LOJA', nomeLojaDestino, piConnection);
      alert('Etiquetas enviadas para impressão na estação (Raspberry / Zebra).');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir na estação Pi');
    } finally {
      setImprimindoEtiquetas(false);
    }
  };

  const guiaPdfEImprimirEtiquetas = async () => {
    if (itensEscaneados.length === 0) return;
    if (!window.confirm(AVISO_IMPRESSAO_ANTES_DA_SEPARACAO)) return;
    if (
      !window.confirm(
        mensagemConfirmarGuiaPdfEetiquetas(itensEscaneados.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)
      )
    )
      return;

    const nomeLojaDestino = lojas.find((l) => l.id === destinoId)?.nome || '—';
    setImprimindoEtiquetas(true);
    try {
      const emitidoEm = new Date().toISOString();
      const nomeOrigem = warehouses.find((l) => l.id === origemId)?.nome || '—';
      const nomeDestino = nomeLojaDestino;
      baixarGuiaSeparacaoPdf({
        nomeOrigem,
        nomeDestino,
        responsavel: usuario?.nome || 'OPERADOR',
        modoSeparacaoLabel:
          modoSeparacao === 'reposicao' ? 'Reposição (mínimo × contagem na loja)' : 'Manual (scan / digitação)',
        itens: itensEscaneados,
        emitidoEmIso: emitidoEm,
      });
      await new Promise((r) => setTimeout(r, 400));
      await executarUpsertEAbrirJanelaEtiquetas(itensEscaneados, 'SEPARACAO-LOJA', nomeLojaDestino);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao gerar guia ou imprimir etiquetas');
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

    const snapshotItens = [...itensEscaneados];
    const nomeLojaDestino = lojas.find((l) => l.id === destinoId)?.nome || '—';

    setSaving(true);
    try {
      const viagem = await criarViagem({ status: 'PENDING' });
      const loteEtiqueta = `SEP-${viagem.id}`;

      await upsertEtiquetasSeparacaoLoja(
        snapshotItens.map((item) => ({
          id: item.id,
          produto_id: item.produto_id,
          data_validade: item.data_validade,
        })),
        { lote: loteEtiqueta, mode: 'manter_impressa_se_existir' }
      );

      await criarTransferencia(
        {
          tipo: 'WAREHOUSE_STORE',
          origem_id: origemId,
          destino_id: destinoId,
          viagem_id: viagem.id,
          criado_por: usuario.id,
          status: 'AWAITING_ACCEPT',
        },
        snapshotItens.map((i) => i.id)
      );

      setSucesso(true);
      setItensEscaneados([]);
      setDestinoId('');
      setResumoReposicao([]);
      setMensagemReposicao('');
      setMostrarEntradaManual(false);

      if (confirmarImpressao(snapshotItens.length, FORMATO_ETIQUETA_FLUXO_OPERACIONAL)) {
        setImprimindoEtiquetas(true);
        try {
          if (piPrintAvailable && piConnection) {
            try {
              await executarUpsertEImprimirPi(snapshotItens, loteEtiqueta, nomeLojaDestino, piConnection);
            } catch (piErr: unknown) {
              const agora = new Date().toISOString();
              const etiquetasFallback = montarEtiquetasSeparacaoParaImpressao(snapshotItens, {
                lote: loteEtiqueta,
                nomeLoja: nomeLojaDestino,
                responsavel: usuario?.nome || 'OPERADOR',
                agoraIso: agora,
              });
              const abriu = await imprimirEtiquetasEmJobUnico(etiquetasFallback, FORMATO_ETIQUETA_FLUXO_OPERACIONAL);
              if (!abriu) throw piErr;
              alert(
                `A estação Pi não respondeu; abrimos a impressão no navegador.\n${piErr instanceof Error ? piErr.message : String(piErr)}`
              );
            }
          } else {
            await executarUpsertEAbrirJanelaEtiquetas(snapshotItens, loteEtiqueta, nomeLojaDestino);
          }
        } catch (err: unknown) {
          alert(err instanceof Error ? err.message : 'Falha ao abrir impressão das etiquetas da remessa');
        } finally {
          setImprimindoEtiquetas(false);
        }
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Erro');
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
            <p className="text-sm text-green-600">
              Aguardando aceite do motorista. As etiquetas impressas agora batem com esta remessa; se cancelou a impressão,
              evite usar folhas antigas na loja.
            </p>
          </div>
          <button onClick={() => setSucesso(false)} className="ml-auto"><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        <Select
          label="Origem (Indústria)"
          required
          options={[{ value: '', label: 'Selecione...' }, ...warehouses.map(l => ({ value: l.id, label: l.nome }))]}
          value={origemId}
          onChange={(e) => {
            setOrigemId(e.target.value);
            setResumoReposicao([]);
            setMensagemReposicao('');
          }}
        />
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
                onClick={() => {
                  reposicaoSyncEpoch.current += 1;
                  setModoSeparacao('manual');
                  setResumoReposicao([]);
                  setMensagemReposicao('');
                  setErro('');
                }}
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
                  . A <strong>quantidade contada</strong> vem de{' '}
                  <Link href="/contagem-loja" className="text-blue-600 underline underline-offset-2">
                    Declarar estoque na loja
                  </Link>
                  . Ao escolher <strong>origem</strong> e <strong>destino</strong>, o sistema carrega os faltantes e
                  pré-seleciona as unidades disponíveis na indústria (com pequeno atraso ao trocar a loja). Use o botão
                  abaixo para forçar uma nova leitura.
                </p>
                {(carregandoReposicao || aplicandoSugestao) && (
                  <p className="text-xs text-blue-700 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Atualizando faltantes e sugestão…
                  </p>
                )}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => void sincronizarReposicaoESugestao()}
                  disabled={carregandoReposicao || aplicandoSugestao}
                >
                  {carregandoReposicao || aplicandoSugestao ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Wand2 className="w-4 h-4 mr-2" />
                  )}
                  Recarregar faltantes e sugestão
                </Button>
                {mensagemReposicao && <p className="text-xs text-gray-600">{mensagemReposicao}</p>}
                {resumoReposicao.length === 0 && !carregandoReposicao && !aplicandoSugestao && (
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

          {modoSeparacao === 'manual' && (
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
            </div>
          )}

          {erro && <p className="text-sm text-red-500 mb-4">{erro}</p>}

          {itensEscaneados.length > 0 ? (
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
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-sm text-amber-950">
              <p className="font-medium text-amber-900 mb-1">Guia PDF e etiquetas ainda desativados</p>
              <p className="text-amber-900/90 leading-relaxed">
                Eles só liberam quando existir pelo menos <strong>uma unidade</strong> na lista <strong>Itens separados</strong>{' '}
                (cada uma com QR no estoque da origem). No <strong>modo reposição</strong>, a lista é preenchida
                automaticamente ao escolher origem e destino (ou em <strong>Recarregar faltantes e sugestão</strong>). No{' '}
                <strong>modo manual</strong>, escaneie ou digite o código de cada item. Se não houver saldo na origem para
                um faltante, a lista pode vir vazia ou parcial — confira a mensagem acima da tabela.
              </p>
            </div>
          )}

          <Button
            variant="primary"
            className="w-full mb-2"
            onClick={() => void guiaPdfEImprimirEtiquetas()}
            disabled={imprimindoEtiquetas || itensEscaneados.length === 0}
            title={
              itensEscaneados.length === 0
                ? 'Inclua itens em Itens separados (sugestão automática ou escaneamento)'
                : undefined
            }
          >
            {imprimindoEtiquetas ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
            Guia PDF + imprimir etiquetas
          </Button>
          <p className="text-xs text-gray-600 mb-3">
            Baixa o PDF da guia (resumo por produto + lista por unidade com tokens) e, em seguida, abre a impressão das etiquetas
            em <strong>60×30 mm</strong> (fluxo operacional). O caminho recomendado para o QR bater no recebimento é{' '}
            <strong>Criar separação</strong> primeiro e imprimir quando o sistema perguntar. Na térmica, use o diálogo do sistema;
            na guia, A4 ou &quot;Salvar como PDF&quot;.
          </p>

          <Button
            variant="outline"
            className="w-full mb-3"
            onClick={() => void imprimirEtiquetasSeparacao()}
            disabled={imprimindoEtiquetas || itensEscaneados.length === 0}
            title={
              itensEscaneados.length === 0
                ? 'Inclua itens em Itens separados (sugestão automática ou escaneamento)'
                : undefined
            }
          >
            {imprimindoEtiquetas ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
            Só imprimir etiquetas
          </Button>

          <Button
            variant="outline"
            className="w-full mb-3 border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100"
            onClick={() => void imprimirEtiquetasSeparacaoNoPi()}
            disabled={imprimindoEtiquetas || itensEscaneados.length === 0 || piCfgLoading || !piPrintAvailable}
            title={
              piCfgLoading
                ? 'Carregando configuração da estação…'
                : !piPrintAvailable
                  ? 'Configure config_impressao_pi no Supabase ou NEXT_PUBLIC_PI_PRINT_WS_URL'
                  : itensEscaneados.length === 0
                    ? 'Inclua itens em Itens separados'
                    : 'Envia as etiquetas 60×30 para o Raspberry Pi (WebSocket → Zebra)'
            }
          >
            {imprimindoEtiquetas ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Server className="w-4 h-4 mr-2" />
            )}
            Imprimir na estação (Pi / Zebra)
          </Button>
          {!piCfgLoading && !piPrintAvailable && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
              Para imprimir na estação <strong>de qualquer lugar</strong>, use um <strong>túnel</strong> no Raspberry até a
              porta do <code className="text-[11px]">pi-print-ws</code> e grave a URL <code className="text-[11px]">wss://…</code>{' '}
              na tabela <code className="text-[11px]">config_impressao_pi</code> no Supabase (migração{' '}
              <code className="text-[11px]">20260404140000_config_impressao_pi.sql</code>). Em dev na mesma LAN, pode usar{' '}
              <code className="text-[11px]">NEXT_PUBLIC_PI_PRINT_WS_URL</code> no <code className="text-[11px]">.env.local</code>.
              Guia: <code className="text-[11px]">docs/IMPRESSAO_PI_ACESSO_REMOTO.md</code>.
            </p>
          )}
          {avisoHttpsPi && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-3">
              Esta página está em <strong>HTTPS</strong> e a URL do Pi usa <strong>ws://</strong> — o navegador costuma
              bloquear (conteúdo misto). Use o app em <strong>http://localhost</strong> na mesma rede do Pi ou configure{' '}
              <strong>wss://</strong> no Raspberry.
            </p>
          )}
          <p className="text-xs text-gray-500 -mt-2 mb-3">
            O sistema grava <strong>etiquetas</strong> por item: lote <code className="text-[11px]">SEP-…</code> após criar a
            remessa (etiquetas alinhadas ao recebimento) ou <code className="text-[11px]">SEPARACAO-LOJA</code> se imprimir antes
            (somente se depois registrar a separação com a mesma lista). Itens sem validade usam data sentinela, como na compra.
            Com Pi configurado, após <strong>Criar separação</strong> a impressão tenta a <strong>estação</strong> primeiro; se
            falhar, abre o navegador.
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
