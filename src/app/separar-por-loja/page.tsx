'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Truck,
  Loader2,
  QrCode,
  CheckCircle,
  X,
  Wand2,
  Plus,
  RefreshCw,
  Package,
  PencilLine,
  Trash2,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/QRScanner';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import {
  contarItensComQrPorProdutosNoLocal,
  getItemPorCodigoEscaneado,
} from '@/lib/services/itens';
import {
  alterarDestinoRemessaMatrizParaLoja,
  cancelarRemessaMatrizParaLoja,
} from '@/lib/services/transferencias';
import { getResumoReposicaoLoja } from '@/lib/services/reposicao-loja';
import { emitirUnidadesCompraFifo } from '@/lib/services/lotes-compra';
import { getResumoEstoqueAgrupado, type ResumoEstoqueRow } from '@/lib/services/estoque-resumo';
import { MAX_ITENS_SEPARACAO } from '@/lib/services/separacao-matriz-loja-atomic';
import { persistirUltimaRemessa, type UltimaRemessaImpressao } from '@/lib/separacao/ultima-remessa-storage';
import { supabase } from '@/lib/supabase';
import {
  buscarEnviosRecentesMatrizParaLojas,
  type EnvioMatrizLojaResumo,
} from '@/lib/services/envios-matriz-lojas';
import { Local } from '@/types/database';
import { usuarioIndustriaSemConsultaEstoque } from '@/lib/printing/etiquetas-usuario-industria';

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

/** Estoque na origem (modo manual): inclui origem do cadastro para filtrar insumos de compra. */
type LinhaEstoqueOrigemManual = ResumoEstoqueRow & {
  origemProduto: string | null;
  /** Linhas em `itens` (QR); o total `quantidade` do resumo pode incluir lote ainda sem etiqueta. */
  quantidadeComQr: number;
};

function chunkIds<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const LABEL_STATUS_ENVIO: Record<string, string> = {
  AWAITING_ACCEPT: 'Aguardando aceite',
  ACCEPTED: 'Aceita',
  IN_TRANSIT: 'Em trânsito',
  DELIVERED: 'Entregue',
  DIVERGENCE: 'Divergência',
};

function legivelStatusEnvio(s: string): string {
  return LABEL_STATUS_ENVIO[s] ?? s;
}

function remessaPermiteEditarOuExcluir(status: string): boolean {
  return status === 'AWAITING_ACCEPT' || status === 'ACCEPTED';
}

