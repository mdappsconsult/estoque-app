'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ChefHat,
  Loader2,
  CheckCircle,
  Plus,
  Trash2,
  Server,
  Eye,
  History,
  ChevronDown,
  ChevronUp,
  ArrowUpRight,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import Link from 'next/link';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import {
  HISTORICO_PRODUCAO_SELECT,
  mapearHistoricoProducaoRows,
  registrarProducaoComItens,
  type ProducaoHistoricoResumo,
} from '@/lib/services/producao';
import { obterGramasDisponiveisMassa } from '@/lib/services/producao-massa';
import { errMessage } from '@/lib/errMessage';
import { contarItensDisponiveisLocal } from '@/lib/services/itens';
import { contarUnidadesLivresLotesCompra } from '@/lib/services/lotes-compra';
import { supabase } from '@/lib/supabase';
import { Produto, Local, Familia } from '@/types/database';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import {
  abrirPreviaEtiquetasEmJanela,
  confirmarImpressao,
  FORMATO_ETIQUETA_INDUSTRIA,
  imprimirEtiquetasEmJobUnico,
  type EtiquetaParaImpressao,
} from '@/lib/printing/label-print';
import { enviarEtiquetasParaPiEmMultiplosJobs } from '@/lib/printing/pi-print-ws-client';
import {
  calcularDataValidadeIsoMeiaNoiteBrAposDiasCorridos,
  calcularDataValidadeYmdAposDiasCorridosBr,
} from '@/lib/datas/validade-producao-br';
import { idsFamiliasInsumoProducao } from '@/lib/producao-insumos-familia';
import {
  encontrarReceitaAcaiDoKim,
  linhasInsumoAPartirDaReceita,
  listarReceitasAtivasParaProducao,
  novaLinhaInsumoVazia,
  type ProducaoReceitaComItens,
} from '@/lib/services/producao-receitas';

function produtoInsumoUsaMassa(p: Produto | undefined): boolean {
  return Boolean(p?.producao_consumo_por_massa);
}

function gramasPorDoseCadastro(p: Produto): number {
  const n = Math.floor(Number(p.producao_gramas_por_dose) || 0);
  return n > 0 ? n : 0;
}

/** Gramas a consumir para linha em modo massa; `null` se inválido. */
function gramasInformadasLinha(linha: { massa_valor: string }, produto: Produto): number | null {
  const raw = String(linha.massa_valor).trim().replace(',', '.');
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const gd = gramasPorDoseCadastro(produto);
  if (gd > 0) return Math.floor(n * gd);
  return Math.floor(n * 1000);
}

