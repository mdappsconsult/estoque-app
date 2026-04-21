'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PackageCheck, Loader2, CheckCircle, AlertTriangle, Pencil, Camera } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import {
  criarLoteCompra,
  atualizarLoteCompra,
  contarItensDoLoteCompra,
  type LoteCompraCompleto,
} from '@/lib/services/lotes-compra';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';
import { errMessage } from '@/lib/errMessage';

type UnidadeCompra = 'UN' | 'CAIXA' | 'FARDO';
interface FamiliaOpt {
  id: string;
  nome: string;
}
interface GrupoEmbalagem {
  id: string;
  nome: string;
}
type ReceitaInsumoRow = {
  produto_id: string;
  receita?: { ativo: boolean } | { ativo: boolean }[] | null;
};

export default function EntradaCompraPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading: loadProd, refetch } = useRealtimeQuery<Produto>({
    table: 'produtos',
    select: '*',
    orderBy: { column: 'nome', ascending: true },
  });
  const isUsuarioIndustria =
    usuario?.perfil === 'OPERATOR_WAREHOUSE' || usuario?.perfil === 'OPERATOR_WAREHOUSE_DRIVER';

  const { data: receitaInsumos } = useRealtimeQuery<ReceitaInsumoRow>({
    table: 'producao_receita_itens',
    select: 'produto_id, receita:producao_receitas(ativo)',
    orderBy: { column: 'produto_id', ascending: true },
    preserveDataWhileRefetching: true,
  });
  const produtoIdsEmReceitasAtivas = useMemo(() => {
    const set = new Set<string>();
    for (const row of receitaInsumos || []) {
      if (!row?.produto_id) continue;
      const receita = row.receita;
      const ativo = Array.isArray(receita) ? receita[0]?.ativo : receita?.ativo;
      if (ativo === false) continue;
      set.add(row.produto_id);
    }
    return set;
  }, [receitaInsumos]);

  const produtosCompra = useMemo(() => {
    const base = produtos.filter((p) => !p.origem || p.origem === 'COMPRA' || p.origem === 'AMBOS');
    if (!isUsuarioIndustria) return base;
    return base.filter((p) => produtoIdsEmReceitasAtivas.has(p.id));
  }, [isUsuarioIndustria, produtoIdsEmReceitasAtivas, produtos]);
  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: familiasLista } = useRealtimeQuery<FamiliaOpt>({
    table: 'familias',
    select: 'id, nome',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: gruposEmbalagem } = useRealtimeQuery<GrupoEmbalagem>({
    table: 'grupos',
    select: 'id, nome',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: lotesRecentes, loading: loadLotesRecentes, refetch: refetchLotesRecentes } =
    useRealtimeQuery<LoteCompraCompleto>({
      table: 'lotes_compra',
      select:
        '*, produto:produtos(id, nome, validade_dias, validade_horas, validade_minutos), local:locais(id, nome)',
      orderBy: { column: 'created_at', ascending: false },
      maxRows: 50,
    });

  const warehouses = useMemo(() => locais.filter((l) => l.tipo === 'WAREHOUSE'), [locais]);
  const warehousesPermitidos = useMemo(() => {
    if (!isUsuarioIndustria) return warehouses;
    const localId = usuario?.local_padrao_id;
    if (!localId) return [];
    return warehouses.filter((w) => w.id === localId);
  }, [isUsuarioIndustria, usuario?.local_padrao_id, warehouses]);

  const [form, setForm] = useState({
    produto_id: '',
    quantidade: '',
    custo_unitario: '',
    fornecedor: '',
    nota_fiscal: '',
    sem_nota_fiscal: false,
    motivo_sem_nota: '',
    local_id: '',
    data_validade: '',
    unidade_compra: 'UN' as UnidadeCompra,
    itens_por_embalagem: '1',
  });
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ quantidadeUnidades: number } | null>(null);
  const [hintCompra, setHintCompra] = useState<{
    estoqueMinimo: number;
    qtdEmEstoque: number;
  } | null>(null);
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [savingProduto, setSavingProduto] = useState(false);
  const [modalCategoriaAberto, setModalCategoriaAberto] = useState(false);
  const [categoriaEditandoId, setCategoriaEditandoId] = useState<string | null>(null);
  const [categoriaNome, setCategoriaNome] = useState('');
  const [savingCategoria, setSavingCategoria] = useState(false);
  const [modalEmbalagemAberto, setModalEmbalagemAberto] = useState(false);
  const [embalagemEditandoId, setEmbalagemEditandoId] = useState<string | null>(null);
  const [embalagemNome, setEmbalagemNome] = useState('');
  const [savingEmbalagem, setSavingEmbalagem] = useState(false);
  const [produtoRapidoEditandoId, setProdutoRapidoEditandoId] = useState<string | null>(null);
  const [loteEmEdicao, setLoteEmEdicao] = useState<LoteCompraCompleto | null>(null);
  const [emitidosLoteEdicao, setEmitidosLoteEdicao] = useState(0);
  const [carregandoEmitidosLote, setCarregandoEmitidosLote] = useState(false);
  const [formLoteEdicao, setFormLoteEdicao] = useState({
    quantidade: '',
    custo_unitario: '',
    fornecedor: '',
    nota_fiscal: '',
    sem_nota_fiscal: false,
    motivo_sem_nota: '',
    data_validade: '',
  });
  const [salvandoLoteEdicao, setSalvandoLoteEdicao] = useState(false);
  const [novoProduto, setNovoProduto] = useState({
    nome: '',
    unidade_medida: 'un',
    fornecedor: '',
    estoque_minimo: '0',
    custo_referencia: '',
    familia_id: '',
    embalagem_grupo_id: '',
  });

  useEffect(() => {
    if (!isUsuarioIndustria) return;
    const localId = usuario?.local_padrao_id;
    if (!localId) return;
    setForm((prev) => (prev.local_id ? prev : { ...prev, local_id: localId }));
  }, [isUsuarioIndustria, usuario?.local_padrao_id]);

  const produtoSelecionado = useMemo(
    () => produtos.find((p) => p.id === form.produto_id) || null,
    [form.produto_id, produtos]
  );
  const produtoExigeValidade = useMemo(() => {
    if (!produtoSelecionado) return true;
    return (
      (produtoSelecionado.validade_dias || 0) > 0 ||
      (produtoSelecionado.validade_horas || 0) > 0 ||
      (produtoSelecionado.validade_minutos || 0) > 0
    );
  }, [produtoSelecionado]);

  const produtoLoteEdicaoExigeValidade = useMemo(() => {
    const p = loteEmEdicao?.produto;
    if (!p) return false;
    return (
      (p.validade_dias || 0) > 0 ||
      (p.validade_horas || 0) > 0 ||
      (p.validade_minutos || 0) > 0
    );
  }, [loteEmEdicao]);

  const quantidadeCompra = useMemo(
    () => Number.parseInt(form.quantidade, 10) || 0,
    [form.quantidade]
  );
  const fatorUnidades = useMemo(() => {
    if (form.unidade_compra === 'UN') return 1;
    const fator = Number.parseInt(form.itens_por_embalagem, 10) || 0;
    return fator;
  }, [form.itens_por_embalagem, form.unidade_compra]);
  const custoEmbalagem = useMemo(
    () => Number.parseFloat((form.custo_unitario || '0').replace(',', '.')) || 0,
    [form.custo_unitario]
  );
  const quantidadeUnitaria = quantidadeCompra * fatorUnidades;
  const custoUnitarioCalculado = fatorUnidades > 0 ? custoEmbalagem / fatorUnidades : 0;
  /** Cada unidade do lote vira até um QR na separação; valores altos geram muitas etiquetas. */
  const avisoMuitosQrsSeparacao =
    form.unidade_compra !== 'UN' && fatorUnidades > 50 && quantidadeUnitaria > 0;

  const abrirNovaCategoria = () => {
    setCategoriaEditandoId(null);
    setCategoriaNome('');
    setModalCategoriaAberto(true);
  };

  const abrirEdicaoCategoriaSelecionada = () => {
    if (!novoProduto.familia_id) {
      alert('Selecione uma família para editar');
      return;
    }
    const fam = familiasLista.find((g) => g.id === novoProduto.familia_id);
    if (!fam) {
      alert('Família selecionada não encontrada');
      return;
    }
    setCategoriaEditandoId(fam.id);
    setCategoriaNome(fam.nome);
    setModalCategoriaAberto(true);
  };

  const salvarCategoria = async () => {
    const nomeFinal = categoriaNome.trim();
    if (!nomeFinal) {
      alert('Informe o nome da família');
      return;
    }

    const duplicada = familiasLista.find(
      (g) =>
        g.nome.trim().toLowerCase() === nomeFinal.toLowerCase() &&
        g.id !== categoriaEditandoId
    );
    if (duplicada) {
      alert('Já existe uma família com esse nome');
      return;
    }

    setSavingCategoria(true);
    try {
      if (categoriaEditandoId) {
        const { error } = await supabase
          .from('familias')
          .update({ nome: nomeFinal })
          .eq('id', categoriaEditandoId);
        if (error) throw error;
      } else {
        const { data: criado, error } = await supabase
          .from('familias')
          .insert({ nome: nomeFinal, cor: '#6B7280' })
          .select('id')
          .single();
        if (error) throw error;
        setNovoProduto((p) => ({ ...p, familia_id: criado.id }));
      }

      setModalCategoriaAberto(false);
      setCategoriaEditandoId(null);
      setCategoriaNome('');
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro ao salvar família'));
    } finally {
      setSavingCategoria(false);
    }
  };

  const abrirNovaEmbalagem = () => {
    setEmbalagemEditandoId(null);
    setEmbalagemNome('');
    setModalEmbalagemAberto(true);
  };

  const abrirEdicaoEmbalagemSelecionada = () => {
    if (!novoProduto.embalagem_grupo_id) {
      alert('Selecione um tipo de embalagem para editar');
      return;
    }
    const embalagem = gruposEmbalagem.find((item) => item.id === novoProduto.embalagem_grupo_id);
    if (!embalagem) {
      alert('Tipo de embalagem selecionado não encontrado');
      return;
    }
    setEmbalagemEditandoId(embalagem.id);
    setEmbalagemNome(embalagem.nome);
    setModalEmbalagemAberto(true);
  };

  const salvarEmbalagem = async () => {
    const nomeFinal = embalagemNome.trim();
    if (!nomeFinal) {
      alert('Informe o nome do tipo de embalagem');
      return;
    }
    const duplicada = gruposEmbalagem.find(
      (item) =>
        item.nome.trim().toLowerCase() === nomeFinal.toLowerCase() &&
        item.id !== embalagemEditandoId
    );
    if (duplicada) {
      alert('Já existe um tipo de embalagem com esse nome');
      return;
    }

    setSavingEmbalagem(true);
    try {
      if (embalagemEditandoId) {
        const { error } = await supabase
          .from('grupos')
          .update({ nome: nomeFinal })
          .eq('id', embalagemEditandoId);
        if (error) throw error;
      } else {
        const { data: criado, error } = await supabase
          .from('grupos')
          .insert({ nome: nomeFinal, cor: '#64748b' })
          .select('id')
          .single();
        if (error) throw error;
        setNovoProduto((p) => ({ ...p, embalagem_grupo_id: criado.id }));
      }

      setModalEmbalagemAberto(false);
      setEmbalagemEditandoId(null);
      setEmbalagemNome('');
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro ao salvar tipo de embalagem'));
    } finally {
      setSavingEmbalagem(false);
    }
  };

  const carregarFamiliaEGrupoEmbalagem = async (
    produtoId: string
  ): Promise<{ familia_id: string; embalagem_grupo_id: string }> => {
    const { data: prodRow, error: pe } = await supabase
      .from('produtos')
      .select('familia_id')
      .eq('id', produtoId)
      .maybeSingle();
    if (pe) return { familia_id: '', embalagem_grupo_id: '' };
    const { data: pgRow, error: ge } = await supabase
      .from('produto_grupos')
      .select('grupo_id')
      .eq('produto_id', produtoId)
      .limit(1)
      .maybeSingle();
    if (ge) return { familia_id: prodRow?.familia_id || '', embalagem_grupo_id: '' };
    return {
      familia_id: prodRow?.familia_id || '',
      embalagem_grupo_id: pgRow?.grupo_id || '',
    };
  };

  const handleProdutoChange = async (produtoId: string) => {
    if (!produtoId) {
      setForm((f) => ({ ...f, produto_id: '' }));
      setHintCompra(null);
      return;
    }
    const p = produtos.find((pr) => pr.id === produtoId);
    if (!p) return;

    const exigeValidade =
      (p.validade_dias || 0) > 0 ||
      (p.validade_horas || 0) > 0 ||
      (p.validade_minutos || 0) > 0;
    let dataValidadeSugerida = '';
    if (exigeValidade) {
      const now = new Date();
      now.setDate(now.getDate() + (p.validade_dias || 0));
      dataValidadeSugerida = now.toISOString().slice(0, 10);
    }

    setForm((f) => ({
      ...f,
      produto_id: produtoId,
      data_validade: dataValidadeSugerida,
      fornecedor: p.fornecedor || f.fornecedor,
      custo_unitario:
        p.custo_referencia != null ? String(p.custo_referencia) : f.custo_unitario,
    }));

    const { count } = await supabase
      .from('itens')
      .select('id', { count: 'exact', head: true })
      .eq('produto_id', produtoId)
      .eq('estado', 'EM_ESTOQUE');

    setHintCompra({
      estoqueMinimo: p.estoque_minimo ?? 0,
      qtdEmEstoque: count ?? 0,
    });
  };

  const handleSubmit = async () => {
    if (!usuario) return alert('Faça login primeiro');
    if (!form.fornecedor.trim()) return alert('Fornecedor é obrigatório');
    if (quantidadeCompra <= 0) return alert('Quantidade comprada deve ser maior que zero');
    if (custoEmbalagem < 0) return alert('Custo não pode ser negativo');
    if (form.unidade_compra !== 'UN' && fatorUnidades < 1) {
      return alert(
        'Para caixa/fardo, informe quantas unidades rastreáveis existem em cada embalagem (mínimo 1). Use 1 se só houver um QR por caixa/fardo.'
      );
    }
    if (quantidadeUnitaria <= 0) {
      return alert('Quantidade unitária calculada inválida. Revise os campos de embalagem.');
    }
    if (produtoExigeValidade && !form.data_validade) {
      return alert('Data de validade é obrigatória para este produto');
    }
    if (form.sem_nota_fiscal) {
      if (!form.motivo_sem_nota.trim()) {
        return alert('Informe o motivo de estar sem nota fiscal');
      }
    } else if (!form.nota_fiscal.trim()) {
      return alert('Nota fiscal é obrigatória ou marque "Sem nota fiscal"');
    }
    const labelUnidadeCompra =
      form.unidade_compra === 'UN'
        ? 'unidade(s)'
        : form.unidade_compra === 'CAIXA'
          ? 'caixa(s)'
          : 'fardo(s)';
    const confirmou = window.confirm(
      `Confirmar compra de ${quantidadeCompra} ${labelUnidadeCompra}?\n` +
      `Entrada no lote: ${quantidadeUnitaria} unidade(s) rastreável(eis) (sem QR ainda). Cada uma poderá gerar um QR na separação ou na produção.\n` +
      `Se você só cola um adesivo na caixa/fardo inteiro, essa quantidade deve ser o número de caixas/fardos (use «Unidades por embalagem» = 1 ou modo Unidade por caixa).\n` +
      `Custo unitário calculado (por unidade rastreável no lote): R$ ${custoUnitarioCalculado.toFixed(2)}`
    );
    if (!confirmou) return;
    setSaving(true);
    setResultado(null);
    try {
      const res = await criarLoteCompra(
        {
          produto_id: form.produto_id,
          quantidade: quantidadeUnitaria,
          custo_unitario: custoUnitarioCalculado,
          fornecedor: form.fornecedor.trim(),
          lote_fornecedor: '',
          nota_fiscal: form.sem_nota_fiscal ? null : form.nota_fiscal.trim().toUpperCase(),
          sem_nota_fiscal: form.sem_nota_fiscal,
          motivo_sem_nota: form.sem_nota_fiscal ? form.motivo_sem_nota.trim() : null,
          local_id: form.local_id,
        },
        form.data_validade || null,
        usuario.id
      );
      setResultado({ quantidadeUnidades: res.quantidadeRegistrada });
      setForm({
        produto_id: '',
        quantidade: '',
        custo_unitario: '',
        fornecedor: '',
        nota_fiscal: '',
        sem_nota_fiscal: false,
        motivo_sem_nota: '',
        local_id: '',
          data_validade: '',
        unidade_compra: 'UN',
        itens_por_embalagem: '1',
      });
      setHintCompra(null);
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro ao registrar compra'));
    } finally {
      setSaving(false);
    }
  };

  const handleCriarProdutoFornecedor = async () => {
    const nome = novoProduto.nome.trim();
    if (!nome) {
      alert('Informe o nome do produto');
      return;
    }
    setSavingProduto(true);
    try {
      const custoParsed = novoProduto.custo_referencia.trim()
        ? Number.parseFloat(novoProduto.custo_referencia.replace(',', '.'))
        : null;

      if (produtoRapidoEditandoId) {
        const { data: atualizado, error: erroAtualizacao } = await supabase
          .from('produtos')
          .update({
            nome,
            unidade_medida: novoProduto.unidade_medida,
            fornecedor: novoProduto.fornecedor.trim() || null,
            familia_id: novoProduto.familia_id || null,
            estoque_minimo: Math.max(0, Number.parseInt(novoProduto.estoque_minimo, 10) || 0),
            custo_referencia: Number.isFinite(custoParsed as number) ? custoParsed : null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', produtoRapidoEditandoId)
          .select()
          .single();
        if (erroAtualizacao) throw erroAtualizacao;

        await supabase.from('produto_grupos').delete().eq('produto_id', produtoRapidoEditandoId);
        if (novoProduto.embalagem_grupo_id) {
          await supabase.from('produto_grupos').insert({
            produto_id: produtoRapidoEditandoId,
            grupo_id: novoProduto.embalagem_grupo_id,
          });
        }

        await refetch();
        setModalProdutoAberto(false);
        setProdutoRapidoEditandoId(null);
        setNovoProduto({
          nome: '',
          unidade_medida: 'un',
          fornecedor: '',
          estoque_minimo: '0',
          custo_referencia: '',
          familia_id: '',
          embalagem_grupo_id: '',
        });
        await handleProdutoChange(atualizado.id);
      } else {
        const { data: criado, error } = await supabase
          .from('produtos')
          .insert({
            nome,
            unidade_medida: novoProduto.unidade_medida,
            fornecedor: novoProduto.fornecedor.trim() || null,
            origem: 'COMPRA',
            familia_id: novoProduto.familia_id || null,
            estoque_minimo: Math.max(0, Number.parseInt(novoProduto.estoque_minimo, 10) || 0),
            custo_referencia: Number.isFinite(custoParsed as number) ? custoParsed : null,
            validade_dias: 0,
            validade_horas: 0,
            validade_minutos: 0,
            contagem_do_dia: false,
            exibir_horario_etiqueta: false,
          })
          .select()
          .single();
        if (error) throw error;

        await supabase.from('estoque').insert({ produto_id: criado.id, quantidade: 0 });

        if (novoProduto.embalagem_grupo_id) {
          await supabase.from('produto_grupos').insert({
            produto_id: criado.id,
            grupo_id: novoProduto.embalagem_grupo_id,
          });
        }

        await refetch();
        setModalProdutoAberto(false);
        setProdutoRapidoEditandoId(null);
        setNovoProduto({
          nome: '',
          unidade_medida: 'un',
          fornecedor: '',
          estoque_minimo: '0',
          custo_referencia: '',
          familia_id: '',
          embalagem_grupo_id: '',
        });
        await handleProdutoChange(criado.id);
      }
    } catch (err: unknown) {
      alert(errMessage(err, 'Erro ao criar produto'));
    } finally {
      setSavingProduto(false);
    }
  };

  const abrirEdicaoLote = async (lote: LoteCompraCompleto) => {
    setLoteEmEdicao(lote);
    setFormLoteEdicao({
      quantidade: String(lote.quantidade),
      custo_unitario: String(lote.custo_unitario),
      fornecedor: lote.fornecedor,
      nota_fiscal: lote.nota_fiscal || '',
      sem_nota_fiscal: lote.sem_nota_fiscal,
      motivo_sem_nota: lote.motivo_sem_nota || '',
      data_validade: lote.data_validade ? String(lote.data_validade).slice(0, 10) : '',
    });
    setCarregandoEmitidosLote(true);
    try {
      const n = await contarItensDoLoteCompra(lote.id);
      setEmitidosLoteEdicao(n);
    } catch {
      setEmitidosLoteEdicao(0);
    } finally {
      setCarregandoEmitidosLote(false);
    }
  };

  const fecharEdicaoLote = () => {
    setLoteEmEdicao(null);
    setEmitidosLoteEdicao(0);
    setCarregandoEmitidosLote(false);
  };

  const salvarEdicaoLote = async () => {
    if (!usuario || !loteEmEdicao) return;
    const q = Number.parseInt(formLoteEdicao.quantidade.trim(), 10);
    const custo = Number.parseFloat(String(formLoteEdicao.custo_unitario).replace(',', '.'));
    if (!Number.isFinite(q) || q < 1) {
      alert('Informe a quantidade em unidades (inteiro ≥ 1).');
      return;
    }
    if (!Number.isFinite(custo) || custo < 0) {
      alert('Custo unitário inválido.');
      return;
    }
    if (q < emitidosLoteEdicao) {
      alert(
        `Este lote já tem ${emitidosLoteEdicao} QR emitido(s). A quantidade não pode ser menor que isso.`
      );
      return;
    }
    if (produtoLoteEdicaoExigeValidade && !formLoteEdicao.data_validade.trim()) {
      alert('Data de validade é obrigatória para este produto.');
      return;
    }
    if (formLoteEdicao.sem_nota_fiscal) {
      if (!formLoteEdicao.motivo_sem_nota.trim()) {
        alert('Informe o motivo de estar sem nota fiscal.');
        return;
      }
    } else if (!formLoteEdicao.nota_fiscal.trim()) {
      alert('Nota fiscal é obrigatória ou marque «Sem nota fiscal».');
      return;
    }
    if (!formLoteEdicao.fornecedor.trim()) {
      alert('Fornecedor é obrigatório.');
      return;
    }
    if (
      !window.confirm(
        `Salvar correção deste lançamento?\nProduto: ${loteEmEdicao.produto?.nome || '—'}\nQuantidade no lote: ${q} un. (mínimo por QR já emitidos: ${emitidosLoteEdicao})`
      )
    ) {
      return;
    }
    setSalvandoLoteEdicao(true);
    try {
      await atualizarLoteCompra(
        loteEmEdicao.id,
        {
          quantidade: q,
          custo_unitario: custo,
          fornecedor: formLoteEdicao.fornecedor.trim(),
          nota_fiscal: formLoteEdicao.sem_nota_fiscal ? null : formLoteEdicao.nota_fiscal.trim(),
          sem_nota_fiscal: formLoteEdicao.sem_nota_fiscal,
          motivo_sem_nota: formLoteEdicao.sem_nota_fiscal ? formLoteEdicao.motivo_sem_nota.trim() : null,
          data_validade: formLoteEdicao.data_validade.trim() || null,
        },
        usuario.id
      );
      await refetchLotesRecentes();
      fecharEdicaoLote();
      alert('Lançamento de compra atualizado.');
    } catch (err: unknown) {
      alert(errMessage(err, 'Não foi possível atualizar o lote'));
    } finally {
      setSalvandoLoteEdicao(false);
    }
  };

  if (loadProd) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
          <PackageCheck className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrar Compra</h1>
          <p className="text-sm text-gray-500">
            O lote guarda <strong>unidades rastreáveis</strong> (cada uma → até um QR na separação). Caixa com muitas peças
            internas: conte <strong>caixas</strong>, não peças — veja o aviso abaixo no formulário.
          </p>
        </div>
      </div>

      <Link
        href="/entrada-compra-nota"
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-900 shadow-sm transition-colors hover:bg-violet-100 active:bg-violet-100 touch-manipulation"
      >
        <Camera className="h-5 w-5 shrink-0" aria-hidden />
        Compra por foto da nota (OCR)
      </Link>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div>
            <p className="font-semibold text-green-800">Lote registrado!</p>
            <p className="text-sm text-green-600">
              {resultado.quantidadeUnidades} unidade(s) rastreável(eis) no lote. Cada uma pode virar um QR ao separar para a
              loja ou ao usar na produção.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <Select
          label="Produto"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...produtosCompra.map((p) => ({ value: p.id, label: p.nome })),
          ]}
          value={form.produto_id}
          onChange={(e) => void handleProdutoChange(e.target.value)}
        />
        {isUsuarioIndustria && receitaInsumos.length === 0 && (
          <p className="text-sm text-amber-700">
            Nenhuma receita de produção encontrada. Cadastre receitas/insumos para liberar produtos de compra na indústria.
          </p>
        )}
        <div className="flex justify-end gap-2 flex-wrap">
          {form.produto_id && (
            <Button
              variant="outline"
              onClick={() => {
                void (async () => {
                  const produtoSelecionado = produtos.find((p) => p.id === form.produto_id);
                  if (!produtoSelecionado) {
                    alert('Selecione um produto válido para editar');
                    return;
                  }
                  const { familia_id: fid, embalagem_grupo_id: egid } =
                    await carregarFamiliaEGrupoEmbalagem(produtoSelecionado.id);
                  setProdutoRapidoEditandoId(produtoSelecionado.id);
                  setNovoProduto({
                    nome: produtoSelecionado.nome,
                    unidade_medida: produtoSelecionado.unidade_medida || 'un',
                    fornecedor: produtoSelecionado.fornecedor || '',
                    estoque_minimo: String(produtoSelecionado.estoque_minimo ?? 0),
                    custo_referencia:
                      produtoSelecionado.custo_referencia != null
                        ? String(produtoSelecionado.custo_referencia)
                        : '',
                    familia_id: fid,
                    embalagem_grupo_id: egid,
                  });
                  setModalProdutoAberto(true);
                })();
              }}
            >
              Editar produto selecionado
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              setProdutoRapidoEditandoId(null);
              setNovoProduto({
                nome: '',
                unidade_medida: 'un',
                fornecedor: '',
                estoque_minimo: '0',
                custo_referencia: '',
                familia_id: '',
                embalagem_grupo_id: '',
              });
              setModalProdutoAberto(true);
            }}
          >
            + Novo produto de fornecedor
          </Button>
        </div>
        {produtosCompra.length === 0 && (
          <p className="text-sm text-amber-600">
            Nenhum produto para compra. Cadastre com origem &quot;Compra&quot; ou &quot;Compra e produção&quot;.
          </p>
        )}
        {hintCompra && form.produto_id && (
          <div
            className={`rounded-lg border p-3 text-sm ${
              hintCompra.qtdEmEstoque <= hintCompra.estoqueMinimo
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-gray-200 bg-gray-50 text-gray-700'
            }`}
          >
            <p className="font-medium flex items-center gap-2">
              {hintCompra.qtdEmEstoque <= hintCompra.estoqueMinimo && (
                <AlertTriangle className="w-4 h-4 shrink-0" />
              )}
              Estoque atual: <span className="tabular-nums">{hintCompra.qtdEmEstoque}</span> unidades (QR) no armazém
            </p>
            <p className="mt-1 text-xs opacity-90">
              Estoque mínimo cadastrado: <span className="tabular-nums font-medium">{hintCompra.estoqueMinimo}</span>
              {hintCompra.qtdEmEstoque <= hintCompra.estoqueMinimo && hintCompra.estoqueMinimo > 0
                ? ' — abaixo ou no limite; considere repor.'
                : null}
            </p>
            <p className="mt-2 text-xs opacity-90 border-t border-black/5 pt-2">
              O mínimo e este saldo contam <strong>unidades com QR</strong> (ex.: se o produto é «caixa fechada», cada caixa = 1).
            </p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select
            label="Unidade de compra"
            options={[
              { value: 'UN', label: 'Unidade' },
              { value: 'CAIXA', label: 'Caixa' },
              { value: 'FARDO', label: 'Fardo' },
            ]}
            value={form.unidade_compra}
            onChange={(e) => {
              const v = e.target.value as UnidadeCompra;
              setForm((prev) => ({
                ...prev,
                unidade_compra: v,
                itens_por_embalagem:
                  v === 'UN' ? '1' : prev.unidade_compra === 'UN' ? '1' : prev.itens_por_embalagem,
              }));
            }}
          />
          {form.unidade_compra === 'UN' ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <p>
                Cada <strong>unidade comprada</strong> vira 1 linha no lote e, na separação, até <strong>1 QR</strong>. Se a
                unidade física for uma <strong>caixa inteira</strong>, a quantidade é o número de caixas (não o de tampas
                dentro).
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Input
                label="Unidades rastreáveis por embalagem"
                type="number"
                min="1"
                value={form.itens_por_embalagem}
                onChange={(e) => setForm({ ...form, itens_por_embalagem: e.target.value })}
                required
              />
              <p className="text-xs text-gray-600 leading-relaxed">
                Quantas <strong>unidades do lote</strong> (e futuros QRs) cada caixa/fardo representa. Só um adesivo na
                embalagem fechada → use <strong>1</strong>. O total de peças dentro (ex.: 700 tampas) pode ficar só no{' '}
                <strong>nome do produto</strong>, não aqui.
              </p>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label={
              form.unidade_compra === 'UN'
                ? 'Quantidade (unidades)'
                : form.unidade_compra === 'CAIXA'
                  ? 'Quantidade (caixas)'
                  : 'Quantidade (fardos)'
            }
            type="number"
            min="1"
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
            required
          />
          <Input
            label={
              form.unidade_compra === 'UN'
                ? 'Custo Unitário (R$)'
                : form.unidade_compra === 'CAIXA'
                  ? 'Custo por Caixa (R$)'
                  : 'Custo por Fardo (R$)'
            }
            type="number"
            step="0.01"
            min="0"
            value={form.custo_unitario}
            onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })}
            required
          />
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900 space-y-1">
          <p>
            Total no lote: <span className="font-semibold tabular-nums">{quantidadeUnitaria}</span> unidade(s){' '}
            <strong>rastreável(eis)</strong> (cada uma pode gerar um QR na separação ou na produção). Custo por unidade
            rastreável: <span className="font-semibold tabular-nums">R$ {custoUnitarioCalculado.toFixed(2)}</span>
          </p>
        </div>
        {avisoMuitosQrsSeparacao ? (
          <div
            className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950"
            role="status"
          >
            <p className="font-medium">Muitos QRs na separação</p>
            <p className="mt-1 leading-relaxed">
              Com <span className="tabular-nums font-semibold">{fatorUnidades}</span> unidades rastreáveis por embalagem, ao
              enviar mercadoria para a loja o sistema poderá gerar etiquetas demais para conferir. Se a operação real usa{' '}
              <strong>só um QR por caixa/fardo</strong>, ajuste o campo acima para <strong>1</strong> ou use modo{' '}
              <strong>Unidade</strong> contando caixas.
            </p>
          </div>
        ) : null}
        <Input
          label="Fornecedor"
          required
          value={form.fornecedor}
          onChange={(e) => setForm({ ...form, fornecedor: e.target.value })}
        />
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          O lote interno desta compra será gerado automaticamente no salvamento para rastreio de QRs e relatórios.
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={form.sem_nota_fiscal}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                sem_nota_fiscal: e.target.checked,
                nota_fiscal: e.target.checked ? '' : prev.nota_fiscal,
              }))
            }
            className="rounded border-gray-300"
          />
          Sem nota fiscal
        </label>
        {form.sem_nota_fiscal ? (
          <Input
            label="Motivo sem nota fiscal"
            required
            value={form.motivo_sem_nota}
            onChange={(e) => setForm({ ...form, motivo_sem_nota: e.target.value })}
          />
        ) : (
          <Input
            label="Nota Fiscal"
            required
            placeholder="Ex: NF-000123"
            value={form.nota_fiscal}
            onChange={(e) => setForm({ ...form, nota_fiscal: e.target.value })}
          />
        )}
        <Select
          label="Local de Entrada"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...warehousesPermitidos.map((l) => ({ value: l.id, label: l.nome })),
          ]}
          value={form.local_id}
          onChange={(e) => setForm({ ...form, local_id: e.target.value })}
          disabled={isUsuarioIndustria}
        />
        {isUsuarioIndustria && !usuario?.local_padrao_id && (
          <p className="text-sm text-amber-700">
            Seu usuário da indústria está sem <strong>local padrão</strong>. Defina o armazém em Cadastros → Usuários e relogue.
          </p>
        )}
        <Input
          label={produtoExigeValidade ? 'Data de Validade' : 'Data de Validade (opcional)'}
          type="date"
          value={form.data_validade}
          onChange={(e) => setForm({ ...form, data_validade: e.target.value })}
          required={produtoExigeValidade}
        />
        {!produtoExigeValidade && (
          <p className="text-xs text-gray-500 -mt-2">
            Este produto está sem regra de validade no cadastro; o campo pode ficar em branco.
          </p>
        )}

        <Button
          variant="primary"
          className="w-full"
          onClick={handleSubmit}
          disabled={
            saving ||
            !form.produto_id ||
            !form.quantidade ||
            !form.custo_unitario ||
            !form.local_id ||
            (produtoExigeValidade && !form.data_validade) ||
            !form.fornecedor.trim() ||
            (form.unidade_compra !== 'UN' && fatorUnidades < 1) ||
            quantidadeUnitaria <= 0 ||
            (!form.sem_nota_fiscal && !form.nota_fiscal.trim()) ||
            (form.sem_nota_fiscal && !form.motivo_sem_nota.trim())
          }
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar Compra
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3 mb-6">
        <h2 className="text-lg font-semibold text-gray-900">Corrigir lançamentos recentes</h2>
        <p className="text-xs text-gray-600 leading-relaxed">
          Ajuste quantidade, custo, nota, fornecedor ou validade de uma <strong>entrada já salva</strong>. O sistema não
          permite deixar a quantidade do lote menor que o número de <strong>QR já emitidos</strong> a partir dele
          (separação/produção).
        </p>
        {loadLotesRecentes ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : lotesRecentes.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum lote de compra encontrado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="py-2 pr-2 font-medium">Data</th>
                  <th className="py-2 pr-2 font-medium">Produto</th>
                  <th className="py-2 pr-2 font-medium">Local</th>
                  <th className="py-2 pr-2 font-medium tabular-nums">Qtd</th>
                  <th className="py-2 pr-2 font-medium">Lote</th>
                  <th className="py-2 pr-2 font-medium">NF</th>
                  <th className="py-2 pl-2 font-medium w-24" />
                </tr>
              </thead>
              <tbody>
                {lotesRecentes.map((l) => {
                  const dt = l.created_at ? new Date(l.created_at) : null;
                  const dataStr = dt && !Number.isNaN(dt.getTime()) ? dt.toLocaleString('pt-BR') : '—';
                  const nomeProd = l.produto && typeof l.produto === 'object' && 'nome' in l.produto
                    ? (l.produto as { nome: string }).nome
                    : '—';
                  const nomeLoc = l.local && typeof l.local === 'object' && 'nome' in l.local
                    ? (l.local as { nome: string }).nome
                    : '—';
                  const nf = l.sem_nota_fiscal ? 'S/NF' : (l.nota_fiscal || '—');
                  return (
                    <tr key={l.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2 whitespace-nowrap text-gray-700">{dataStr}</td>
                      <td className="py-2 pr-2 max-w-[140px] truncate" title={nomeProd}>
                        {nomeProd}
                      </td>
                      <td className="py-2 pr-2 max-w-[100px] truncate" title={nomeLoc}>
                        {nomeLoc}
                      </td>
                      <td className="py-2 pr-2 tabular-nums font-medium">{l.quantidade}</td>
                      <td className="py-2 pr-2 font-mono text-[11px] truncate max-w-[100px]" title={l.lote_fornecedor}>
                        {l.lote_fornecedor}
                      </td>
                      <td className="py-2 pr-2 truncate max-w-[80px]" title={nf}>
                        {nf}
                      </td>
                      <td className="py-2 pl-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="!px-2 !py-1 text-xs"
                          onClick={() => void abrirEdicaoLote(l)}
                        >
                          <Pencil className="w-3.5 h-3.5 mr-1" />
                          Editar
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={loteEmEdicao !== null}
        onClose={() => {
          if (!salvandoLoteEdicao) fecharEdicaoLote();
        }}
        title="Corrigir lançamento de compra"
        subtitle={loteEmEdicao?.produto && typeof loteEmEdicao.produto === 'object' && 'nome' in loteEmEdicao.produto
          ? (loteEmEdicao.produto as { nome: string }).nome
          : undefined}
        size="md"
      >
        <div className="p-6 space-y-4">
          {loteEmEdicao && (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700 space-y-1">
                <p>
                  <span className="text-gray-500">Lote interno:</span>{' '}
                  <code className="text-[11px]">{loteEmEdicao.lote_fornecedor}</code>
                </p>
                <p>
                  <span className="text-gray-500">Local:</span>{' '}
                  {loteEmEdicao.local && typeof loteEmEdicao.local === 'object' && 'nome' in loteEmEdicao.local
                    ? (loteEmEdicao.local as { nome: string }).nome
                    : '—'}
                </p>
                {carregandoEmitidosLote ? (
                  <p className="flex items-center gap-2 text-blue-700">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Verificando QR já emitidos…
                  </p>
                ) : (
                  <p>
                    <span className="text-gray-500">QR já emitidos deste lote:</span>{' '}
                    <strong className="tabular-nums">{emitidosLoteEdicao}</strong> — a quantidade não pode ser menor que
                    isso.
                  </p>
                )}
              </div>
              <Input
                label="Quantidade no lote (unidades)"
                type="number"
                min={Math.max(1, emitidosLoteEdicao)}
                value={formLoteEdicao.quantidade}
                onChange={(e) => setFormLoteEdicao((f) => ({ ...f, quantidade: e.target.value }))}
                required
              />
              <Input
                label="Custo unitário (R$)"
                type="text"
                inputMode="decimal"
                value={formLoteEdicao.custo_unitario}
                onChange={(e) => setFormLoteEdicao((f) => ({ ...f, custo_unitario: e.target.value }))}
                required
              />
              <Input
                label="Fornecedor"
                value={formLoteEdicao.fornecedor}
                onChange={(e) => setFormLoteEdicao((f) => ({ ...f, fornecedor: e.target.value }))}
                required
              />
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={formLoteEdicao.sem_nota_fiscal}
                  onChange={(e) =>
                    setFormLoteEdicao((prev) => ({
                      ...prev,
                      sem_nota_fiscal: e.target.checked,
                      nota_fiscal: e.target.checked ? '' : prev.nota_fiscal,
                    }))
                  }
                  className="rounded border-gray-300"
                />
                Sem nota fiscal
              </label>
              {formLoteEdicao.sem_nota_fiscal ? (
                <Input
                  label="Motivo sem nota fiscal"
                  value={formLoteEdicao.motivo_sem_nota}
                  onChange={(e) => setFormLoteEdicao((f) => ({ ...f, motivo_sem_nota: e.target.value }))}
                  required
                />
              ) : (
                <Input
                  label="Nota fiscal"
                  value={formLoteEdicao.nota_fiscal}
                  onChange={(e) => setFormLoteEdicao((f) => ({ ...f, nota_fiscal: e.target.value }))}
                  required
                />
              )}
              <Input
                label={produtoLoteEdicaoExigeValidade ? 'Data de validade' : 'Data de validade (opcional)'}
                type="date"
                value={formLoteEdicao.data_validade}
                onChange={(e) => setFormLoteEdicao((f) => ({ ...f, data_validade: e.target.value }))}
                required={produtoLoteEdicaoExigeValidade}
              />
              {!produtoLoteEdicaoExigeValidade && (
                <p className="text-xs text-gray-500 -mt-2">
                  Produto sem regra de validade no cadastro — pode deixar em branco.
                </p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  type="button"
                  disabled={salvandoLoteEdicao}
                  onClick={fecharEdicaoLote}
                >
                  Cancelar
                </Button>
                <Button
                  variant="primary"
                  className="flex-1"
                  type="button"
                  disabled={salvandoLoteEdicao || carregandoEmitidosLote}
                  onClick={() => void salvarEdicaoLote()}
                >
                  {salvandoLoteEdicao ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Salvar correção
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={modalProdutoAberto}
        onClose={() => {
          setModalProdutoAberto(false);
          setProdutoRapidoEditandoId(null);
        }}
        title={produtoRapidoEditandoId ? 'Editar produto selecionado' : 'Novo produto de fornecedor'}
        subtitle={produtoRapidoEditandoId ? 'Ajuste rápido sem sair da compra' : 'Cadastro rápido sem sair da compra'}
        size="md"
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nome do produto"
            value={novoProduto.nome}
            onChange={(e) => setNovoProduto((p) => ({ ...p, nome: e.target.value }))}
            required
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Unidade"
              options={[
                { value: 'un', label: 'Unidade (un)' },
                { value: 'kg', label: 'Quilo (kg)' },
                { value: 'g', label: 'Grama (g)' },
                { value: 'l', label: 'Litro (l)' },
                { value: 'ml', label: 'Mililitro (ml)' },
              ]}
              value={novoProduto.unidade_medida}
              onChange={(e) => setNovoProduto((p) => ({ ...p, unidade_medida: e.target.value }))}
            />
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 flex items-center">
              Validade e quantidade entram no momento de registrar a compra.
            </div>
          </div>
          <Input
            label="Fornecedor preferencial"
            value={novoProduto.fornecedor}
            onChange={(e) => setNovoProduto((p) => ({ ...p, fornecedor: e.target.value }))}
          />
          <Select
            label="Família do produto (categoria)"
            options={[
              { value: '', label: 'Selecione...' },
              ...familiasLista.map((g) => ({ value: g.id, label: g.nome })),
            ]}
            value={novoProduto.familia_id}
            onChange={(e) => setNovoProduto((p) => ({ ...p, familia_id: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2 -mt-2">
            <Button variant="outline" size="sm" onClick={abrirNovaCategoria}>
              + Nova família
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={abrirEdicaoCategoriaSelecionada}
              disabled={!novoProduto.familia_id}
            >
              Editar família selecionada
            </Button>
          </div>
          <Select
            label="Tipo de embalagem"
            options={[
              { value: '', label: 'Selecione (opcional)...' },
              ...gruposEmbalagem.map((item) => ({ value: item.id, label: item.nome })),
            ]}
            value={novoProduto.embalagem_grupo_id}
            onChange={(e) => setNovoProduto((p) => ({ ...p, embalagem_grupo_id: e.target.value }))}
          />
          <div className="flex flex-wrap gap-2 -mt-2">
            <Button variant="outline" size="sm" onClick={abrirNovaEmbalagem}>
              + Novo tipo de embalagem
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={abrirEdicaoEmbalagemSelecionada}
              disabled={!novoProduto.embalagem_grupo_id}
            >
              Editar tipo selecionado
            </Button>
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Família em <strong>Cadastros → Categorias</strong>. Caixa, balde, pote em <strong>Cadastros → Tipos de embalagem</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Estoque mínimo"
              type="number"
              min="0"
              value={novoProduto.estoque_minimo}
              onChange={(e) => setNovoProduto((p) => ({ ...p, estoque_minimo: e.target.value }))}
            />
            <Input
              label="Custo de referência (R$)"
              type="text"
              inputMode="decimal"
              placeholder="Ex: 12,90"
              value={novoProduto.custo_referencia}
              onChange={(e) => setNovoProduto((p) => ({ ...p, custo_referencia: e.target.value }))}
            />
          </div>
          <p className="text-xs text-gray-500">
            Depois de criar, o produto já fica selecionado aqui para você continuar a compra.
          </p>
          <Button
            variant="primary"
            className="w-full"
            onClick={() => void handleCriarProdutoFornecedor()}
            disabled={savingProduto || !novoProduto.nome.trim()}
          >
            {savingProduto ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {produtoRapidoEditandoId ? 'Salvar e continuar compra' : 'Criar e continuar compra'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modalCategoriaAberto}
        onClose={() => setModalCategoriaAberto(false)}
        title={categoriaEditandoId ? 'Editar família' : 'Nova família'}
        size="sm"
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nome da família"
            value={categoriaNome}
            onChange={(e) => setCategoriaNome(e.target.value)}
            required
          />
          <Button
            variant="primary"
            className="w-full"
            onClick={() => void salvarCategoria()}
            disabled={savingCategoria || !categoriaNome.trim()}
          >
            {savingCategoria ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {categoriaEditandoId ? 'Salvar família' : 'Criar família'}
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={modalEmbalagemAberto}
        onClose={() => setModalEmbalagemAberto(false)}
        title={embalagemEditandoId ? 'Editar tipo de embalagem' : 'Novo tipo de embalagem'}
        size="sm"
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nome do tipo de embalagem"
            value={embalagemNome}
            onChange={(e) => setEmbalagemNome(e.target.value)}
            required
          />
          <Button
            variant="primary"
            className="w-full"
            onClick={() => void salvarEmbalagem()}
            disabled={savingEmbalagem || !embalagemNome.trim()}
          >
            {savingEmbalagem ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {embalagemEditandoId ? 'Salvar tipo de embalagem' : 'Criar tipo de embalagem'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