export default function SepararPorLojaPage() {
  const { usuario } = useAuth();
  const { data: locais, loading } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const lojas = locais.filter(l => l.tipo === 'STORE');
  const warehouses = locais.filter(l => l.tipo === 'WAREHOUSE');

  /** Login indústria (ex. Leonardo): só o warehouse cadastrado em `local_padrao_id` — não escolher «Estoque» central. */
  const restricaoOrigemIndustria = usuarioIndustriaSemConsultaEstoque(usuario);
  const localPadraoIndustriaId = usuario?.local_padrao_id?.trim() ?? '';
  const warehousesParaOrigemSelect = useMemo(() => {
    if (!restricaoOrigemIndustria) return warehouses;
    if (!localPadraoIndustriaId) return [];
    const hit = warehouses.find((l) => l.id === localPadraoIndustriaId);
    return hit ? [hit] : [];
  }, [restricaoOrigemIndustria, localPadraoIndustriaId, warehouses]);

  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarEntradaManual, setMostrarEntradaManual] = useState(false);
  const [itensEscaneados, setItensEscaneados] = useState<ItemEscaneado[]>([]);
  const [modoSeparacao, setModoSeparacao] = useState<'reposicao' | 'manual'>('reposicao');
  const [resumoReposicao, setResumoReposicao] = useState<ResumoReposicaoTela[]>([]);
  const [carregandoReposicao, setCarregandoReposicao] = useState(false);
  const [aplicandoSugestao, setAplicandoSugestao] = useState(false);
  const [mensagemReposicao, setMensagemReposicao] = useState('');
  const [saving, setSaving] = useState(false);
  /** Feedback em remessas grandes (centenas de unidades). */
  const [savingEtapa, setSavingEtapa] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');
  const reposicaoSyncEpoch = useRef(0);
  const [linhasEstoqueOrigemManual, setLinhasEstoqueOrigemManual] = useState<LinhaEstoqueOrigemManual[]>([]);
  /** Insumos de fornecedor (origem COMPRA) ficam ocultos no manual até marcar isto — foco em acabados (PRODUCAO/AMBOS). */
  const [incluirCompraNoManual, setIncluirCompraNoManual] = useState(false);
  const [carregandoEstoqueOrigem, setCarregandoEstoqueOrigem] = useState(false);
  const [buscaEstoqueManual, setBuscaEstoqueManual] = useState('');
  const [qtdPorProdutoManual, setQtdPorProdutoManual] = useState<Record<string, string>>({});
  const [adicionandoProdutoId, setAdicionandoProdutoId] = useState<string | null>(null);
  const buscaEstoqueManualRef = useRef(buscaEstoqueManual);
  buscaEstoqueManualRef.current = buscaEstoqueManual;

  const [enviosRegistrados, setEnviosRegistrados] = useState<EnvioMatrizLojaResumo[]>([]);
  const [carregandoEnvios, setCarregandoEnvios] = useState(false);
  const [erroEnvios, setErroEnvios] = useState('');
  const [envioEditando, setEnvioEditando] = useState<EnvioMatrizLojaResumo | null>(null);
  const [destinoModalRemessa, setDestinoModalRemessa] = useState('');
  const [remessaEmAcaoId, setRemessaEmAcaoId] = useState<string | null>(null);

  /** Registro atômico no servidor: pede senha após o confirm. */
  const [modalSenhaSeparacaoAberto, setModalSenhaSeparacaoAberto] = useState(false);
  const [senhaSeparacao, setSenhaSeparacao] = useState('');
  const [erroModalSeparacao, setErroModalSeparacao] = useState('');
  const [pendingSeparacao, setPendingSeparacao] = useState<{
    snapshotItens: ItemEscaneado[];
    nomeLojaDestino: string;
  } | null>(null);

  /** Lista longa: renderiza em fatias para não travar o browser. */
  const [limiteListaItensSeparados, setLimiteListaItensSeparados] = useState(100);

  const itensSeparadosVisiveis = useMemo(
    () => itensEscaneados.slice(0, limiteListaItensSeparados),
    [itensEscaneados, limiteListaItensSeparados]
  );
  const temMaisItensSeparados = itensEscaneados.length > itensSeparadosVisiveis.length;

  useEffect(() => {
    if (!restricaoOrigemIndustria) return;
    if (warehousesParaOrigemSelect.length === 1) {
      const onlyId = warehousesParaOrigemSelect[0].id;
      if (origemId !== onlyId) {
        setOrigemId(onlyId);
        setResumoReposicao([]);
        setMensagemReposicao('');
        setEnviosRegistrados([]);
      }
      return;
    }
    if (origemId) {
      setOrigemId('');
      setResumoReposicao([]);
      setMensagemReposicao('');
      setEnviosRegistrados([]);
    }
  }, [restricaoOrigemIndustria, warehousesParaOrigemSelect, origemId]);

  const carregarEnviosRegistrados = useCallback(async () => {
    if (!origemId) {
      setEnviosRegistrados([]);
      setErroEnvios('');
      return;
    }
    setCarregandoEnvios(true);
    setErroEnvios('');
    try {
      const lista = await buscarEnviosRecentesMatrizParaLojas({
        origemId,
        destinoId: destinoId.trim() || undefined,
        limiteTransferencias: 40,
      });
      setEnviosRegistrados(lista);
    } catch (err: unknown) {
      setEnviosRegistrados([]);
      setErroEnvios(err instanceof Error ? err.message : 'Não foi possível carregar os envios');
    } finally {
      setCarregandoEnvios(false);
    }
  }, [origemId, destinoId]);

  useEffect(() => {
    void carregarEnviosRegistrados();
  }, [carregarEnviosRegistrados]);

  const salvarNovoDestinoRemessa = async () => {
    if (!usuario || !envioEditando) return;
    setRemessaEmAcaoId(envioEditando.transferencia_id);
    try {
      await alterarDestinoRemessaMatrizParaLoja(
        envioEditando.transferencia_id,
        destinoModalRemessa,
        usuario.id
      );
      setEnvioEditando(null);
      await carregarEnviosRegistrados();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível alterar o destino');
    } finally {
      setRemessaEmAcaoId(null);
    }
  };

  const excluirRemessaConfirmado = async (env: EnvioMatrizLojaResumo) => {
    if (!usuario) {
      alert('Faça login');
      return;
    }
    const msg =
      `Cancelar esta remessa?\n\n` +
      `${env.origem_nome} → ${env.destino_nome}\n` +
      `${env.qtd_unidades} unidade(s)\n${env.resumo_produtos}\n\n` +
      `A transferência será apagada e as etiquetas do lote ${env.lote_sep ?? '—'} ficam excluídas no sistema. ` +
      `As unidades (QR) permanecem em estoque na indústria.`;
    if (!window.confirm(msg)) return;
    setRemessaEmAcaoId(env.transferencia_id);
    try {
      await cancelarRemessaMatrizParaLoja(env.transferencia_id, usuario.id);
      await carregarEnviosRegistrados();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Não foi possível cancelar a remessa');
    } finally {
      setRemessaEmAcaoId(null);
    }
  };

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

  const jaNaListaPorProduto = useMemo(() => {
    const m = new Map<string, number>();
    itensEscaneados.forEach((i) => {
      m.set(i.produto_id, (m.get(i.produto_id) || 0) + 1);
    });
    return m;
  }, [itensEscaneados]);

  const estoqueOrigemManual = useMemo(
    () =>
      linhasEstoqueOrigemManual.filter(
        (r) => incluirCompraNoManual || r.origemProduto !== 'COMPRA'
      ),
    [linhasEstoqueOrigemManual, incluirCompraNoManual]
  );

  const carregarEstoqueOrigemManual = useCallback(async () => {
    if (!origemId) return;
    setCarregandoEstoqueOrigem(true);
    setErro('');
    try {
      const rows = await getResumoEstoqueAgrupado({
        estado: 'EM_ESTOQUE',
        localId: origemId,
        busca: buscaEstoqueManualRef.current.trim() || null,
      });
      const positivos = rows.filter((r) => r.quantidade > 0);
      const ids = [...new Set(positivos.map((r) => r.produto_id))];
      const origemMap = new Map<string, string>();
      for (const part of chunkIds(ids, 500)) {
        const { data: prods, error: pe } = await supabase
          .from('produtos')
          .select('id, origem')
          .in('id', part);
        if (pe) throw pe;
        (prods || []).forEach((p: { id: string; origem: string }) => origemMap.set(p.id, p.origem));
      }
      const qrPorProduto = await contarItensComQrPorProdutosNoLocal(ids, origemId);
      const merged: LinhaEstoqueOrigemManual[] = positivos.map((r) => ({
        ...r,
        origemProduto: origemMap.get(r.produto_id) ?? null,
        quantidadeComQr: qrPorProduto.get(r.produto_id) ?? 0,
      }));
      setLinhasEstoqueOrigemManual(merged);
    } catch (err: unknown) {
      setLinhasEstoqueOrigemManual([]);
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar o estoque na origem.');
    } finally {
      setCarregandoEstoqueOrigem(false);
    }
  }, [origemId]);

  useEffect(() => {
    if (modoSeparacao !== 'manual' || !origemId) return;
    void carregarEstoqueOrigemManual();
  }, [modoSeparacao, origemId, carregarEstoqueOrigemManual]);

  const adicionarUnidadesPorProduto = async (
    produtoId: string,
    produtoNome: string,
    livreMax: number
  ) => {
    if (!origemId) {
      setErro('Selecione a origem (indústria).');
      return;
    }
    if (!usuario?.id) {
      setErro('Usuário não identificado. Entre de novo no app.');
      return;
    }
    const raw = (qtdPorProdutoManual[produtoId] ?? '1').trim();
    const parsed = raw === '' ? 1 : Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      setErro('Informe uma quantidade inteira maior ou igual a 1.');
      return;
    }
    const livreOk = Math.max(0, Math.floor(Number.isFinite(livreMax) ? livreMax : 0));
    if (livreOk <= 0) {
      setErro('Não há saldo livre para este produto na origem.');
      return;
    }
    const quantidade = Math.min(parsed, livreOk);
    if (parsed > livreOk) {
      setQtdPorProdutoManual((prev) => ({ ...prev, [produtoId]: String(livreOk) }));
    }
    setErro('');
    setAdicionandoProdutoId(produtoId);
    try {
      const jaSelecionados = new Set(itensEscaneados.map((i) => i.id));

      const buscarCandidatos = async () => {
        const { data, error: qError } = await supabase
          .from('itens')
          .select('id, token_qr, token_short, produto_id, data_validade, produto:produtos(nome)')
          .eq('estado', 'EM_ESTOQUE')
          .eq('local_atual_id', origemId)
          .eq('produto_id', produtoId)
          .order('created_at', { ascending: true })
          .limit(3000);
        if (qError) throw qError;
        return (data || []).filter((row) => !jaSelecionados.has(row.id));
      };

      let candidatos = await buscarCandidatos();
      if (candidatos.length < quantidade) {
        const falta = quantidade - candidatos.length;
        await emitirUnidadesCompraFifo(produtoId, origemId, falta, usuario.id);
        candidatos = await buscarCandidatos();
      }

      if (candidatos.length < quantidade) {
        setErro(
          `Saldo insuficiente para «${produtoNome}» (itens + lote de compra): ${candidatos.length} fora da lista; pedido: ${quantidade}.`
        );
        return;
      }

      const escolhidos = candidatos.slice(0, quantidade);
      setItensEscaneados((prev) => [
        ...prev,
        ...escolhidos.map((item) => {
          const prod = item.produto as { nome?: string } | null;
          return {
            id: item.id,
            token_qr: item.token_qr,
            token_short: item.token_short,
            produto_id: item.produto_id,
            produto_nome: prod?.nome || produtoNome,
            data_validade: item.data_validade,
          };
        }),
      ]);
      void carregarEstoqueOrigemManual();
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Não foi possível adicionar unidades.');
    } finally {
      setAdicionandoProdutoId(null);
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

  const finalizarUiAposSeparacaoServidor = async (
    snapshotItens: ItemEscaneado[],
    loteEtiqueta: string,
    nomeLojaDestino: string
  ) => {
    const payloadRemessa: UltimaRemessaImpressao = {
      lote: loteEtiqueta,
      nomeLoja: nomeLojaDestino,
      destinoLocalId: destinoId,
      itens: snapshotItens,
    };
    persistirUltimaRemessa(payloadRemessa);

    setSucesso(true);
    setItensEscaneados([]);
    setLimiteListaItensSeparados(100);
    setDestinoId('');
    setResumoReposicao([]);
    setMensagemReposicao('');
    setMostrarEntradaManual(false);
    void carregarEnviosRegistrados();
  };

  const criarSeparacao = () => {
    if (!usuario) return alert('Faça login');
    if (!origemId || !destinoId) {
      alert('Selecione origem (indústria) e destino (loja).');
      return;
    }
    const loginOp = usuario.login_operacional?.trim();
    if (!loginOp) {
      alert(
        'Seu usuário não tem login operacional cadastrado. Um administrador deve preencher em Cadastros → Usuários (necessário para gravar a remessa com segurança no servidor).'
      );
      return;
    }
    const n = itensEscaneados.length;
    if (n > MAX_ITENS_SEPARACAO) {
      alert(
        `Limite de ${MAX_ITENS_SEPARACAO} unidades por separação. Reduza a lista ou divida em duas remessas.`
      );
      return;
    }
    const msgBase = `Confirmar criação da separação com ${n} item(ns)?`;
    const msgGrande =
      n > 150
        ? `${msgBase}\n\nRemessas grandes podem levar até cerca de um minuto. Na próxima tela, informe sua senha para gravar tudo de uma vez no servidor (viagem + etiquetas + transferência). Mantenha a aba aberta.`
        : `${msgBase}\n\nNa próxima tela, informe sua senha de acesso para concluir o registro no servidor.`;
    const confirmou = window.confirm(msgGrande);
    if (!confirmou) return;

    const nomeLojaDestino = lojas.find((l) => l.id === destinoId)?.nome || '—';
    setPendingSeparacao({ snapshotItens: [...itensEscaneados], nomeLojaDestino });
    setSenhaSeparacao('');
    setErroModalSeparacao('');
    setModalSenhaSeparacaoAberto(true);
  };

  const confirmarSeparacaoComSenhaNoServidor = async () => {
    if (!usuario || !pendingSeparacao) return;
    const loginOp = usuario.login_operacional?.trim();
    if (!loginOp) {
      setErroModalSeparacao('Login operacional não configurado para este usuário.');
      return;
    }
    if (!senhaSeparacao) {
      setErroModalSeparacao('Digite sua senha.');
      return;
    }
    const { snapshotItens, nomeLojaDestino } = pendingSeparacao;

    setSaving(true);
    setSavingEtapa(`Gravando remessa no servidor (${snapshotItens.length} unidades)…`);
    setErroModalSeparacao('');
    try {
      const res = await fetch('/api/operacional/criar-separacao-matriz-loja', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: loginOp,
          senha: senhaSeparacao,
          origem_id: origemId,
          destino_id: destinoId,
          itens: snapshotItens.map((item) => ({
            id: item.id,
            produto_id: item.produto_id,
            data_validade: item.data_validade ?? null,
          })),
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        lote?: string;
      };
      if (!res.ok) {
        throw new Error(payload.error || 'Falha ao registrar separação');
      }
      const loteEtiqueta = payload.lote?.trim();
      if (!loteEtiqueta) {
        throw new Error('Resposta do servidor sem lote.');
      }

      setSenhaSeparacao('');
      setModalSenhaSeparacaoAberto(false);
      setPendingSeparacao(null);
      setSavingEtapa('');
      await finalizarUiAposSeparacaoServidor(snapshotItens, loteEtiqueta, nomeLojaDestino);
    } catch (err: unknown) {
      setErroModalSeparacao(err instanceof Error ? err.message : 'Erro ao registrar separação');
    } finally {
      setSavingEtapa('');
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
          <CheckCircle className="w-6 h-6 text-green-500 shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Separação criada</p>
            <p className="text-sm text-green-600">
              Aguardando aceite do motorista. Imprima em{' '}
              <Link href="/etiquetas" className="font-medium text-green-800 underline underline-offset-2">
                Etiquetas
              </Link>
              .
            </p>
          </div>
          <button type="button" onClick={() => setSucesso(false)} className="ml-auto shrink-0" aria-label="Fechar aviso">
            <X className="w-4 h-4 text-green-400" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        {restricaoOrigemIndustria && !localPadraoIndustriaId && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Defina o <strong>local padrão</strong> (warehouse da indústria) em{' '}
            <Link href="/cadastros/usuarios" className="text-red-700 font-semibold underline underline-offset-2">
              Cadastros → Usuários
            </Link>{' '}
            para travar a origem na indústria e não no armazém central.
          </p>
        )}
        {restricaoOrigemIndustria &&
          localPadraoIndustriaId &&
          warehousesParaOrigemSelect.length === 0 &&
          !loading && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              O local padrão deste usuário não é um <strong>Warehouse</strong> cadastrado. Ajuste o vínculo em{' '}
              <Link href="/cadastros/usuarios" className="text-red-700 font-semibold underline underline-offset-2">
                Usuários
              </Link>
              .
            </p>
          )}
        <Select
          label="Origem (Indústria)"
          required
          options={[
            { value: '', label: warehousesParaOrigemSelect.length ? 'Selecione...' : '— Indisponível —' },
            ...warehousesParaOrigemSelect.map((l) => ({ value: l.id, label: l.nome })),
          ]}
          value={origemId}
          disabled={restricaoOrigemIndustria && warehousesParaOrigemSelect.length === 1}
          onChange={(e) => {
            if (restricaoOrigemIndustria && warehousesParaOrigemSelect.length === 1) return;
            setOrigemId(e.target.value);
            setResumoReposicao([]);
            setMensagemReposicao('');
            setEnviosRegistrados([]);
          }}
        />
        {restricaoOrigemIndustria && warehousesParaOrigemSelect.length === 1 && (
          <p className="text-xs text-gray-500">
            Origem fixa no seu local da indústria — remessas do armazém central não aparecem aqui.
          </p>
        )}
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

      {origemId && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-4 mb-6 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Package className="w-5 h-5 text-sky-700 shrink-0 mt-0.5" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-bold text-sky-950">Envios já registrados</p>
                <p className="text-xs text-sky-800 mt-0.5">
                  Origem selecionada
                  {destinoId ? (
                    <> · filtro: {lojas.find((l) => l.id === destinoId)?.nome ?? 'loja'}</>
                  ) : null}
                  . Editar / excluir só antes do despacho.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void carregarEnviosRegistrados()}
              disabled={carregandoEnvios}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-900 bg-white border border-sky-200 rounded-lg px-2.5 py-1.5 hover:bg-sky-100 disabled:opacity-50 shrink-0"
            >
              {carregandoEnvios ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Atualizar
            </button>
          </div>

          {erroEnvios && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{erroEnvios}</p>
          )}

          {carregandoEnvios && enviosRegistrados.length === 0 && !erroEnvios && (
            <div className="flex items-center gap-2 text-xs text-sky-800 py-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              Carregando envios…
            </div>
          )}

          {!carregandoEnvios && enviosRegistrados.length === 0 && !erroEnvios && (
            <p className="text-xs text-sky-900 py-1">
              Nenhuma separação matriz → loja encontrada para este filtro. Crie uma com <strong>Criar separação</strong>{' '}
              abaixo.
            </p>
          )}

          {enviosRegistrados.length > 0 && (
            <ul className="space-y-2 max-h-[min(24rem,58vh)] overflow-y-auto text-xs border border-sky-100 rounded-lg bg-white/90 p-2">
              {enviosRegistrados.map((env) => (
                <li
                  key={env.transferencia_id}
                  className="border-b border-sky-100 last:border-0 pb-2 last:pb-0 text-sky-950"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-1">
                    <span className="font-semibold">
                      {env.origem_nome} → {env.destino_nome}
                    </span>
                    <span className="text-[11px] text-sky-700">
                      {new Date(env.created_at).toLocaleString('pt-BR', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <p className="text-[11px] text-sky-800 mt-0.5">
                    {legivelStatusEnvio(env.status)} · <strong>{env.qtd_unidades}</strong> unidade(s)
                  </p>
                  <p className="text-[11px] text-sky-900 mt-1 leading-snug">{env.resumo_produtos}</p>
                  {env.lote_sep && (
                    <p className="text-[10px] text-sky-700 mt-1">
                      Lote etiquetas:{' '}
                      <code className="bg-sky-100 px-1 rounded">{env.lote_sep}</code> — imprimir em{' '}
                      <Link href="/etiquetas" className="font-semibold text-sky-800 underline underline-offset-2">
                        Etiquetas
                      </Link>
                    </p>
                  )}
                  {remessaPermiteEditarOuExcluir(env.status) && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button
                        type="button"
                        disabled={remessaEmAcaoId !== null}
                        onClick={() => {
                          setEnvioEditando(env);
                          setDestinoModalRemessa(env.destino_id);
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-900 bg-white border border-sky-200 rounded-lg px-2 py-1 hover:bg-sky-100 disabled:opacity-40"
                      >
                        <PencilLine className="w-3.5 h-3.5" aria-hidden />
                        Editar destino
                      </button>
                      <button
                        type="button"
                        disabled={remessaEmAcaoId !== null}
                        onClick={() => void excluirRemessaConfirmado(env)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-800 bg-white border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50 disabled:opacity-40"
                      >
                        {remessaEmAcaoId === env.transferencia_id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden />
                        )}
                        Excluir remessa
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Modal
        isOpen={Boolean(envioEditando)}
        onClose={() => !remessaEmAcaoId && setEnvioEditando(null)}
        title="Alterar loja de destino"
        subtitle={
          envioEditando
            ? `${envioEditando.origem_nome} → ${envioEditando.destino_nome} · ${envioEditando.qtd_unidades} unidade(s)`
            : undefined
        }
        size="sm"
      >
        <div className="space-y-4">
          <Select
            label="Novo destino (loja)"
            value={destinoModalRemessa}
            onChange={(e) => setDestinoModalRemessa(e.target.value)}
            options={lojas.map((l) => ({ value: l.id, label: l.nome }))}
          />
          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
            <Button type="button" variant="outline" disabled={remessaEmAcaoId !== null} onClick={() => setEnvioEditando(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={
                remessaEmAcaoId !== null ||
                !destinoModalRemessa ||
                (envioEditando !== null && destinoModalRemessa === envioEditando.destino_id)
              }
              onClick={() => void salvarNovoDestinoRemessa()}
            >
              {remessaEmAcaoId ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modalSenhaSeparacaoAberto}
        onClose={() => {
          if (saving) return;
          setModalSenhaSeparacaoAberto(false);
          setPendingSeparacao(null);
          setSenhaSeparacao('');
          setErroModalSeparacao('');
        }}
        title="Senha para gravar remessa"
        subtitle={
          pendingSeparacao ? `${pendingSeparacao.snapshotItens.length} unidade(s)` : undefined
        }
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-xs text-gray-600">Mesma senha do login.</p>
          <Input
            label="Senha"
            type="password"
            autoComplete="current-password"
            value={senhaSeparacao}
            onChange={(e) => setSenhaSeparacao(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void confirmarSeparacaoComSenhaNoServidor()}
            disabled={saving}
          />
          {erroModalSeparacao ? (
            <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{erroModalSeparacao}</p>
          ) : null}
          <div className="flex flex-col-reverse sm:flex-row gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setModalSenhaSeparacaoAberto(false);
                setPendingSeparacao(null);
                setSenhaSeparacao('');
                setErroModalSeparacao('');
              }}
            >
              Cancelar
            </Button>
            <Button type="button" variant="primary" disabled={saving || !senhaSeparacao.trim()} onClick={() => void confirmarSeparacaoComSenhaNoServidor()}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Registrar remessa
            </Button>
          </div>
        </div>
      </Modal>

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
                  setIncluirCompraNoManual(false);
                }}
              >
                Modo manual
              </Button>
            </div>
            {modoSeparacao === 'reposicao' && (
              <div className="space-y-3">
                <p className="text-xs text-gray-600">
                  Faltantes a partir de{' '}
                  <Link href="/cadastros/reposicao-loja" className="text-blue-600 underline underline-offset-2">
                    Reposição
                  </Link>{' '}
                  e{' '}
                  <Link href="/contagem-loja" className="text-blue-600 underline underline-offset-2">
                    Contagem na loja
                  </Link>
                  .
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
            <div className="space-y-4 mb-4">
              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-gray-300"
                    checked={incluirCompraNoManual}
                    onChange={(e) => setIncluirCompraNoManual(e.target.checked)}
                  />
                  <span>Incluir produtos só de compra (fornecedor)</span>
                </label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <div className="flex-1 min-w-0">
                    <Input
                      label="Filtrar produtos"
                      placeholder="Nome do produto…"
                      value={buscaEstoqueManual}
                      onChange={(e) => setBuscaEstoqueManual(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void carregarEstoqueOrigemManual()}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => void carregarEstoqueOrigemManual()}
                    disabled={carregandoEstoqueOrigem || !origemId}
                  >
                    {carregandoEstoqueOrigem ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Atualizar lista
                  </Button>
                </div>
                {carregandoEstoqueOrigem && (
                  <p className="text-xs text-blue-700 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Carregando estoque na origem…
                  </p>
                )}
                {!carregandoEstoqueOrigem &&
                  linhasEstoqueOrigemManual.length === 0 && (
                    <p className="text-xs text-gray-500">Nenhum produto com saldo na origem (com o filtro atual).</p>
                  )}
                {!carregandoEstoqueOrigem &&
                  linhasEstoqueOrigemManual.length > 0 &&
                  estoqueOrigemManual.length === 0 && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Todos os produtos com saldo na origem são de <strong>compra</strong> (fornecedor). Para listar
                      polpas e similares, marque a opção acima; acabados de <strong>produção</strong> aparecem sem ela.
                    </p>
                  )}
                {estoqueOrigemManual.length > 0 && (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="max-h-64 overflow-y-auto overflow-x-auto">
                      <table className="w-full text-sm min-w-[520px]">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr className="text-left text-gray-600">
                            <th className="px-3 py-2">Produto</th>
                            <th className="px-3 py-2 w-16" title="Saldo agregado (pode incluir compra sem QR)">
                              Total
                            </th>
                            <th className="px-3 py-2 w-16" title="Unidades com etiqueta/QR no local">
                              Com QR
                            </th>
                            <th className="px-3 py-2 w-12">Lista</th>
                            <th
                              className="px-3 py-2 w-14"
                              title="Saldo total ainda fora da lista (o + pode emitir QR do lote se precisar)"
                            >
                              Livre
                            </th>
                            <th className="px-3 py-2 w-28">Qtd</th>
                            <th className="px-3 py-2 w-24" />
                          </tr>
                        </thead>
                        <tbody>
                          {estoqueOrigemManual.map((linha) => {
                            const naLista = jaNaListaPorProduto.get(linha.produto_id) || 0;
                            const comQr = linha.quantidadeComQr;
                            const totalSaldo = Number(linha.quantidade);
                            const totalOk = Number.isFinite(totalSaldo) ? totalSaldo : 0;
                            const livre = Math.max(0, totalOk - naLista);
                            return (
                              <tr key={linha.produto_id} className="border-t border-gray-100">
                                <td className="px-3 py-2">{linha.produto_nome}</td>
                                <td className="px-3 py-2 tabular-nums">{linha.quantidade}</td>
                                <td className="px-3 py-2 tabular-nums">{comQr}</td>
                                <td className="px-3 py-2 tabular-nums">{naLista}</td>
                                <td className="px-3 py-2 font-medium tabular-nums">{livre}</td>
                                <td className="px-3 py-2 align-middle w-24 min-w-[5.5rem]">
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="off"
                                    enterKeyHint="done"
                                    disabled={livre === 0}
                                    aria-label={`Quantidade para ${linha.produto_nome}`}
                                    className="w-full min-w-0 px-2 py-1.5 text-sm border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed tabular-nums"
                                    value={qtdPorProdutoManual[linha.produto_id] ?? '1'}
                                    onChange={(e) => {
                                      const digits = e.target.value.replace(/\D/g, '');
                                      setQtdPorProdutoManual((prev) => ({
                                        ...prev,
                                        [linha.produto_id]: digits,
                                      }));
                                    }}
                                    onBlur={() => {
                                      const v = (qtdPorProdutoManual[linha.produto_id] ?? '').replace(/\D/g, '');
                                      if (v === '' || Number.parseInt(v, 10) < 1) {
                                        setQtdPorProdutoManual((prev) => ({
                                          ...prev,
                                          [linha.produto_id]: '1',
                                        }));
                                      }
                                    }}
                                  />
                                </td>
                                <td className="px-3 py-2 align-middle whitespace-nowrap">
                                  <Button
                                    type="button"
                                    variant="primary"
                                    className="!px-2 !py-1.5"
                                    disabled={livre === 0 || adicionandoProdutoId === linha.produto_id}
                                    onClick={() =>
                                      void adicionarUnidadesPorProduto(
                                        linha.produto_id,
                                        linha.produto_nome,
                                        livre
                                      )
                                    }
                                    aria-label={`Adicionar ${linha.produto_nome}`}
                                  >
                                    {adicionandoProdutoId === linha.produto_id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <Plus className="w-4 h-4" />
                                    )}
                                  </Button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-gray-500 px-1 pt-2 border-t border-gray-100">
                      <strong>+</strong> adiciona por QR existente ou emite do lote se faltar.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
                <label className="block text-sm font-medium text-gray-700">Opcional: unidade já com QR legível</label>
                <QRScanner
                  onScan={(code) => void processarEscaneamento(code)}
                  label="Ativar leitor de QR (câmera)"
                />
                {!mostrarEntradaManual ? (
                  <Button variant="outline" className="w-full" onClick={() => setMostrarEntradaManual(true)}>
                    Digitar código QR ou token
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Código QR ou token curto"
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
                      Fechar digitação
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {erro && <p className="text-sm text-red-500 mb-4">{erro}</p>}

          {itensEscaneados.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold text-gray-900">Itens separados</p>
                <Badge variant="info">{itensEscaneados.length} itens</Badge>
              </div>
              <div className="space-y-2 max-h-[min(24rem,50vh)] overflow-y-auto">
                {itensSeparadosVisiveis.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{item.produto_nome}</p>
                      <p className="text-xs text-gray-400 font-mono">{item.token_qr}</p>
                    </div>
                    <button type="button" onClick={() => removerItem(item.id)} className="text-gray-400 hover:text-red-500">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              {temMaisItensSeparados ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2 text-xs"
                  onClick={() => setLimiteListaItensSeparados((n) => n + 100)}
                >
                  Mostrar mais ({itensEscaneados.length - itensSeparadosVisiveis.length} oculto(s))
                </Button>
              ) : null}
            </div>
          )}

          <Button
            variant="primary"
            className="w-full"
            onClick={criarSeparacao}
            disabled={saving || itensEscaneados.length === 0 || modalSenhaSeparacaoAberto}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Truck className="w-4 h-4 mr-2" />}
            Criar Separação ({itensEscaneados.length} itens)
          </Button>
          {saving && savingEtapa ? (
            <p className="text-xs text-gray-600 text-center mt-2 leading-relaxed" role="status">
              {savingEtapa}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
