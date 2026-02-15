// Tipos principais do sistema de estoque

export interface Produto {
  id: string;
  nome: string;
  medida: string;
  unidadeMedida: string;
  grupos: string[];
  marca?: string;
  fornecedor?: string;
  sif?: string;
  conservacao: MetodoConservacao[];
  validadeDias: number;
  validadeHoras: number;
  validadeMinutos: number;
  exibirHorarioEtiqueta: boolean;
  contagemDoDia: boolean;
  status: 'ativo' | 'inativo';
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface MetodoConservacao {
  id: string;
  tipo: 'resfriado' | 'congelado' | 'ambiente' | 'quente';
  status: string;
  dias: number;
  horas: number;
  minutos: number;
}

export interface Grupo {
  id: string;
  nome: string;
  cor: string;
}

export interface Unidade {
  id: string;
  nome: string;
  tipo: 'central' | 'filial';
}

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: 'gestor' | 'operador' | 'admin';
  avatar?: string;
}

export interface Etiqueta {
  id: string;
  produtoId: string;
  produto: Produto;
  dataProducao: Date;
  dataValidade: Date;
  lote?: string;
  impressa: boolean;
  excluida: boolean;
}

export interface Recebimento {
  id: string;
  produtoId: string;
  produto: Produto;
  quantidade: number;
  temperatura?: number;
  dataRecebimento: Date;
  fornecedor?: string;
  notaFiscal?: string;
  observacoes?: string;
}

export interface Producao {
  id: string;
  produtoId: string;
  produto: Produto;
  quantidade: number;
  dataProducao: Date;
  responsavel: string;
  observacoes?: string;
}

export interface Contagem {
  id: string;
  data: Date;
  itens: ContagemItem[];
  status: 'em_andamento' | 'finalizada';
  responsavel: string;
}

export interface ContagemItem {
  produtoId: string;
  produto: Produto;
  quantidadeSistema: number;
  quantidadeContada: number;
  diferenca: number;
}

// Props de componentes
export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ProdutoModalProps extends ModalProps {
  produto?: Produto;
  onSave: (produto: Partial<Produto>) => void;
}
