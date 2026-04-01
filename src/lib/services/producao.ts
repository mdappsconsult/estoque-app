import { supabase } from '@/lib/supabase';
import { registrarAuditoria } from './auditoria';
import { gerarTokenQR, gerarTokenShort } from './itens';
import { gerarLote } from './etiquetas';
import { EtiquetaInsert, Item } from '@/types/database';
import { recalcularEstoqueProduto } from './estoque-sync';

interface RegistrarProducaoInput {
  produtoId: string;
  quantidade: number;
  localId: string;
  dataValidade?: string | null;
  diasValidade?: number | null;
  observacoes?: string | null;
  usuarioId: string;
  responsavelNome: string;
}

export interface EtiquetaGeradaProducao {
  id: string;
  produtoId: string;
  dataProducao: string;
  dataValidade: string;
  lote: string;
  tokenQr: string;
  tokenShort: string | null;
}

function calcularDataValidadePorDias(diasValidade: number): string {
  if (!Number.isInteger(diasValidade) || diasValidade <= 0) {
    throw new Error('Dias de validade deve ser um número inteiro maior que zero');
  }

  const data = new Date();
  data.setDate(data.getDate() + diasValidade);
  return data.toISOString().slice(0, 10);
}

export async function registrarProducaoComItens(input: RegistrarProducaoInput): Promise<EtiquetaGeradaProducao[]> {
  if (input.quantidade <= 0) {
    throw new Error('Quantidade de produção deve ser maior que zero');
  }
  const dataValidadeCalculada = input.dataValidade || (
    typeof input.diasValidade === 'number'
      ? calcularDataValidadePorDias(input.diasValidade)
      : null
  );
  if (!dataValidadeCalculada) {
    throw new Error('Informe a data de validade ou os dias de validade');
  }

  // 1) Gerar itens unitários da produção.
  const itens = Array.from({ length: input.quantidade }, () => ({
    token_qr: gerarTokenQR(),
    token_short: gerarTokenShort(),
    produto_id: input.produtoId,
    local_atual_id: input.localId,
    estado: 'EM_ESTOQUE' as const,
    data_validade: dataValidadeCalculada,
    data_producao: new Date().toISOString(),
  }));

  const { data: itensCriados, error: itensError } = await supabase.from('itens').insert(itens).select();
  if (itensError) throw itensError;
  const itensGerados = (itensCriados || []) as Item[];

  const loteProducao = gerarLote();

  // 2) Gerar etiquetas tokenizáveis para cada item produzido.
  const etiquetas: EtiquetaInsert[] = itensGerados.map((item) => ({
    id: item.id,
    produto_id: item.produto_id,
    data_producao: item.data_producao || new Date().toISOString(),
    data_validade: item.data_validade || dataValidadeCalculada,
    lote: loteProducao,
    impressa: false,
    excluida: false,
  }));

  if (etiquetas.length > 0) {
    const { error: etiquetasError } = await supabase.from('etiquetas').insert(etiquetas);
    if (etiquetasError) throw etiquetasError;
  }

  // 2.1) Mantém o agregado de estoque alinhado com os itens unitários gerados.
  await recalcularEstoqueProduto(input.produtoId);

  // 3) Registrar evento de produção.
  const { error: producaoError } = await supabase.from('producoes').insert({
    produto_id: input.produtoId,
    quantidade: input.quantidade,
    responsavel: input.responsavelNome,
    observacoes: input.observacoes || null,
  });
  if (producaoError) throw producaoError;

  // 4) Auditoria obrigatória.
  await registrarAuditoria({
    usuario_id: input.usuarioId,
    local_id: input.localId,
    acao: 'PRODUCAO',
    detalhes: {
      produto_id: input.produtoId,
      quantidade: input.quantidade,
      dias_validade: input.diasValidade ?? null,
      data_validade: dataValidadeCalculada,
    },
  });

  return itensGerados.map((item) => ({
    id: item.id,
    produtoId: item.produto_id,
    dataProducao: item.data_producao || new Date().toISOString(),
    dataValidade: item.data_validade || dataValidadeCalculada,
    lote: loteProducao,
    tokenQr: item.token_qr,
    tokenShort: item.token_short || null,
  }));
}
