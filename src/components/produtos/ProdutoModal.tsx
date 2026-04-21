'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import { Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Grupo {
  id: string;
  nome: string;
  cor: string;
}

interface FamiliaRow {
  id: string;
  nome: string;
  cor: string;
}

interface ProdutoEditando {
  id: string;
  nome: string;
  medida: string | null;
  unidade_medida: string;
  marca: string | null;
  fornecedor: string | null;
  sif: string | null;
  codigo_barras?: string | null;
  origem: 'COMPRA' | 'PRODUCAO' | 'AMBOS';
  estoque_minimo: number;
  custo_referencia: number | null;
  validade_dias: number;
  validade_horas: number;
  validade_minutos: number;
  exibir_horario_etiqueta: boolean;
  contagem_do_dia: boolean;
  /** `industria`: não entra em reposição/contagem de loja. */
  escopo_reposicao?: 'loja' | 'industria';
  familia_id: string | null;
  /** Tipos de embalagem (`grupos`) */
  grupos: { id: string; nome: string; cor: string }[];
  conservacoes: { id: string; tipo: string; status: string | null; dias: number; horas: number; minutos: number }[];
  producao_consumo_por_massa?: boolean;
  producao_gramas_por_embalagem?: number | null;
  producao_gramas_por_dose?: number | null;
}

/** Payload enviado por `onSave` (cadastro de produto). */
export interface ProdutoModalSavePayload {
  nome: string;
  medida: string;
  unidadeMedida: string;
  familiaId: string | null;
  embalagemGrupoIds: string[];
  marca: string;
  fornecedor: string | null;
  sif: string;
  /** EAN/GTIN (somente dígitos) ou null. */
  codigoBarras: string | null;
  origem: 'COMPRA' | 'PRODUCAO' | 'AMBOS';
  estoqueMinimo: number;
  custoReferencia: number | null;
  conservacoes: Array<{ tipo: string; status: string; dias: number; horas: number; minutos: number }>;
  validadeDias: number;
  validadeHoras: number;
  validadeMinutos: number;
  exibirHorarioEtiqueta: boolean;
  contagemDoDia: boolean;
  escopoReposicao: 'loja' | 'industria';
  producaoConsumoPorMassa: boolean;
  producaoGramasPorEmbalagem: number | null;
  producaoGramasPorDose: number | null;
}

interface ProdutoModalProps {
  isOpen: boolean;
  onClose: () => void;
  produto?: ProdutoEditando | null;
  onSave: (produto: ProdutoModalSavePayload) => void;
}

const unidadesMedida = [
  { value: 'l', label: 'Litros (l)' },
  { value: 'kg', label: 'Quilogramas (kg)' },
  { value: 'g', label: 'Gramas (g)' },
  { value: 'ml', label: 'Mililitros (ml)' },
  { value: 'un', label: 'Unidades (un)' },
];

const tiposConservacao = [
  { value: 'resfriado', label: 'Resfriado' },
  { value: 'congelado', label: 'Congelado' },
  { value: 'ambiente', label: 'Ambiente' },
  { value: 'quente', label: 'Quente' },
];

type TipoCadastro = 'INDUSTRIA' | 'FORNECEDOR';

