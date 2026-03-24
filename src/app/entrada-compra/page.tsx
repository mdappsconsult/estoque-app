'use client';

import { useState } from 'react';
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
  });
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number } | null>(null);
  const [hintCompra, setHintCompra] = useState<{
    estoqueMinimo: number;
    qtdEmEstoque: number;
  } | null>(null);
  const [modalProdutoAberto, setModalProdutoAberto] = useState(false);
  const [savingProduto, setSavingProduto] = useState(false);
  const [novoProduto, setNovoProduto] = useState({
    nome: '',
    unidade_medida: 'un',
    fornecedor: '',
    estoque_minimo: '0',
    custo_referencia: '',
  });

  const handleProdutoChange = async (produtoId: string) => {
    if (!produtoId) {
      setForm((f) => ({ ...f, produto_id: '' }));
      setHintCompra(null);
      return;
    }
    const p = produtos.find((pr) => pr.id === produtoId);
    if (!p) return;

    const now = new Date();
    now.setDate(now.getDate() + p.validade_dias);

    setForm((f) => ({
      ...f,
      produto_id: produtoId,
      data_validade: now.toISOString().slice(0, 10),
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
    if (form.sem_nota_fiscal) {
      if (!form.motivo_sem_nota.trim()) {
        return alert('Informe o motivo de estar sem nota fiscal');
      }
    } else if (!form.nota_fiscal.trim()) {
      return alert('Nota fiscal é obrigatória ou marque "Sem nota fiscal"');
    }
    setSaving(true);
    setResultado(null);
    try {
      const res = await criarLoteCompra(
        {
          produto_id: form.produto_id,
          quantidade: Number(form.quantidade),
          custo_unitario: Number(form.custo_unitario),
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

      const { data: criado, error } = await supabase
        .from('produtos')
        .insert({
          nome,
          unidade_medida: novoProduto.unidade_medida,
          fornecedor: novoProduto.fornecedor.trim() || null,
          origem: 'COMPRA',
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

      await refetch();
      setModalProdutoAberto(false);
      setNovoProduto({
        nome: '',
        unidade_medida: 'un',
        fornecedor: '',
        estoque_minimo: '0',
        custo_referencia: '',
      });
      await handleProdutoChange(criado.id);
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
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setModalProdutoAberto(true)}>
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
        <div className="grid grid-cols-2 gap-4">
          <Input label="Quantidade" type="number" min="1" value={form.quantidade} onChange={(e) => setForm({ ...form, quantidade: e.target.value })} required />
          <Input label="Custo Unitário (R$)" type="number" step="0.01" min="0" value={form.custo_unitario} onChange={(e) => setForm({ ...form, custo_unitario: e.target.value })} required />
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
        <Input label="Data de Validade" type="date" value={form.data_validade} onChange={(e) => setForm({ ...form, data_validade: e.target.value })} required />

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
            !form.data_validade ||
            !form.fornecedor.trim() ||
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
        onClose={() => setModalProdutoAberto(false)}
        title="Novo produto de fornecedor"
        subtitle="Cadastro rápido sem sair da compra"
        size="md"
      >
        <div className="p-6 space-y-4">
          <Input
            label="Nome do produto"
            value={novoProduto.nome}
            onChange={(e) => setNovoProduto((p) => ({ ...p, nome: e.target.value }))}
            required
          />
          <div className="grid grid-cols-2 gap-4">
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
          <div className="grid grid-cols-2 gap-4">
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
            Criar e continuar compra
          </Button>
        </div>
      </Modal>
    </div>
  );
}