export default function ProducaoPage() {
  const { usuario } = useAuth();
  const {
    loading: piCfgLoading,
    available: piPrintAvailable,
    connection: piConnection,
  } = usePiPrintBridgeConfig({ papel: 'industria' });
  const { data: produtos, loading: loadingProdutos } = useRealtimeQuery<Produto>({
    table: 'produtos',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: familias, loading: loadingFamilias } = useRealtimeQuery<Familia>({
    table: 'familias',
    select: 'id, nome',
    orderBy: { column: 'nome', ascending: true },
  });
  const insumoFamiliaIds = useMemo(() => idsFamiliasInsumoProducao(familias), [familias]);
  /** Acabado: origem produção ou ambos. Insumos: ativos na família «Insumo Industria» (Cadastros → Categorias). */
  const produtosProducao = useMemo(
    () =>
      produtos.filter((p) => !p.origem || p.origem === 'PRODUCAO' || p.origem === 'AMBOS'),
    [produtos]
  );
  const produtosInsumo = useMemo(
    () =>
      produtos.filter(
        (p) =>
          p.status === 'ativo' &&
          Boolean(p.familia_id) &&
          insumoFamiliaIds.has(p.familia_id as string)
      ),
    [produtos, insumoFamiliaIds]
  );
  const produtoElegivelInsumoFamilia = useMemo(() => {
    return (p: Produto) =>
      p.status === 'ativo' && Boolean(p.familia_id) && insumoFamiliaIds.has(p.familia_id as string);
  }, [insumoFamiliaIds]);

  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const warehouses = locais.filter((l) => l.tipo === 'WAREHOUSE');
  const defaultWarehouseId = useMemo(() => {
    if (warehouses.length === 0) return '';
    const byUser = usuario?.local_padrao_id?.trim();
    if (byUser && warehouses.some((w) => w.id === byUser)) return byUser;
    const industria = warehouses.find((w) => /ind[uú]stria/i.test(w.nome));
    return industria?.id ?? warehouses[0]!.id;
  }, [warehouses, usuario?.local_padrao_id]);

  const filtroHistoricoLocal = useMemo(() => {
    if (!usuario) return undefined;
    const perfil = usuario.perfil;
    if (perfil === 'OPERATOR_WAREHOUSE' || perfil === 'OPERATOR_WAREHOUSE_DRIVER') {
      const lid = usuario.local_padrao_id?.trim();
      if (lid) return [{ column: 'local_id' as const, value: lid }];
    }
    return undefined;
  }, [usuario]);

  const {
    data: historicoProducoes,
    loading: historicoLoading,
    error: historicoError,
  } = useRealtimeQuery<ProducaoHistoricoResumo>({
    table: 'producoes',
    select: HISTORICO_PRODUCAO_SELECT,
    filters: filtroHistoricoLocal,
    orderBy: { column: 'created_at', ascending: false },
    maxRows: 150,
    enabled: Boolean(usuario),
    transform: mapearHistoricoProducaoRows,
    preserveDataWhileRefetching: true,
    refetchDebounceMs: 400,
  });

  const [form, setForm] = useState({
    produto_id: '',
    num_baldes: '',
    local_id: '',
    dias_validade: '7',
    observacoes: '',
  });
  const [linhasInsumo, setLinhasInsumo] = useState(() => [novaLinhaInsumoVazia()]);
  const [insumosExpanded, setInsumosExpanded] = useState<Set<string>>(() => new Set());
  const [receitasProducao, setReceitasProducao] = useState<ProducaoReceitaComItens[]>([]);
  const [receitaSelectId, setReceitaSelectId] = useState('');
  /** Se true, não reaplica a receita «Açaí do Kim» ao abrir/limpar o formulário. */
  const [receitaPadraoBloqueada, setReceitaPadraoBloqueada] = useState(false);
  const [insumosPainelAberto, setInsumosPainelAberto] = useState(false);
  const receitaSelecionadaTravada = Boolean(receitaSelectId);
  /** Por insumo (modo QR): já com QR no local + saldo só em lote de compra (sem QR ainda). */
  const [disponivelInsumoQrLote, setDisponivelInsumoQrLote] = useState<
    Record<string, { qr: number; lote: number }>
  >({});
  const [disponivelMassaPorProduto, setDisponivelMassaPorProduto] = useState<
    Record<string, { gramas: number; gramasPorEmbalagem: number }>
  >({});
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number; baldes: number } | null>(null);
  const [etiquetasPendentesImpressao, setEtiquetasPendentesImpressao] = useState<Array<{
    id: string;
    dataProducao: string;
    dataValidade: string;
    lote: string;
    tokenQr: string;
    tokenShort: string | null;
    numeroLoteProducao: number;
    sequenciaNoLote: number;
    numBaldesLote: number;
    dataLoteProducaoIso: string;
  }>>([]);
  const [produtoParaImpressao, setProdutoParaImpressao] = useState('Produto');
  const [localParaImpressao, setLocalParaImpressao] = useState('Indústria');
  const [imprimindo, setImprimindo] = useState(false);
  const [imprimindoPi, setImprimindoPi] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [previsualizandoModal, setPrevisualizandoModal] = useState(false);
  const [avisoHttpsPi, setAvisoHttpsPi] = useState(false);
  const [confirmacaoAberta, setConfirmacaoAberta] = useState(false);
  const [erroConfirmacao, setErroConfirmacao] = useState('');
  const diasValidadeNumero = Number(form.dias_validade);
  const dataValidadePrevista = useMemo(() => {
    if (!Number.isInteger(diasValidadeNumero) || diasValidadeNumero <= 0) return null;
    try {
      return calcularDataValidadeYmdAposDiasCorridosBr(diasValidadeNumero);
    } catch {
      return null;
    }
  }, [diasValidadeNumero]);
  const produtoSelecionadoNome = produtos.find((produto) => produto.id === form.produto_id)?.nome || '-';
  const localSelecionadoNome = warehouses.find((local) => local.id === form.local_id)?.nome || '-';

  const produtosInsumoIdsChave = useMemo(
    () =>
      [...new Set(linhasInsumo.map((l) => l.produto_id).filter(Boolean))].sort().join(','),
    [linhasInsumo]
  );

  useEffect(() => {
    setLinhasInsumo((rows) => {
      let changed = false;
      const next = rows.map((r) => {
        if (!r.produto_id || produtosInsumo.some((p) => p.id === r.produto_id)) return r;
        changed = true;
        return { ...r, produto_id: '', quantidade: '', massa_valor: '' };
      });
      return changed ? next : rows;
    });
  }, [produtosInsumo]);

  useEffect(() => {
    if (linhasInsumo.length === 0) {
      setInsumosExpanded(new Set());
      return;
    }
    setInsumosExpanded((prev) => {
      const validKeys = new Set(linhasInsumo.map((l) => l.key));
      return new Set([...prev].filter((k) => validKeys.has(k)));
    });
  }, [linhasInsumo]);

  useEffect(() => {
    if (!defaultWarehouseId) return;
    setForm((prev) => (prev.local_id ? prev : { ...prev, local_id: defaultWarehouseId }));
  }, [defaultWarehouseId]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { receitas, error } = await listarReceitasAtivasParaProducao(form.produto_id || null);
      if (cancel) return;
      setReceitasProducao(receitas);
      if (error) console.warn('[producao] receitas:', error.message);
    })();
    return () => {
      cancel = true;
    };
  }, [form.produto_id]);

  /** Pré-seleciona receita «Açaí do Kim» (nome com acai + kim) quando o operador não escolheu outra. */
  useEffect(() => {
    if (receitaPadraoBloqueada) return;
    if (loadingProdutos || loadingFamilias) return;
    if (receitasProducao.length === 0) return;
    if (receitaSelectId) return;
    const rec = encontrarReceitaAcaiDoKim(receitasProducao);
    if (!rec) return;
    const { linhas, avisos } = linhasInsumoAPartirDaReceita(
      rec.producao_receita_itens ?? [],
      produtos,
      produtoElegivelInsumoFamilia
    );
    if (avisos.length) console.warn('[producao] receita padrão:', avisos.join(' | '));
    setLinhasInsumo(linhas.length > 0 ? linhas : [novaLinhaInsumoVazia()]);
    setInsumosExpanded(new Set());
    setReceitaSelectId(rec.id);
    if (rec.produto_acabado_id) {
      setForm((f) => ({ ...f, produto_id: rec.produto_acabado_id! }));
    }
  }, [
    receitaPadraoBloqueada,
    receitaSelectId,
    receitasProducao,
    produtos,
    produtoElegivelInsumoFamilia,
    loadingProdutos,
    loadingFamilias,
  ]);

  /** Reaplica insumos da receita escolhida quando o catálogo (produtos/famílias) termina de carregar — evita receita «vazia» no deploy com rede lenta. */
  useEffect(() => {
    if (loadingProdutos || loadingFamilias) return;
    if (!receitaSelectId) return;
    const rec = receitasProducao.find((r) => r.id === receitaSelectId);
    if (!rec) return;
    const { linhas: novasLinhas } = linhasInsumoAPartirDaReceita(
      rec.producao_receita_itens ?? [],
      produtos,
      produtoElegivelInsumoFamilia
    );
    if (novasLinhas.length === 0) return;
    setLinhasInsumo((prev) => {
      const same =
        prev.length === novasLinhas.length &&
        prev.every(
          (p, i) =>
            p.produto_id === novasLinhas[i]!.produto_id &&
            String(p.quantidade) === String(novasLinhas[i]!.quantidade) &&
            String(p.massa_valor) === String(novasLinhas[i]!.massa_valor)
        );
      return same ? prev : novasLinhas;
    });
  }, [
    loadingProdutos,
    loadingFamilias,
    receitaSelectId,
    receitasProducao,
    produtos,
    produtoElegivelInsumoFamilia,
  ]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!form.local_id || !produtosInsumoIdsChave) {
        if (!cancel) {
          setDisponivelInsumoQrLote({});
          setDisponivelMassaPorProduto({});
        }
        return;
      }
      const ids = produtosInsumoIdsChave.split(',').filter(Boolean);
      const nextQrLote: Record<string, { qr: number; lote: number }> = {};
      const nextMassa: Record<string, { gramas: number; gramasPorEmbalagem: number }> = {};
      for (const pid of ids) {
        const p = produtos.find((x) => x.id === pid);
        try {
          if (produtoInsumoUsaMassa(p)) {
            const m = await obterGramasDisponiveisMassa(pid, form.local_id);
            nextMassa[pid] = { gramas: m.gramas, gramasPorEmbalagem: m.gramasPorEmbalagem };
          } else {
            const [qr, lote] = await Promise.all([
              contarItensDisponiveisLocal(pid, form.local_id),
              contarUnidadesLivresLotesCompra(pid, form.local_id),
            ]);
            nextQrLote[pid] = { qr, lote };
          }
        } catch {
          if (produtoInsumoUsaMassa(p)) nextMassa[pid] = { gramas: 0, gramasPorEmbalagem: 0 };
          else nextQrLote[pid] = { qr: 0, lote: 0 };
        }
      }
      if (!cancel) {
        setDisponivelInsumoQrLote(nextQrLote);
        setDisponivelMassaPorProduto(nextMassa);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [form.local_id, produtosInsumoIdsChave, produtos]);

  useEffect(() => {
    if (!piConnection?.wsUrl) {
      setAvisoHttpsPi(false);
      return;
    }
    const u = piConnection.wsUrl.toLowerCase();
    setAvisoHttpsPi(window.location.protocol === 'https:' && u.startsWith('ws:'));
  }, [piConnection]);

  const consumosParaServico = useMemo(() => {
    return linhasInsumo
      .map((l) => {
        const p = produtos.find((x) => x.id === l.produto_id);
        if (produtoInsumoUsaMassa(p)) return null;
        return {
          produtoId: l.produto_id,
          quantidade: Math.floor(Number(l.quantidade)),
        };
      })
      .filter(
        (c): c is { produtoId: string; quantidade: number } =>
          c != null && Boolean(c.produtoId) && Number.isFinite(c.quantidade) && c.quantidade > 0
      );
  }, [linhasInsumo, produtos]);

  const consumosMassaParaServico = useMemo(() => {
    const out: { produtoId: string; gramas: number }[] = [];
    for (const l of linhasInsumo) {
      if (!l.produto_id) continue;
      const p = produtos.find((x) => x.id === l.produto_id);
      if (!produtoInsumoUsaMassa(p) || !p) continue;
      const g = gramasInformadasLinha(l, p);
      if (g != null && g > 0) out.push({ produtoId: l.produto_id, gramas: g });
    }
    return out;
  }, [linhasInsumo, produtos]);

  const temInsumoValido =
    consumosParaServico.length > 0 || consumosMassaParaServico.length > 0;

  const numBaldesInt = Math.floor(Number(form.num_baldes));
  const formularioValido =
    Boolean(form.produto_id) &&
    Number.isInteger(numBaldesInt) &&
    numBaldesInt > 0 &&
    Boolean(form.local_id) &&
    Number.isInteger(diasValidadeNumero) &&
    diasValidadeNumero > 0 &&
    temInsumoValido;

  const receitaSelecionadaObj = useMemo(
    () => receitasProducao.find((r) => r.id === receitaSelectId),
    [receitasProducao, receitaSelectId]
  );
  const avisoReceitaAcabadoDivergente = Boolean(
    receitaSelecionadaObj?.produto_acabado_id &&
      form.produto_id &&
      receitaSelecionadaObj.produto_acabado_id !== form.produto_id
  );

  const aoEscolherReceita = (receitaId: string) => {
    if (!receitaId) {
      setReceitaSelectId('');
      setReceitaPadraoBloqueada(true);
      return;
    }
    const rec = receitasProducao.find((r) => r.id === receitaId);
    if (!rec) return;

    const temPreenchido = linhasInsumo.some(
      (l) =>
        (Boolean(l.produto_id) && String(l.quantidade).trim() !== '') ||
        (Boolean(l.produto_id) && String(l.massa_valor).trim() !== '')
    );
    if (temPreenchido && !window.confirm('Substituir os insumos atuais pelos da receita selecionada?')) {
      return;
    }
    const { linhas, avisos } = linhasInsumoAPartirDaReceita(
      rec.producao_receita_itens ?? [],
      produtos,
      produtoElegivelInsumoFamilia
    );
    if (avisos.length) {
      alert(avisos.join('\n'));
    }
    setLinhasInsumo(linhas.length > 0 ? linhas : [novaLinhaInsumoVazia()]);
    setInsumosExpanded(new Set());
    setReceitaSelectId(receitaId);
    setReceitaPadraoBloqueada(false);
  };

  const toggleInsumoExpanded = (key: string) => {
    setInsumosExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (): Promise<boolean> => {
    if (!usuario) {
      alert('Faça login');
      return false;
    }
    if (!formularioValido) {
      setErroConfirmacao(
        'Preencha todos os campos obrigatórios (acabado, baldes, local, validade em dias e ao menos um insumo com quantidade QR ou massa).'
      );
      return false;
    }
    setErroConfirmacao('');
    setSaving(true);
    setResultado(null);
    try {
      const etiquetasGeradas = await registrarProducaoComItens({
        produtoId: form.produto_id,
        numBaldes: numBaldesInt,
        localId: form.local_id,
        consumos: consumosParaServico,
        consumosMassa: consumosMassaParaServico.length > 0 ? consumosMassaParaServico : undefined,
        diasValidade: diasValidadeNumero,
        observacoes: form.observacoes || null,
        usuarioId: usuario.id,
        responsavelNome: usuario.nome,
      });
      const produtoNome = produtos.find((produto) => produto.id === form.produto_id)?.nome || 'Produto';
      const nomeLocalGravado =
        warehouses.find((local) => local.id === form.local_id)?.nome || 'Indústria';
      setProdutoParaImpressao(produtoNome);
      setLocalParaImpressao(nomeLocalGravado);
      setEtiquetasPendentesImpressao(
        etiquetasGeradas.map((etiqueta) => ({
          id: etiqueta.id,
          dataProducao: etiqueta.dataProducao,
          dataValidade: etiqueta.dataValidade,
          lote: etiqueta.lote,
          tokenQr: etiqueta.tokenQr,
          tokenShort: etiqueta.tokenShort,
          numeroLoteProducao: etiqueta.numeroLoteProducao,
          sequenciaNoLote: etiqueta.sequenciaNoLote,
          numBaldesLote: etiqueta.numBaldesLote,
          dataLoteProducaoIso: etiqueta.dataLoteProducaoIso,
        }))
      );

      setResultado({ itens: numBaldesInt, baldes: numBaldesInt });
      setReceitaPadraoBloqueada(false);
      setInsumosPainelAberto(false);
      setForm({
        produto_id: '',
        num_baldes: '',
        local_id: defaultWarehouseId || '',
        dias_validade: '7',
        observacoes: '',
      });
      setLinhasInsumo([novaLinhaInsumoVazia()]);
      setInsumosExpanded(new Set());
      setReceitaSelectId('');
      setDisponivelInsumoQrLote({});
      return true;
    } catch (err: unknown) {
      const msg = errMessage(err, 'Erro ao registrar produção');
      setErroConfirmacao(msg);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const montarPayloadImpressao = () => {
    const agora = new Date().toISOString();
    const nomeLocal = localParaImpressao.trim() || 'Indústria';
    return etiquetasPendentesImpressao.map((etiqueta) => ({
      id: etiqueta.id,
      produtoNome: produtoParaImpressao,
      dataManipulacao: etiqueta.dataProducao,
      dataValidade: etiqueta.dataValidade,
      lote: etiqueta.lote,
      tokenQr: etiqueta.tokenQr,
      tokenShort: etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase(),
      responsavel: usuario?.nome || 'OPERADOR',
      nomeLoja: nomeLocal,
      dataGeracaoIso: agora,
      loteProducaoNumero: etiqueta.numeroLoteProducao,
      sequenciaNoLote: etiqueta.sequenciaNoLote,
      numBaldesLoteProducao: etiqueta.numBaldesLote,
      dataLoteProducaoIso: etiqueta.dataLoteProducaoIso,
    }));
  };

  const imprimirEtiquetasGeradas = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    if (!confirmarImpressao(etiquetasPendentesImpressao.length, FORMATO_ETIQUETA_INDUSTRIA)) return;

    setImprimindo(true);
    try {
      const abriuImpressao = await imprimirEtiquetasEmJobUnico(
        montarPayloadImpressao(),
        FORMATO_ETIQUETA_INDUSTRIA
      );
      if (!abriuImpressao) {
        throw new Error('Não foi possível abrir a janela de impressão. Libere pop-ups e tente novamente.');
      }

      const idsEtiquetas = etiquetasPendentesImpressao.map((etiqueta) => etiqueta.id);
      const { error: erroImpressa } = await supabase
        .from('etiquetas')
        .update({ impressa: true })
        .in('id', idsEtiquetas);
      if (erroImpressa) throw erroImpressa;

      setEtiquetasPendentesImpressao([]);
      alert('Etiquetas enviadas para impressão com sucesso.');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir etiquetas');
    } finally {
      setImprimindo(false);
    }
  };

  /** Prévia no modal antes de gravar: amostra (até 3) com produto/local/validade do formulário. */
  const abrirPreviaEtiquetasModalProducao = async () => {
    if (!formularioValido || !dataValidadePrevista) return;
    setPrevisualizandoModal(true);
    setErroConfirmacao('');
    try {
      const amostras = Math.min(numBaldesInt, 3);
      const agora = new Date().toISOString();
      const valIso = calcularDataValidadeIsoMeiaNoiteBrAposDiasCorridos(diasValidadeNumero);
      const payload: EtiquetaParaImpressao[] = Array.from({ length: amostras }, (_, i) => ({
        id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
        produtoNome: produtoSelecionadoNome,
        dataManipulacao: agora,
        dataValidade: valIso,
        lote: 'PREVIA',
        tokenQr: `PREVIA-PRODUCAO-${i + 1}`,
        tokenShort: `PREV${i + 1}`,
        responsavel: usuario?.nome?.trim() || 'OPERADOR',
        nomeLoja: localSelecionadoNome,
        dataGeracaoIso: agora,
        numeroSequenciaLoja: i + 1,
        loteProducaoNumero: 99,
        sequenciaNoLote: i + 1,
        numBaldesLoteProducao: numBaldesInt,
        dataLoteProducaoIso: agora,
      }));
      const ok = await abrirPreviaEtiquetasEmJanela(payload, FORMATO_ETIQUETA_INDUSTRIA, {
        mensagemBarra: `Amostra de ${amostras} etiqueta(s). Total ao registrar: ${numBaldesInt}. Número de lote/sequência reais só após confirmar o registro (ex.: Lote prod. 99 é fictício na prévia).`,
      });
      if (!ok) throw new Error('Não foi possível abrir a prévia. Libere pop-ups.');
    } catch (e: unknown) {
      setErroConfirmacao(e instanceof Error ? e.message : 'Falha ao gerar prévia');
    } finally {
      setPrevisualizandoModal(false);
    }
  };

  const previsualizarEtiquetasProducao = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    setPrevisualizando(true);
    try {
      const ok = await abrirPreviaEtiquetasEmJanela(montarPayloadImpressao(), FORMATO_ETIQUETA_INDUSTRIA, {
        mensagemBarra: 'Mesmo layout enviado à Zebra/Pi. Feche a aba e use os botões de impressão quando estiver certo.',
      });
      if (!ok) {
        throw new Error('Não foi possível abrir a prévia. Libere pop-ups e tente novamente.');
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao gerar prévia');
    } finally {
      setPrevisualizando(false);
    }
  };

  const imprimirEtiquetasNoPi = async () => {
    if (etiquetasPendentesImpressao.length === 0) return;
    if (!piPrintAvailable || !piConnection) {
      alert(
        'Impressão na estação indisponível. Configure a ponte **indústria** em Configurações → Impressoras ou NEXT_PUBLIC_PI_PRINT_WS_URL_INDUSTRIA. Veja docs/RASPBERRY_INDUSTRIA_NOVO_PI.md.'
      );
      return;
    }
    if (!confirmarImpressao(etiquetasPendentesImpressao.length, FORMATO_ETIQUETA_INDUSTRIA)) return;

    setImprimindoPi(true);
    try {
      await enviarEtiquetasParaPiEmMultiplosJobs(
        montarPayloadImpressao(),
        FORMATO_ETIQUETA_INDUSTRIA,
        {
          jobNameBase: `producao-${etiquetasPendentesImpressao[0]?.lote || 'lote'}`.slice(0, 72),
          connection: piConnection,
          papel: 'industria',
        }
      );

      const idsEtiquetas = etiquetasPendentesImpressao.map((etiqueta) => etiqueta.id);
      const { error: erroImpressa } = await supabase
        .from('etiquetas')
        .update({ impressa: true })
        .in('id', idsEtiquetas);
      if (erroImpressa) throw erroImpressa;

      setEtiquetasPendentesImpressao([]);
      alert('Etiquetas 60×60 enviadas para a Zebra (Raspberry / indústria).');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir na estação Pi');
    } finally {
      setImprimindoPi(false);
    }
  };

  if (loadingProdutos || loadingFamilias) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-1 sm:px-0">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <ChefHat className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produção</h1>
        </div>
      </div>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <p className="font-semibold text-green-800">
            Produção registrada. {resultado.baldes} balde(s) → {resultado.itens} unidade(s) com QR geradas.
            Insumos baixados do estoque do local.
          </p>
        </div>
      )}

      {resultado && etiquetasPendentesImpressao.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-blue-800 mb-2">
            Confirmação concluída. Etiquetas no formato <strong>60×60 mm</strong> (indústria). Use o navegador ou a
            Zebra ligada ao Raspberry da <strong>ponte indústria</strong>.
          </p>
          {avisoHttpsPi && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-3">
              Página em HTTPS com WebSocket <code className="text-[11px]">ws://</code> — o navegador pode bloquear.
              Use <code className="text-[11px]">wss://</code> (túnel) na configuração da ponte indústria.
            </p>
          )}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 mb-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void previsualizarEtiquetasProducao()}
              disabled={previsualizando || imprimindo || imprimindoPi}
              title="Abre nova aba com o layout exato antes de imprimir"
            >
              {previsualizando ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Ver prévia
            </Button>
            <Button variant="primary" onClick={imprimirEtiquetasGeradas} disabled={imprimindo || imprimindoPi || previsualizando}>
              {imprimindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Navegador — {etiquetasPendentesImpressao.length} etiqueta(s) 60×60
            </Button>
            <Button
              variant="outline"
              onClick={() => void imprimirEtiquetasNoPi()}
              disabled={imprimindo || imprimindoPi || piCfgLoading || !piPrintAvailable || previsualizando}
              title={
                piPrintAvailable
                  ? 'Envia HTML 60×60 para o Raspberry (WebSocket → CUPS → Zebra)'
                  : 'Configure a ponte indústria em Configurações → Impressoras'
              }
            >
              {imprimindoPi ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Server className="w-4 h-4 mr-2" />
              )}
              Zebra / Pi (indústria)
            </Button>
          </div>

          <div className="mt-4 bg-white rounded-lg border border-blue-100 p-3">
            <p className="text-sm font-semibold text-gray-800 mb-2">
              Etiquetas geradas ({etiquetasPendentesImpressao.length})
            </p>
            <div className="max-h-56 overflow-y-auto space-y-2">
              {etiquetasPendentesImpressao.map((etiqueta, index) => (
                <div
                  key={etiqueta.id}
                  className="flex items-center justify-between text-xs bg-gray-50 border border-gray-200 rounded-md px-3 py-2"
                >
                  <span className="font-medium text-gray-700">#{index + 1}</span>
                  <span className="font-mono text-gray-700">
                    {etiqueta.tokenShort || etiqueta.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-gray-500">
                    Val: {new Date(etiqueta.dataValidade).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-8">
        <Select
          label="Produto acabado"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...produtosProducao.map((p) => ({ value: p.id, label: p.nome })),
          ]}
          value={form.produto_id}
          onChange={(e) => setForm({ ...form, produto_id: e.target.value })}
        />
        {produtosProducao.length === 0 && (
          <p className="text-sm text-amber-600">
            Nenhum produto marcado para produção. Cadastre com origem &quot;Produção&quot; ou &quot;Compra e
            produção&quot;.
          </p>
        )}
        <Input
          label="Quantidade de baldes"
          type="number"
          min="1"
          step="1"
          value={form.num_baldes}
          onChange={(e) => setForm({ ...form, num_baldes: e.target.value })}
          required
        />
        <Select
          label="Local (indústria)"
          required
          options={[{ value: '', label: 'Selecione...' }, ...warehouses.map((l) => ({ value: l.id, label: l.nome }))]}
          value={form.local_id}
          onChange={(e) => setForm({ ...form, local_id: e.target.value })}
          disabled={Boolean(defaultWarehouseId)}
        />

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="flex items-end justify-between gap-2">
            <div className="flex-1 min-w-0">
              <Select
                label="Receita"
                options={[
                  { value: '', label: 'Manual (sem receita)' },
                  ...receitasProducao.map((r) => ({ value: r.id, label: r.nome })),
                ]}
                value={receitaSelectId}
                onChange={(e) => aoEscolherReceita(e.target.value)}
              />
            </div>
            <Link href="/cadastros/receitas-producao" className="shrink-0 self-end">
              <Button
                type="button"
                variant="outline"
                className="min-h-10"
                title="Receitas de produção"
                aria-label="Abrir cadastro de receitas"
              >
                <ArrowUpRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          {avisoReceitaAcabadoDivergente && (
            <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Esta receita foi cadastrada para <strong>outro produto acabado</strong>. Confira o acabado.
            </p>
          )}

          <button
            type="button"
            onClick={() => {
              setInsumosPainelAberto((aberto) => {
                const next = !aberto;
                if (next) {
                  setInsumosExpanded(new Set(linhasInsumo.map((l) => l.key)));
                }
                return next;
              });
            }}
            className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-slate-50/90 px-3 py-2.5 text-left text-sm font-medium text-gray-900 hover:bg-slate-100/90 active:bg-slate-100"
            aria-expanded={insumosPainelAberto}
          >
            <span>Itens da receita</span>
            {insumosPainelAberto ? (
              <ChevronUp className="w-4 h-4 shrink-0 text-gray-600" />
            ) : (
              <ChevronDown className="w-4 h-4 shrink-0 text-gray-600" />
            )}
          </button>

          {insumosPainelAberto && (
            <>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Insumos</h2>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="shrink-0 text-green-700"
                disabled={receitaSelecionadaTravada}
                onClick={() => {
                  const nova = novaLinhaInsumoVazia();
                  setLinhasInsumo((rows) => [...rows, nova]);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                Adicionar
              </Button>
            </div>
          </div>
          {!loadingFamilias && insumoFamiliaIds.size === 0 && (
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              Não foi encontrada categoria <strong>Insumo Industria</strong> em{' '}
              <strong>Cadastros → Categorias</strong>. Crie ou renomeie a família para esse nome (ou{' '}
              <strong>Insumo Indústria</strong>) para listar insumos aqui.
            </p>
          )}
          {produtosInsumo.length === 0 && insumoFamiliaIds.size > 0 && (
            <p className="text-sm text-amber-600">
              Nenhum produto <strong>ativo</strong> na família <strong>Insumo Industria</strong>. Vincule a família no{' '}
              <strong>Cadastros → Produtos</strong>.
            </p>
          )}
          <div className="space-y-3">
            {linhasInsumo.map((linha, index) => {
              const prodInsumo = produtos.find((p) => p.id === linha.produto_id);
              const usaMassa = produtoInsumoUsaMassa(prodInsumo);
              const doseG = prodInsumo ? gramasPorDoseCadastro(prodInsumo) : 0;
              const gramasConsumo =
                usaMassa && prodInsumo ? gramasInformadasLinha(linha, prodInsumo) : null;
              const isExpanded = insumosExpanded.has(linha.key);
              return (
              <div
                key={linha.key}
                className="rounded-xl border border-gray-200 bg-gray-50/90 p-3 sm:p-4 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  {index > 0 ? (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-1">
                      Insumo {index + 1}
                    </span>
                  ) : (
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-1">
                      Insumo
                    </span>
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="shrink-0 inline-flex items-center gap-2 min-h-10 px-3 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-white/70 active:bg-white"
                      onClick={() => toggleInsumoExpanded(linha.key)}
                      aria-expanded={isExpanded}
                      title={isExpanded ? 'Recolher insumo' : 'Expandir insumo'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      <span className="text-xs font-medium">{isExpanded ? 'Recolher' : 'Expandir'}</span>
                    </button>
                    {!receitaSelecionadaTravada && (
                      <button
                        type="button"
                        className="shrink-0 inline-flex items-center justify-center min-h-10 min-w-10 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100"
                        aria-label="Remover linha"
                        onClick={() => {
                          setLinhasInsumo((rows) =>
                            rows.length <= 1 ? rows : rows.filter((r) => r.key !== linha.key)
                          );
                          setInsumosExpanded((prev) => {
                            const next = new Set(prev);
                            next.delete(linha.key);
                            return next;
                          });
                        }}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <Select
                    label={index === 0 ? 'Produto' : undefined}
                    options={[
                      { value: '', label: 'Produto...' },
                      ...produtosInsumo
                        .filter((p) => p.id !== form.produto_id)
                        .map((p) => ({ value: p.id, label: p.nome })),
                    ]}
                    value={linha.produto_id}
                    disabled={receitaSelecionadaTravada}
                    onChange={(e) => {
                      if (receitaSelecionadaTravada) return;
                      const v = e.target.value;
                      setLinhasInsumo((rows) =>
                        rows.map((r) =>
                          r.key === linha.key ? { ...r, produto_id: v, quantidade: '', massa_valor: '' } : r
                        )
                      );
                      setInsumosExpanded((prev) => new Set([...prev, linha.key]));
                    }}
                  />
                  {isExpanded && (
                    <>
                      {usaMassa && prodInsumo ? (
                        <div className="space-y-1">
                          <Input
                            label={index === 0 ? (doseG > 0 ? 'Quantidade (doses)' : 'Quantidade (kg)') : undefined}
                            type="number"
                            min="0"
                            step={doseG > 0 ? '1' : 'any'}
                            placeholder={doseG > 0 ? '0' : 'ex.: 60'}
                            value={linha.massa_valor}
                            disabled={receitaSelecionadaTravada}
                            onChange={(e) => {
                              if (receitaSelecionadaTravada) return;
                              const v = e.target.value;
                              setLinhasInsumo((rows) =>
                                rows.map((r) => (r.key === linha.key ? { ...r, massa_valor: v } : r))
                              );
                              setInsumosExpanded((prev) => new Set([...prev, linha.key]));
                            }}
                          />
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Input
                            label={index === 0 ? 'Quantidade (QR)' : undefined}
                            type="number"
                            min="1"
                            step="1"
                            placeholder="0"
                            value={linha.quantidade}
                            disabled={receitaSelecionadaTravada}
                            onChange={(e) => {
                              if (receitaSelecionadaTravada) return;
                              const v = e.target.value;
                              setLinhasInsumo((rows) =>
                                rows.map((r) => (r.key === linha.key ? { ...r, quantidade: v } : r))
                              );
                              setInsumosExpanded((prev) => new Set([...prev, linha.key]));
                            }}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>

                {isExpanded && linha.produto_id && form.local_id ? (
                  usaMassa ? (
                    <div
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] sm:text-xs text-gray-700 space-y-2.5"
                      title="Resumo para conferência antes de registrar."
                    >
                      <div>
                        <p className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-1">
                          Consumo estimado
                        </p>
                        <p className="break-words leading-relaxed">
                          {gramasConsumo != null && gramasConsumo > 0 ? (
                            <>
                              <span className="font-medium text-gray-900">
                                {gramasConsumo.toLocaleString('pt-BR')} g
                              </span>
                              {doseG > 0 ? (
                                <span className="text-gray-600 block sm:inline sm:ml-1">
                                  ({linha.massa_valor || '0'} doses × {doseG.toLocaleString('pt-BR')} g/dose)
                                </span>
                              ) : (
                                <span className="text-gray-600 block sm:inline sm:ml-1">
                                  ({linha.massa_valor || '0'} kg)
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-gray-500">Informe a quantidade acima.</span>
                          )}
                        </p>
                      </div>
                      <div className="border-t border-gray-100 pt-2">
                        <p className="font-semibold text-gray-900 text-xs uppercase tracking-wide mb-1">
                          Disponível no local
                        </p>
                        <p
                          className="break-words text-gray-700"
                          title="Gramas nos lotes de compra neste armazém (já descontado consumo parcial)."
                        >
                          {disponivelMassaPorProduto[linha.produto_id] != null
                            ? `${disponivelMassaPorProduto[linha.produto_id].gramas.toLocaleString('pt-BR')} g`
                            : '…'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-[13px] sm:text-xs text-gray-700 space-y-2"
                      title="QR = unidades já emitidas no local. Compra = saldo no lote de NF ainda sem QR."
                    >
                      <p className="font-semibold text-gray-900 text-xs uppercase tracking-wide">
                        Disponível
                      </p>
                      <ul className="space-y-1.5 break-words">
                        <li>
                          <span className="text-gray-500">No local (QR): </span>
                          <span className="font-medium text-gray-900">
                            {disponivelInsumoQrLote[linha.produto_id] != null
                              ? disponivelInsumoQrLote[linha.produto_id].qr.toLocaleString('pt-BR')
                              : '…'}
                          </span>
                        </li>
                        <li>
                          <span className="text-gray-500">Só na compra (sem QR): </span>
                          <span className="font-medium text-gray-900">
                            {disponivelInsumoQrLote[linha.produto_id] != null
                              ? disponivelInsumoQrLote[linha.produto_id].lote.toLocaleString('pt-BR')
                              : '…'}
                          </span>
                        </li>
                      </ul>
                    </div>
                  )
                ) : null}
              </div>
            );
            })}
          </div>
            </>
          )}
        </div>

        <Input
          label="Validade (dias) — acabado"
          type="number"
          min="1"
          placeholder="Ex.: 30"
          value={form.dias_validade}
          onChange={(e) => setForm({ ...form, dias_validade: e.target.value })}
          required
        />
        {dataValidadePrevista && (
          <p className="text-xs text-gray-500 -mt-2">
            Data de validade gerada automaticamente:{' '}
            <span className="font-semibold text-gray-700">{dataValidadePrevista}</span>
          </p>
        )}
        <Input label="Observações" value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
        {!formularioValido && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 space-y-1">
            <p className="font-medium text-amber-900">Complete o formulário para habilitar o registro:</p>
            <ul className="list-disc list-inside text-amber-900/90">
              {!form.produto_id && <li>Escolha o produto acabado</li>}
              {(!Number.isInteger(numBaldesInt) || numBaldesInt < 1) && <li>Informe a quantidade de baldes (número inteiro ≥ 1)</li>}
              {!form.local_id && <li>Selecione o local (indústria)</li>}
              {(!Number.isInteger(diasValidadeNumero) || diasValidadeNumero < 1) && (
                <li>Informe validade em dias (número inteiro ≥ 1)</li>
              )}
              {!temInsumoValido && (
                <li>Adicione pelo menos um insumo com quantidade (QR ou massa) a baixar</li>
              )}
            </ul>
          </div>
        )}
        <Button
          variant="primary"
          className="w-full"
          onClick={() => {
            setErroConfirmacao('');
            setConfirmacaoAberta(true);
          }}
          disabled={saving || !formularioValido}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar produção
        </Button>
      </div>

      <details className="group bg-white rounded-xl border border-gray-200 mb-8 overflow-hidden">
        <summary className="list-none cursor-pointer flex items-center gap-3 px-4 py-3 sm:px-5 sm:py-3.5 hover:bg-slate-50/80 [&::-webkit-details-marker]:hidden">
          <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
            <History className="w-4 h-4 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">Produções registradas</span>
            {!historicoLoading && historicoProducoes.length > 0 && (
              <span className="text-[11px] font-medium tabular-nums text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
                {historicoProducoes.length}
              </span>
            )}
            {filtroHistoricoLocal && (
              <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
                {warehouses.find((w) => w.id === filtroHistoricoLocal[0]?.value)?.nome ?? 'Seu armazém'}
              </span>
            )}
          </div>
          <ChevronDown className="w-4 h-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
        </summary>

        <div className="border-t border-gray-100 px-4 pb-3 sm:px-5 sm:pb-4 pt-2">
          {historicoError && (
            <div className="text-sm text-red-700 mb-3 space-y-1">
              <p>
                Não foi possível carregar o histórico:{' '}
                {errMessage(historicoError, 'Erro desconhecido')}
              </p>
              {/failed to fetch|load failed|networkerror/i.test(String(historicoError.message)) && (
                <p className="text-xs text-red-900/90">
                  Falha de rede ao falar com o Supabase (URL longa, proxy, VPN, projeto pausado ou variáveis
                  NEXT_PUBLIC_SUPABASE_* incorretas). Rode <code className="text-[11px]">npm run test:historico-producao</code>{' '}
                  no mesmo ambiente do deploy para isolar o problema.
                </p>
              )}
            </div>
          )}

          {historicoLoading && historicoProducoes.length === 0 ? (
            <div className="flex items-center gap-2 text-gray-600 text-xs py-3">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Carregando…
            </div>
          ) : historicoProducoes.length === 0 ? (
            <p className="text-xs text-gray-500 py-2">Nenhuma produção encontrada.</p>
          ) : (
            <div className="overflow-x-auto -mx-1 sm:mx-0">
              <table className="min-w-[560px] w-full text-[11px] border-collapse leading-tight">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-1 pr-2 font-medium whitespace-nowrap">Data</th>
                    <th className="py-1 pr-2 font-medium max-w-[72px]">Local</th>
                    <th className="py-1 pr-2 font-medium max-w-[120px]">Produto</th>
                    <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">Lote</th>
                    <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">Bld</th>
                    <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">Qtd</th>
                    <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">QR ac.</th>
                    <th className="py-1 pr-2 font-medium text-right whitespace-nowrap">Ins.</th>
                    <th className="py-1 pr-2 font-medium whitespace-nowrap">Conf.</th>
                    <th className="py-1 font-medium max-w-[64px]">Resp.</th>
                  </tr>
                </thead>
                <tbody>
                  {historicoProducoes.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="py-1 pr-2 text-gray-800 whitespace-nowrap">
                        {row.createdAt
                          ? new Date(row.createdAt).toLocaleString('pt-BR', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : '—'}
                      </td>
                      <td className="py-1 pr-2 text-gray-700 max-w-[72px] truncate" title={row.localNome}>
                        {row.localNome}
                      </td>
                      <td className="py-1 pr-2 text-gray-800 max-w-[120px] truncate" title={row.produtoNome}>
                        {row.produtoNome}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums text-gray-800">
                        {row.numeroLoteProducao != null ? row.numeroLoteProducao : '—'}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums font-medium text-gray-900">{row.numBaldes}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-gray-700">{row.quantidade}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-gray-800">
                        {row.contagemAcabadoDisponivel ? row.qrsAcabado : '—'}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums text-gray-800">
                        {row.contagemInsumoDisponivel ? row.qrsInsumoBaixados : '—'}
                      </td>
                      <td className="py-1 pr-2">
                        {!row.contagemAcabadoDisponivel || !row.contagemInsumoDisponivel ? (
                          <span
                            className="inline-flex items-center rounded bg-slate-100 text-slate-700 border border-slate-200 px-1 py-px text-[10px] font-medium"
                            title="Contagem auxiliar não carregou. Recarregue a página."
                          >
                            N/D
                          </span>
                        ) : row.coerenteBaldes ? (
                          <span className="inline-flex items-center rounded bg-green-50 text-green-800 border border-green-200 px-1 py-px text-[10px] font-medium">
                            OK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center rounded bg-red-50 text-red-800 border border-red-200 px-1 py-px text-[10px] font-medium"
                            title="Esperado: QRs acabado = baldes = qtd gravada"
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td className="py-1 text-gray-600 max-w-[64px] truncate" title={row.responsavel}>
                        {row.responsavel}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </details>

      <Modal
        isOpen={confirmacaoAberta}
        onClose={() => setConfirmacaoAberta(false)}
        title="Confirmar registro de produção"
        subtitle="Insumos serão baixados e o acabado entrará em estoque neste local"
        size="md"
      >
        <div className="p-6 space-y-4">
          {erroConfirmacao && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900 whitespace-pre-wrap">
              {erroConfirmacao}
            </div>
          )}
          <div className="space-y-2 text-sm text-gray-700">
            <p>
              <span className="font-semibold">Produto acabado:</span> {produtoSelecionadoNome}
            </p>
            <p>
              <span className="font-semibold">Baldes:</span> {form.num_baldes || '-'} (unidades QR geradas:{' '}
              {Number.isInteger(numBaldesInt) && numBaldesInt > 0 ? numBaldesInt : '-'})
            </p>
            <p>
              <span className="font-semibold">Local:</span> {localSelecionadoNome}
            </p>
            <p>
              <span className="font-semibold">Validade:</span> {form.dias_validade || '-'} dias
            </p>
            {dataValidadePrevista && (
              <p>
                <span className="font-semibold">Vencimento previsto:</span>{' '}
                {new Date(dataValidadePrevista).toLocaleDateString('pt-BR')}
              </p>
            )}
            <div className="pt-2 border-t border-gray-100">
              <p className="font-semibold mb-2">Insumos a consumir</p>
              <ul className="list-disc list-inside space-y-1 text-gray-600">
                {consumosParaServico.map((c) => (
                  <li key={c.produtoId}>
                    {produtos.find((p) => p.id === c.produtoId)?.nome ?? c.produtoId.slice(0, 8)} — {c.quantidade}{' '}
                    unidade(s) QR
                  </li>
                ))}
                {consumosMassaParaServico.map((c) => (
                  <li key={`m-${c.produtoId}`}>
                    {produtos.find((p) => p.id === c.produtoId)?.nome ?? c.produtoId.slice(0, 8)} — {c.gramas} g
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setConfirmacaoAberta(false)} disabled={saving || previsualizandoModal}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void abrirPreviaEtiquetasModalProducao()}
              disabled={saving || previsualizandoModal || !formularioValido}
              title="Abre nova aba com modelo 60×60 (amostra; QR/tokens fictícios até registrar)"
            >
              {previsualizandoModal ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Eye className="w-4 h-4 mr-2" />
              )}
              Ver modelo 60×60
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                const ok = await handleSubmit();
                if (ok) setConfirmacaoAberta(false);
              }}
              disabled={saving || previsualizandoModal}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {saving ? 'Registrando…' : 'Confirmar registro'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
