'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import { Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Grupo {
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
  sif: string | null;
  validade_dias: number;
  validade_horas: number;
  validade_minutos: number;
  exibir_horario_etiqueta: boolean;
  contagem_do_dia: boolean;
  grupos: { id: string; nome: string; cor: string }[];
  conservacoes: { id: string; tipo: string; status: string | null; dias: number; horas: number; minutos: number }[];
}

interface ProdutoModalProps {
  isOpen: boolean;
  onClose: () => void;
  produto?: ProdutoEditando | null;
  onSave: (produto: any) => void;
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

export default function ProdutoModal({ isOpen, onClose, produto, onSave }: ProdutoModalProps) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [formData, setFormData] = useState({
    nome: '',
    medida: '',
    unidadeMedida: 'l',
    grupoIds: [] as string[],
    marca: '',
    sif: '',
    conservacaoTipo: 'resfriado',
    conservacaoStatus: 'ativo',
    validadeDias: 0,
    validadeHoras: 0,
    validadeMinutos: 0,
    exibirHorarioEtiqueta: false,
    contagemDoDia: false,
  });

  // Carregar grupos do Supabase
  useEffect(() => {
    const carregarGrupos = async () => {
      const { data, error } = await supabase
        .from('grupos')
        .select('*')
        .order('nome');
      
      if (!error && data) {
        setGrupos(data);
      }
    };
    
    if (isOpen) {
      carregarGrupos();
    }
  }, [isOpen]);

  useEffect(() => {
    if (produto) {
      setFormData({
        nome: produto.nome,
        medida: produto.medida || '',
        unidadeMedida: produto.unidade_medida,
        grupoIds: produto.grupos.map(g => g.id),
        marca: produto.marca || '',
        sif: produto.sif || '',
        conservacaoTipo: produto.conservacoes[0]?.tipo || 'resfriado',
        conservacaoStatus: produto.conservacoes[0]?.status || 'ativo',
        validadeDias: produto.validade_dias,
        validadeHoras: produto.validade_horas,
        validadeMinutos: produto.validade_minutos,
        exibirHorarioEtiqueta: produto.exibir_horario_etiqueta,
        contagemDoDia: produto.contagem_do_dia,
      });
    } else {
      setFormData({
        nome: '',
        medida: '',
        unidadeMedida: 'l',
        grupoIds: [],
        marca: '',
        sif: '',
        conservacaoTipo: 'resfriado',
        conservacaoStatus: 'ativo',
        validadeDias: 0,
        validadeHoras: 0,
        validadeMinutos: 0,
        exibirHorarioEtiqueta: false,
        contagemDoDia: false,
      });
    }
  }, [produto, isOpen]);

  const handleAddGrupo = (grupoId: string) => {
    if (grupoId && !formData.grupoIds.includes(grupoId)) {
      setFormData(prev => ({
        ...prev,
        grupoIds: [...prev.grupoIds, grupoId]
      }));
    }
  };

  const handleRemoveGrupo = (grupoId: string) => {
    setFormData(prev => ({
      ...prev,
      grupoIds: prev.grupoIds.filter(id => id !== grupoId)
    }));
  };

  const getGrupoNome = (grupoId: string) => {
    return grupos.find(g => g.id === grupoId)?.nome || '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const produtoData = {
      nome: formData.nome,
      medida: formData.medida,
      unidadeMedida: formData.unidadeMedida,
      grupoIds: formData.grupoIds,
      marca: formData.marca,
      sif: formData.sif,
      conservacoes: [{
        tipo: formData.conservacaoTipo,
        status: formData.conservacaoStatus,
        dias: formData.validadeDias,
        horas: formData.validadeHoras,
        minutos: formData.validadeMinutos,
      }],
      validadeDias: formData.validadeDias,
      validadeHoras: formData.validadeHoras,
      validadeMinutos: formData.validadeMinutos,
      exibirHorarioEtiqueta: formData.exibirHorarioEtiqueta,
      contagemDoDia: formData.contagemDoDia,
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

          {/* Organização de grupos */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              Organização de grupos e Origem do produto
            </h3>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grupos <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.grupoIds.map((grupoId) => (
                  <Badge 
                    key={grupoId} 
                    variant="error" 
                    removable 
                    onRemove={() => handleRemoveGrupo(grupoId)}
                  >
                    {getGrupoNome(grupoId)}
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Select
                  options={[
                    { value: '', label: 'Selecione um grupo' },
                    ...grupos
                      .filter(g => !formData.grupoIds.includes(g.id))
                      .map(g => ({ value: g.id, label: g.nome }))
                  ]}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddGrupo(e.target.value);
                    }
                  }}
                  className="flex-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Marca ou fornecedor"
                placeholder="Nome da marca ou fornecedor"
                value={formData.marca}
                onChange={(e) => setFormData(prev => ({ ...prev, marca: e.target.value }))}
              />
              <Input
                label="SIF"
                placeholder="Número do SIF"
                value={formData.sif}
                onChange={(e) => setFormData(prev => ({ ...prev, sif: e.target.value }))}
              />
            </div>
          </div>

          {/* Conservação e validade */}
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