export default function ProdutoModal({ isOpen, onClose, produto, onSave }: ProdutoModalProps) {
  const [familias, setFamilias] = useState<FamiliaRow[]>([]);
  const [gruposEmbalagem, setGruposEmbalagem] = useState<Grupo[]>([]);
  const [tipoCadastro, setTipoCadastro] = useState<TipoCadastro>('FORNECEDOR');
  const [formData, setFormData] = useState({
    nome: '',
    medida: '',
    unidadeMedida: 'l',
    familiaId: '',
    embalagemGrupoId: '',
    marca: '',
    fornecedorPreferencial: '',
    codigoBarras: '',
    sif: '',
    origem: 'AMBOS' as 'COMPRA' | 'PRODUCAO' | 'AMBOS',
    estoqueMinimo: 0,
    custoReferencia: '' as string,
    conservacaoTipo: 'resfriado',
    conservacaoStatus: 'ativo',
    validadeDias: 0,
    validadeHoras: 0,
    validadeMinutos: 0,
    exibirHorarioEtiqueta: false,
    contagemDoDia: false,
    producaoConsumoPorMassa: false,
    producaoGramasEmbalagem: '',
    producaoGramasDose: '0',
  });

  useEffect(() => {
    const carregar = async () => {
      const [{ data: fData, error: fErr }, { data: gData, error: gErr }] = await Promise.all([
        supabase.from('familias').select('id, nome, cor').order('nome'),
        supabase.from('grupos').select('*').order('nome'),
      ]);
      if (!fErr && fData) setFamilias(fData);
      if (!gErr && gData) setGruposEmbalagem(gData);
    };
    if (isOpen) void carregar();
  }, [isOpen]);

  useEffect(() => {
    /* Sincroniza estado local ao trocar `produto` / abrir modal (edição vs criação). */
    /* eslint-disable react-hooks/set-state-in-effect */
    if (produto) {
      const escopo = produto.escopo_reposicao;
      // Sem escopo no banco: COMPRA/AMBOS = fluxo fornecedor (entra em reposição de loja); só PRODUCAO = indústria.
      setTipoCadastro(
        escopo === 'industria'
          ? 'INDUSTRIA'
          : escopo === 'loja'
            ? 'FORNECEDOR'
            : produto.origem === 'PRODUCAO'
              ? 'INDUSTRIA'
              : 'FORNECEDOR'
      );
      setFormData({
        nome: produto.nome,
        medida: produto.medida || '',
        unidadeMedida: produto.unidade_medida,
        familiaId: produto.familia_id || '',
        embalagemGrupoId: produto.grupos[0]?.id || '',
        marca: produto.marca || '',
        fornecedorPreferencial: produto.fornecedor || '',
        codigoBarras: produto.codigo_barras || '',
        sif: produto.sif || '',
        origem: produto.origem || 'AMBOS',
        estoqueMinimo: produto.estoque_minimo ?? 0,
        custoReferencia: produto.custo_referencia != null ? String(produto.custo_referencia) : '',
        conservacaoTipo: produto.conservacoes[0]?.tipo || 'resfriado',
        conservacaoStatus: produto.conservacoes[0]?.status || 'ativo',
        validadeDias: produto.validade_dias,
        validadeHoras: produto.validade_horas,
        validadeMinutos: produto.validade_minutos,
        exibirHorarioEtiqueta: produto.exibir_horario_etiqueta,
        contagemDoDia: produto.contagem_do_dia,
        producaoConsumoPorMassa: produto.producao_consumo_por_massa ?? false,
        producaoGramasEmbalagem:
          produto.producao_gramas_por_embalagem != null
            ? String(produto.producao_gramas_por_embalagem)
            : '',
        producaoGramasDose:
          produto.producao_gramas_por_dose != null ? String(produto.producao_gramas_por_dose) : '0',
      });
    } else {
      setTipoCadastro('FORNECEDOR');
      setFormData({
        nome: '',
        medida: '',
        unidadeMedida: 'l',
        familiaId: '',
        embalagemGrupoId: '',
        marca: '',
        fornecedorPreferencial: '',
        codigoBarras: '',
        sif: '',
        origem: 'COMPRA',
        estoqueMinimo: 0,
        custoReferencia: '',
        conservacaoTipo: 'resfriado',
        conservacaoStatus: 'ativo',
        validadeDias: 0,
        validadeHoras: 0,
        validadeMinutos: 0,
        exibirHorarioEtiqueta: false,
        contagemDoDia: false,
        producaoConsumoPorMassa: false,
        producaoGramasEmbalagem: '',
        producaoGramasDose: '0',
      });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [produto, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (tipoCadastro === 'INDUSTRIA' && !formData.familiaId.trim()) {
      alert('Selecione a família do produto (categoria).');
      return;
    }

    const custoRefParsed = formData.custoReferencia.trim();
    const custoParsed = Number.parseFloat(custoRefParsed.replace(',', '.'));
    const custoReferenciaNum =
      custoRefParsed === '' || !Number.isFinite(custoParsed) ? null : Math.max(0, custoParsed);

    const origemFinal: 'COMPRA' | 'PRODUCAO' | 'AMBOS' =
      tipoCadastro === 'FORNECEDOR'
        ? formData.origem === 'AMBOS'
          ? 'AMBOS'
          : 'COMPRA'
        : formData.origem === 'AMBOS'
          ? 'AMBOS'
          : 'PRODUCAO';

    if (tipoCadastro === 'FORNECEDOR' && formData.producaoConsumoPorMassa) {
      const gEmb = Math.floor(Number(String(formData.producaoGramasEmbalagem).replace(',', '.')) || 0);
      if (gEmb <= 0) {
        alert('Informe gramas por embalagem de compra (inteiro ≥ 1) para consumo por massa na produção.');
        return;
      }
    }

    const validadeFornecedor = tipoCadastro === 'FORNECEDOR';
    const validadeDiasFinal = validadeFornecedor ? 0 : formData.validadeDias;
    const validadeHorasFinal = validadeFornecedor ? 0 : formData.validadeHoras;
    const validadeMinutosFinal = validadeFornecedor ? 0 : formData.validadeMinutos;

    const gEmbFinal =
      tipoCadastro === 'FORNECEDOR' && formData.producaoConsumoPorMassa
        ? Math.max(1, Math.floor(Number(String(formData.producaoGramasEmbalagem).replace(',', '.')) || 0))
        : null;
    const gDoseFinal =
      tipoCadastro === 'FORNECEDOR' && formData.producaoConsumoPorMassa
        ? Math.max(0, Math.floor(Number(String(formData.producaoGramasDose).replace(',', '.')) || 0))
        : null;

    const eanDigits = formData.codigoBarras.replace(/\D/g, '');
    const codigoBarrasFinal = eanDigits.length >= 8 ? eanDigits : null;

    const produtoData = {
      nome: formData.nome,
      medida: formData.medida,
      unidadeMedida: formData.unidadeMedida,
      familiaId: formData.familiaId.trim() || null,
      embalagemGrupoIds: formData.embalagemGrupoId ? [formData.embalagemGrupoId] : [],
      marca: formData.marca,
      fornecedor: formData.fornecedorPreferencial.trim() || null,
      sif: formData.sif,
      codigoBarras: codigoBarrasFinal,
      origem: origemFinal,
      estoqueMinimo: Math.max(0, Math.floor(Number(formData.estoqueMinimo) || 0)),
      custoReferencia: custoReferenciaNum,
      conservacoes: [{
        tipo: formData.conservacaoTipo,
        status: formData.conservacaoStatus,
        dias: validadeDiasFinal,
        horas: validadeHorasFinal,
        minutos: validadeMinutosFinal,
      }],
      validadeDias: validadeDiasFinal,
      validadeHoras: validadeHorasFinal,
      validadeMinutos: validadeMinutosFinal,
      exibirHorarioEtiqueta: formData.exibirHorarioEtiqueta,
      contagemDoDia: formData.contagemDoDia,
      escopoReposicao: (tipoCadastro === 'INDUSTRIA' ? 'industria' : 'loja') as ProdutoModalSavePayload['escopoReposicao'],
      producaoConsumoPorMassa: tipoCadastro === 'FORNECEDOR' && formData.producaoConsumoPorMassa,
      producaoGramasPorEmbalagem:
        tipoCadastro === 'FORNECEDOR' && formData.producaoConsumoPorMassa ? gEmbFinal : null,
      producaoGramasPorDose:
        tipoCadastro === 'FORNECEDOR' && formData.producaoConsumoPorMassa ? gDoseFinal : null,
    };

    onSave(produtoData);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={produto ? 'Editar produto' : 'Criar produto'}
      subtitle="Altere os campos abaixo para editar o produto."
      size="lg"
    >
      <form onSubmit={handleSubmit}>
        <div className="p-6 space-y-6">
          {/* Informações básicas */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Informações básicas do produto
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Produto"
                placeholder="Nome do produto"
                value={formData.nome}
                onChange={(e) => setFormData(prev => ({ ...prev, nome: e.target.value }))}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="Medida"
                  placeholder="Ex: 11"
                  value={formData.medida}
                  onChange={(e) => setFormData(prev => ({ ...prev, medida: e.target.value }))}
                />
                <Select
                  label=" "
                  options={unidadesMedida}
                  value={formData.unidadeMedida}
                  onChange={(e) => setFormData(prev => ({ ...prev, unidadeMedida: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Tipo de cadastro */}
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-sm font-semibold text-gray-900 mb-3">Tipo de cadastro</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipoCadastro('INDUSTRIA');
                  setFormData((prev) => ({
                    ...prev,
                    origem: prev.origem === 'AMBOS' ? 'AMBOS' : 'PRODUCAO',
                    producaoConsumoPorMassa: false,
                    producaoGramasEmbalagem: '',
                    producaoGramasDose: '0',
                  }));
                }}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  tipoCadastro === 'INDUSTRIA'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                Produto da indústria
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipoCadastro('FORNECEDOR');
                  setFormData((prev) => ({
                    ...prev,
                    origem: prev.origem === 'AMBOS' ? 'AMBOS' : 'COMPRA',
                  }));
                }}
                className={`rounded-lg border px-3 py-2 text-sm ${
                  tipoCadastro === 'FORNECEDOR'
                    ? 'border-red-300 bg-red-50 text-red-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                Produto de fornecedor
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              <strong>Produto de fornecedor</strong> entra em <strong>reposição de estoque por loja</strong> e na{' '}
              <strong>contagem da loja</strong>. <strong>Produto da indústria</strong> fica com a outra equipe e não
              aparece nessas telas.
            </p>
            {tipoCadastro === 'INDUSTRIA' && (
              <p className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                <strong>Onde está o «modo massa»?</strong> Ele <strong>só aparece</strong> quando você escolhe{' '}
                <strong>Produto de fornecedor</strong> acima — serve para insumos de compra (saco, caixa) que na{' '}
                <strong>Produção</strong> serão baixados em <strong>gramas</strong> (doses ou kg), não só por QR.
              </p>
            )}
          </div>

          {tipoCadastro === 'FORNECEDOR' && (
            <div
              id="cadastro-producao-massa"
              className="rounded-xl border-2 border-amber-200 bg-amber-50/80 p-4 space-y-3 shadow-sm"
            >
              <h3 className="text-sm font-semibold text-gray-900">
                Modo massa na produção <span className="text-amber-800 font-normal">(opcional)</span>
              </h3>
              <p className="text-xs text-gray-700">
                Marque se este insumo entra na receita por <strong>peso</strong> (ex.: polpa, cupuaçu). Na tela{' '}
                <strong>Produção</strong>, o operador informará <strong>doses</strong> ou <strong>kg</strong> em vez de
                só «quantidade de QR».
              </p>
              <label className="flex items-center gap-2 text-sm text-gray-800 font-medium">
                <input
                  type="checkbox"
                  checked={formData.producaoConsumoPorMassa}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, producaoConsumoPorMassa: e.target.checked }))
                  }
                  className="rounded border-gray-300 size-4"
                />
                Usar baixa por gramas na produção (além de QR, quando aplicável)
              </label>
              {formData.producaoConsumoPorMassa && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <Input
                    label="Gramas por embalagem de compra"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={formData.producaoGramasEmbalagem}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, producaoGramasEmbalagem: e.target.value }))
                    }
                  />
                  <Input
                    label="Gramas por dose (0 = operador informa kg na Produção)"
                    type="number"
                    min={0}
                    step={1}
                    value={formData.producaoGramasDose}
                    onChange={(e) =>
                      setFormData((prev) => ({ ...prev, producaoGramasDose: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>
          )}

          {/* Estoque / compra */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-900">
              {tipoCadastro === 'FORNECEDOR' ? 'Compra e estoque mínimo' : 'Estoque mínimo'}
            </h3>
            {tipoCadastro === 'FORNECEDOR' && (
              <p className="text-xs text-gray-500 -mt-2">
                Fornecedor e custo sugerem valores na <strong>Entrada de compra</strong>; cada NF registra o valor real no lote.
              </p>
            )}
            <p className="text-xs text-gray-600 -mt-1">
              Use a mesma <strong>unidade de rastreio</strong> que na separação (ex.: caixa fechada = 1 unidade; não use
              quantidade de peças dentro da caixa salvo que cada peça tenha QR).
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Estoque mínimo (unidades com QR)"
                type="number"
                min={0}
                value={formData.estoqueMinimo}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, estoqueMinimo: parseInt(e.target.value, 10) || 0 }))
                }
              />
              {tipoCadastro === 'FORNECEDOR' ? (
                <Input
                  label="Custo de referência (R$ / unidade)"
                  type="text"
                  inputMode="decimal"
                  placeholder="Ex: 12,90"
                  value={formData.custoReferencia}
                  onChange={(e) => setFormData((prev) => ({ ...prev, custoReferencia: e.target.value }))}
                />
              ) : (
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500 flex items-center">
                  Sem custo de referência para produto de produção.
                </div>
              )}
            </div>
            <Select
              label="Família do produto (categoria)"
              options={[
                { value: '', label: 'Selecione (opcional)...' },
                ...familias.map((f) => ({ value: f.id, label: f.nome })),
              ]}
              value={formData.familiaId}
              onChange={(e) => setFormData((prev) => ({ ...prev, familiaId: e.target.value }))}
            />
            <p className="text-xs text-gray-500 -mt-2">
              Família em <strong>Cadastros → Categorias</strong>. Caixa, balde, pote etc. em <strong>Cadastros → Tipos de embalagem</strong>.
            </p>
            <Select
              label="Tipo de embalagem"
              options={[
                { value: '', label: 'Selecione (opcional)...' },
                ...gruposEmbalagem.map((g) => ({ value: g.id, label: g.nome })),
              ]}
              value={formData.embalagemGrupoId}
              onChange={(e) => setFormData((prev) => ({ ...prev, embalagemGrupoId: e.target.value }))}
            />
            {tipoCadastro === 'FORNECEDOR' ? (
              <>
                <Input
                  label="Código de barras (EAN/GTIN)"
                  placeholder="Somente números, ex.: 789..."
                  value={formData.codigoBarras}
                  onChange={(e) => setFormData((prev) => ({ ...prev, codigoBarras: e.target.value }))}
                />
                <Input
                  label="Fornecedor preferencial"
                  placeholder="Nome usual na compra (opcional)"
                  value={formData.fornecedorPreferencial}
                  onChange={(e) => setFormData((prev) => ({ ...prev, fornecedorPreferencial: e.target.value }))}
                />
                <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-500">
                  A validade do produto de fornecedor é informada somente no momento de <strong>Registrar Compra</strong>, junto com quantidade e lote.
                </div>
              </>
            ) : (
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={formData.origem === 'AMBOS'}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, origem: e.target.checked ? 'AMBOS' : 'PRODUCAO' }))
                  }
                  className="rounded border-gray-300"
                />
                Também permitir compra deste produto (origem: ambos)
              </label>
            )}
          </div>

          {tipoCadastro === 'INDUSTRIA' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Identificação (indústria)
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Marca"
                  placeholder="Marca do produto"
                  value={formData.marca}
                  onChange={(e) => setFormData(prev => ({ ...prev, marca: e.target.value }))}
                />
                <Input
                  label="SIF"
                  placeholder="Número do SIF"
                  value={formData.sif}
                  onChange={(e) => setFormData(prev => ({ ...prev, sif: e.target.value }))}
                />
                <Input
                  label="Código de barras (EAN)"
                  placeholder="Opcional — ex.: 789..."
                  value={formData.codigoBarras}
                  onChange={(e) => setFormData((prev) => ({ ...prev, codigoBarras: e.target.value }))}
                />
              </div>
            </div>
          )}

          {/* Conservação e validade */}
          {tipoCadastro === 'INDUSTRIA' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Conservação e validade do produto
              </h3>
              
              <div className="mb-4">
                <label className="flex items-center gap-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={formData.contagemDoDia}
                    onChange={(e) => setFormData(prev => ({ ...prev, contagemDoDia: e.target.checked }))}
                    className="rounded border-gray-300"
                  />
                  Contagem do dia
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  Apenas para validades em dias, considerar o dia até <strong>23h59</strong>.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Ver etiqueta preview */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-red-500 font-medium">Ver etiqueta</span>
                    <span className="text-gray-400">...</span>
                  </div>
                  <div className="flex items-center justify-center py-4">
                    <Tag className="w-8 h-8 text-red-400" />
                  </div>
                  
                  <Select
                    options={tiposConservacao}
                    value={formData.conservacaoTipo}
                    onChange={(e) => setFormData(prev => ({ ...prev, conservacaoTipo: e.target.value }))}
                    className="mb-2"
                  />
                  <Select
                    options={[
                      { value: 'ativo', label: 'Ativo' },
                      { value: 'inativo', label: 'Inativo' },
                    ]}
                    value={formData.conservacaoStatus}
                    onChange={(e) => setFormData(prev => ({ ...prev, conservacaoStatus: e.target.value }))}
                    className="mb-3"
                  />
                  
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      label="Dias"
                      type="number"
                      min={0}
                      value={formData.validadeDias}
                      onChange={(e) => setFormData(prev => ({ ...prev, validadeDias: parseInt(e.target.value) || 0 }))}
                    />
                    <Input
                      label="Horas"
                      type="number"
                      min={0}
                      max={23}
                      value={formData.validadeHoras}
                      onChange={(e) => setFormData(prev => ({ ...prev, validadeHoras: parseInt(e.target.value) || 0 }))}
                    />
                    <Input
                      label="Minutos"
                      type="number"
                      min={0}
                      max={59}
                      value={formData.validadeMinutos}
                      onChange={(e) => setFormData(prev => ({ ...prev, validadeMinutos: parseInt(e.target.value) || 0 }))}
                    />
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <a href="#" className="text-sm text-red-500 hover:underline">Detalhes</a>
                    <label className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                      <input
                        type="checkbox"
                        checked={formData.exibirHorarioEtiqueta}
                        onChange={(e) => setFormData(prev => ({ ...prev, exibirHorarioEtiqueta: e.target.checked }))}
                        className="rounded border-gray-300"
                      />
                      Exibir horário na etiqueta
                    </label>
                  </div>
                </div>

                {/* Adicionar método de conservação */}
                <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 flex items-center justify-center">
                  <button
                    type="button"
                    className="text-gray-400 hover:text-gray-600 text-sm"
                  >
                    Adicionar método de conservação
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 space-y-2">
          <Button type="submit" variant="primary" className="w-full">
            Salvar
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
