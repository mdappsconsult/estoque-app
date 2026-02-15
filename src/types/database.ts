// Tipos do banco de dados Supabase - Controle de Estoque QR
// Schema: public

export type Database = {
  public: {
    Tables: {
      produtos: {
        Row: {
          id: string;
          nome: string;
          medida: string | null;
          unidade_medida: string;
          marca: string | null;
          fornecedor: string | null;
          sif: string | null;
          validade_dias: number;
          validade_horas: number;
          validade_minutos: number;
          exibir_horario_etiqueta: boolean;
          contagem_do_dia: boolean;
          status: 'ativo' | 'inativo';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          medida?: string | null;
          unidade_medida?: string;
          marca?: string | null;
          fornecedor?: string | null;
          sif?: string | null;
          validade_dias?: number;
          validade_horas?: number;
          validade_minutos?: number;
          exibir_horario_etiqueta?: boolean;
          contagem_do_dia?: boolean;
          status?: 'ativo' | 'inativo';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          medida?: string | null;
          unidade_medida?: string;
          marca?: string | null;
          fornecedor?: string | null;
          sif?: string | null;
          validade_dias?: number;
          validade_horas?: number;
          validade_minutos?: number;
          exibir_horario_etiqueta?: boolean;
          contagem_do_dia?: boolean;
          status?: 'ativo' | 'inativo';
          updated_at?: string;
        };
      };
      grupos: {
        Row: {
          id: string;
          nome: string;
          cor: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          cor?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          cor?: string;
        };
      };
      produto_grupos: {
        Row: {
          id: string;
          produto_id: string;
          grupo_id: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          grupo_id: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          grupo_id?: string;
        };
      };
      conservacoes: {
        Row: {
          id: string;
          produto_id: string;
          tipo: 'resfriado' | 'congelado' | 'ambiente' | 'quente';
          status: string | null;
          dias: number;
          horas: number;
          minutos: number;
        };
        Insert: {
          id?: string;
          produto_id: string;
          tipo: 'resfriado' | 'congelado' | 'ambiente' | 'quente';
          status?: string | null;
          dias?: number;
          horas?: number;
          minutos?: number;
        };
        Update: {
          id?: string;
          produto_id?: string;
          tipo?: 'resfriado' | 'congelado' | 'ambiente' | 'quente';
          status?: string | null;
          dias?: number;
          horas?: number;
          minutos?: number;
        };
      };
      recebimentos: {
        Row: {
          id: string;
          produto_id: string;
          quantidade: number;
          temperatura: number | null;
          data_recebimento: string;
          fornecedor: string | null;
          nota_fiscal: string | null;
          observacoes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          quantidade: number;
          temperatura?: number | null;
          data_recebimento?: string;
          fornecedor?: string | null;
          nota_fiscal?: string | null;
          observacoes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          quantidade?: number;
          temperatura?: number | null;
          data_recebimento?: string;
          fornecedor?: string | null;
          nota_fiscal?: string | null;
          observacoes?: string | null;
        };
      };
      producoes: {
        Row: {
          id: string;
          produto_id: string;
          quantidade: number;
          data_producao: string;
          responsavel: string;
          observacoes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          quantidade: number;
          data_producao?: string;
          responsavel: string;
          observacoes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          quantidade?: number;
          data_producao?: string;
          responsavel?: string;
          observacoes?: string | null;
        };
      };
      contagens: {
        Row: {
          id: string;
          data: string;
          status: 'em_andamento' | 'finalizada';
          responsavel: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          data?: string;
          status?: 'em_andamento' | 'finalizada';
          responsavel: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          data?: string;
          status?: 'em_andamento' | 'finalizada';
          responsavel?: string;
        };
      };
      contagem_itens: {
        Row: {
          id: string;
          contagem_id: string;
          produto_id: string;
          quantidade_sistema: number;
          quantidade_contada: number;
        };
        Insert: {
          id?: string;
          contagem_id: string;
          produto_id: string;
          quantidade_sistema: number;
          quantidade_contada: number;
        };
        Update: {
          id?: string;
          contagem_id?: string;
          produto_id?: string;
          quantidade_sistema?: number;
          quantidade_contada?: number;
        };
      };
      etiquetas: {
        Row: {
          id: string;
          produto_id: string;
          data_producao: string;
          data_validade: string;
          lote: string | null;
          impressa: boolean;
          excluida: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          data_producao?: string;
          data_validade: string;
          lote?: string | null;
          impressa?: boolean;
          excluida?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          data_producao?: string;
          data_validade?: string;
          lote?: string | null;
          impressa?: boolean;
          excluida?: boolean;
        };
      };
      estoque: {
        Row: {
          id: string;
          produto_id: string;
          quantidade: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          quantidade?: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          quantidade?: number;
          updated_at?: string;
        };
      };
      movimentacoes: {
        Row: {
          id: string;
          produto_id: string;
          tipo: 'entrada' | 'saida';
          quantidade: number;
          motivo: string | null;
          referencia_id: string | null;
          referencia_tipo: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          tipo: 'entrada' | 'saida';
          quantidade: number;
          motivo?: string | null;
          referencia_id?: string | null;
          referencia_tipo?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          tipo?: 'entrada' | 'saida';
          quantidade?: number;
          motivo?: string | null;
          referencia_id?: string | null;
          referencia_tipo?: string | null;
        };
      };
      locais: {
        Row: {
          id: string;
          nome: string;
          tipo: 'WAREHOUSE' | 'STORE';
          endereco: string | null;
          status: 'ativo' | 'inativo';
          created_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          tipo: 'WAREHOUSE' | 'STORE';
          endereco?: string | null;
          status?: 'ativo' | 'inativo';
          created_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          tipo?: 'WAREHOUSE' | 'STORE';
          endereco?: string | null;
          status?: 'ativo' | 'inativo';
        };
      };
      usuarios: {
        Row: {
          id: string;
          nome: string;
          telefone: string;
          perfil: 'ADMIN_MASTER' | 'MANAGER' | 'OPERATOR_WAREHOUSE' | 'OPERATOR_STORE' | 'DRIVER';
          local_padrao_id: string | null;
          status: 'ativo' | 'inativo';
          created_at: string;
        };
        Insert: {
          id?: string;
          nome: string;
          telefone: string;
          perfil: 'ADMIN_MASTER' | 'MANAGER' | 'OPERATOR_WAREHOUSE' | 'OPERATOR_STORE' | 'DRIVER';
          local_padrao_id?: string | null;
          status?: 'ativo' | 'inativo';
          created_at?: string;
        };
        Update: {
          id?: string;
          nome?: string;
          telefone?: string;
          perfil?: 'ADMIN_MASTER' | 'MANAGER' | 'OPERATOR_WAREHOUSE' | 'OPERATOR_STORE' | 'DRIVER';
          local_padrao_id?: string | null;
          status?: 'ativo' | 'inativo';
        };
      };
      lotes_compra: {
        Row: {
          id: string;
          produto_id: string;
          quantidade: number;
          custo_unitario: number;
          fornecedor: string | null;
          lote_fornecedor: string | null;
          local_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          produto_id: string;
          quantidade: number;
          custo_unitario: number;
          fornecedor?: string | null;
          lote_fornecedor?: string | null;
          local_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          produto_id?: string;
          quantidade?: number;
          custo_unitario?: number;
          fornecedor?: string | null;
          lote_fornecedor?: string | null;
          local_id?: string;
        };
      };
      itens: {
        Row: {
          id: string;
          token_qr: string;
          token_short: string | null;
          produto_id: string;
          lote_compra_id: string | null;
          local_atual_id: string | null;
          estado: 'EM_ESTOQUE' | 'EM_TRANSFERENCIA' | 'BAIXADO' | 'DESCARTADO';
          data_validade: string | null;
          data_producao: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          token_qr: string;
          token_short?: string | null;
          produto_id: string;
          lote_compra_id?: string | null;
          local_atual_id?: string | null;
          estado?: 'EM_ESTOQUE' | 'EM_TRANSFERENCIA' | 'BAIXADO' | 'DESCARTADO';
          data_validade?: string | null;
          data_producao?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          token_qr?: string;
          token_short?: string | null;
          produto_id?: string;
          lote_compra_id?: string | null;
          local_atual_id?: string | null;
          estado?: 'EM_ESTOQUE' | 'EM_TRANSFERENCIA' | 'BAIXADO' | 'DESCARTADO';
          data_validade?: string | null;
          data_producao?: string | null;
        };
      };
      viagens: {
        Row: {
          id: string;
          motorista_id: string | null;
          status: 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'COMPLETED';
          created_at: string;
        };
        Insert: {
          id?: string;
          motorista_id?: string | null;
          status?: 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'COMPLETED';
          created_at?: string;
        };
        Update: {
          id?: string;
          motorista_id?: string | null;
          status?: 'PENDING' | 'ACCEPTED' | 'IN_TRANSIT' | 'COMPLETED';
        };
      };
      transferencias: {
        Row: {
          id: string;
          tipo: 'WAREHOUSE_STORE' | 'STORE_STORE';
          origem_id: string;
          destino_id: string;
          viagem_id: string | null;
          status: 'AWAITING_ACCEPT' | 'ACCEPTED' | 'IN_TRANSIT' | 'DELIVERED' | 'DIVERGENCE';
          criado_por: string;
          aceito_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tipo: 'WAREHOUSE_STORE' | 'STORE_STORE';
          origem_id: string;
          destino_id: string;
          viagem_id?: string | null;
          status?: 'AWAITING_ACCEPT' | 'ACCEPTED' | 'IN_TRANSIT' | 'DELIVERED' | 'DIVERGENCE';
          criado_por: string;
          aceito_por?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tipo?: 'WAREHOUSE_STORE' | 'STORE_STORE';
          origem_id?: string;
          destino_id?: string;
          viagem_id?: string | null;
          status?: 'AWAITING_ACCEPT' | 'ACCEPTED' | 'IN_TRANSIT' | 'DELIVERED' | 'DIVERGENCE';
          criado_por?: string;
          aceito_por?: string | null;
        };
      };
      transferencia_itens: {
        Row: {
          id: string;
          transferencia_id: string;
          item_id: string;
          recebido: boolean;
        };
        Insert: {
          id?: string;
          transferencia_id: string;
          item_id: string;
          recebido?: boolean;
        };
        Update: {
          id?: string;
          transferencia_id?: string;
          item_id?: string;
          recebido?: boolean;
        };
      };
      divergencias: {
        Row: {
          id: string;
          transferencia_id: string;
          item_id: string;
          tipo: 'FALTANTE' | 'EXCEDENTE';
          resolvido: boolean;
          resolvido_por: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transferencia_id: string;
          item_id: string;
          tipo: 'FALTANTE' | 'EXCEDENTE';
          resolvido?: boolean;
          resolvido_por?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transferencia_id?: string;
          item_id?: string;
          tipo?: 'FALTANTE' | 'EXCEDENTE';
          resolvido?: boolean;
          resolvido_por?: string | null;
        };
      };
      baixas: {
        Row: {
          id: string;
          item_id: string;
          local_id: string;
          usuario_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          local_id: string;
          usuario_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          local_id?: string;
          usuario_id?: string;
        };
      };
      perdas: {
        Row: {
          id: string;
          item_id: string;
          motivo: string;
          local_id: string;
          usuario_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          item_id: string;
          motivo: string;
          local_id: string;
          usuario_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          item_id?: string;
          motivo?: string;
          local_id?: string;
          usuario_id?: string;
        };
      };
      auditoria: {
        Row: {
          id: string;
          usuario_id: string | null;
          local_id: string | null;
          acao: string;
          item_id: string | null;
          origem_id: string | null;
          destino_id: string | null;
          detalhes: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          usuario_id?: string | null;
          local_id?: string | null;
          acao: string;
          item_id?: string | null;
          origem_id?: string | null;
          destino_id?: string | null;
          detalhes?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          usuario_id?: string | null;
          local_id?: string | null;
          acao?: string;
          item_id?: string | null;
          origem_id?: string | null;
          destino_id?: string | null;
          detalhes?: Record<string, unknown> | null;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};

// Tipos auxiliares - TABELAS EXISTENTES
export type Produto = Database['public']['Tables']['produtos']['Row'];
export type ProdutoInsert = Database['public']['Tables']['produtos']['Insert'];
export type ProdutoUpdate = Database['public']['Tables']['produtos']['Update'];

export type Grupo = Database['public']['Tables']['grupos']['Row'];
export type GrupoInsert = Database['public']['Tables']['grupos']['Insert'];

export type Conservacao = Database['public']['Tables']['conservacoes']['Row'];
export type ConservacaoInsert = Database['public']['Tables']['conservacoes']['Insert'];

export type Recebimento = Database['public']['Tables']['recebimentos']['Row'];
export type RecebimentoInsert = Database['public']['Tables']['recebimentos']['Insert'];

export type Producao = Database['public']['Tables']['producoes']['Row'];
export type ProducaoInsert = Database['public']['Tables']['producoes']['Insert'];

export type Contagem = Database['public']['Tables']['contagens']['Row'];
export type ContagemItem = Database['public']['Tables']['contagem_itens']['Row'];

export type Etiqueta = Database['public']['Tables']['etiquetas']['Row'];
export type EtiquetaInsert = Database['public']['Tables']['etiquetas']['Insert'];

export type Estoque = Database['public']['Tables']['estoque']['Row'];
export type Movimentacao = Database['public']['Tables']['movimentacoes']['Row'];

// Tipos auxiliares - NOVAS TABELAS
export type Local = Database['public']['Tables']['locais']['Row'];
export type LocalInsert = Database['public']['Tables']['locais']['Insert'];
export type LocalUpdate = Database['public']['Tables']['locais']['Update'];

export type Usuario = Database['public']['Tables']['usuarios']['Row'];
export type UsuarioInsert = Database['public']['Tables']['usuarios']['Insert'];
export type UsuarioUpdate = Database['public']['Tables']['usuarios']['Update'];

export type LoteCompra = Database['public']['Tables']['lotes_compra']['Row'];
export type LoteCompraInsert = Database['public']['Tables']['lotes_compra']['Insert'];

export type Item = Database['public']['Tables']['itens']['Row'];
export type ItemInsert = Database['public']['Tables']['itens']['Insert'];
export type ItemUpdate = Database['public']['Tables']['itens']['Update'];

export type Viagem = Database['public']['Tables']['viagens']['Row'];
export type ViagemInsert = Database['public']['Tables']['viagens']['Insert'];
export type ViagemUpdate = Database['public']['Tables']['viagens']['Update'];

export type Transferencia = Database['public']['Tables']['transferencias']['Row'];
export type TransferenciaInsert = Database['public']['Tables']['transferencias']['Insert'];
export type TransferenciaUpdate = Database['public']['Tables']['transferencias']['Update'];

export type TransferenciaItem = Database['public']['Tables']['transferencia_itens']['Row'];
export type TransferenciaItemInsert = Database['public']['Tables']['transferencia_itens']['Insert'];

export type Divergencia = Database['public']['Tables']['divergencias']['Row'];
export type DivergenciaInsert = Database['public']['Tables']['divergencias']['Insert'];
export type DivergenciaUpdate = Database['public']['Tables']['divergencias']['Update'];

export type Baixa = Database['public']['Tables']['baixas']['Row'];
export type BaixaInsert = Database['public']['Tables']['baixas']['Insert'];

export type Perda = Database['public']['Tables']['perdas']['Row'];
export type PerdaInsert = Database['public']['Tables']['perdas']['Insert'];

export type Auditoria = Database['public']['Tables']['auditoria']['Row'];
export type AuditoriaInsert = Database['public']['Tables']['auditoria']['Insert'];

// Tipos de perfil e estado
export type PerfilUsuario = Usuario['perfil'];
export type TipoLocal = Local['tipo'];
export type EstadoItem = Item['estado'];
export type StatusTransferencia = Transferencia['status'];
export type TipoTransferencia = Transferencia['tipo'];
export type StatusViagem = Viagem['status'];
export type TipoDivergencia = Divergencia['tipo'];
