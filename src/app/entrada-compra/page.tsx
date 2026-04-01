'use client';

import { useMemo, useState } from 'react';
import { PackageCheck, Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { criarLoteCompra } from '@/lib/services/lotes-compra';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';

type UnidadeCompra = 'UN' | 'CAIXA' | 'FARDO';
interface FamiliaOpt {
  id: string;
  nome: string;
}
interface GrupoEmbalagem {
  id: string;
  nome: string;
}

export default function EntradaCompraPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading: loadProd, refetch } = useRealtimeQuery<Produto>({
    table: 'produtos',
    select: '*',
    orderBy: { column: 'nome', ascending: true },
  });
  const produtosCompra = produtos.filter(
    (p) => !p.origem || p.origem === 'COMPRA' || p.origem === 'AMBOS'
  );
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

  const warehouses = locais.filter(l => l.tipo === 'WAREHOUSE');

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
  const [resultado, setResultado] = useState<{ itens: number } | null>(null);
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
  const [novoProduto, setNovoProduto] = useState({
    nome: '',
    unidade_medida: 'un',
    fornecedor: '',
    estoque_minimo: '0',
    custo_referencia: '',
    familia_id: '',
    embalagem_grupo_id: '',
  });

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
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar família');
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
    } catch (err: any) {
      alert(err?.message || 'Erro ao salvar tipo de embalagem');
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
    if (form.unidade_compra !== 'UN' && fatorUnidades <= 1) {
      return alert('Para caixa/fardo, informe quantas unidades existem em cada embalagem');
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
      `Conversão: ${quantidadeUnitaria} item(ns) unitários com QR.\n` +
      `Custo unitário calculado: R$ ${custoUnitarioCalculado.toFixed(2)}`
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
      setResultado({ itens: res.itensGerados });
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
    } catch (err: any) {
      alert(err?.message || 'Erro ao registrar compra');
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
    } catch (err: any) {
      alert(err?.message || 'Erro ao criar produto');
    } finally {
      setSavingProduto(false);
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
          <p className="text-sm text-gray-500">Registre a compra do dia: cada lançamento gera um novo lote com sua validade</p>
        </div>
      </div>

      {resultado && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div>
            <p className="font-semibold text-green-800">Lote registrado!</p>
            <p className="text-sm text-green-600">{resultado.itens} itens gerados com QR</p>
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
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                unidade_compra: e.target.value as UnidadeCompra,
                itens_por_embalagem: e.target.value === 'UN' ? '1' : prev.itens_por_embalagem,
              }))
            }
          />
          {form.unidade_compra === 'UN' ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 flex items-center">
              Compra unitária: cada item comprado gera 1 QR.
            </div>
          ) : (
            <Input
              label="Unidades por embalagem"
              type="number"
              min="2"
              value={form.itens_por_embalagem}
              onChange={(e) => setForm({ ...form, itens_por_embalagem: e.target.value })}
              required
            />
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
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
          Conversão da compra: <span className="font-semibold tabular-nums">{quantidadeUnitaria}</span> item(ns) unitários com QR
          {' '}• Custo unitário estimado:{' '}
          <span className="font-semibold tabular-nums">R$ {custoUnitarioCalculado.toFixed(2)}</span>
        </div>
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
          options={[{ value: '', label: 'Selecione...' }, ...warehouses.map(l => ({ value: l.id, label: l.nome }))]}
          value={form.local_id}
          onChange={(e) => setForm({ ...form, local_id: e.target.value })}
        />
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
            (form.unidade_compra !== 'UN' && fatorUnidades <= 1) ||
            quantidadeUnitaria <= 0 ||
            (!form.sem_nota_fiscal && !form.nota_fiscal.trim()) ||
            (form.sem_nota_fiscal && !form.motivo_sem_nota.trim())
          }
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Registrar Compra
        </Button>
      </div>

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
