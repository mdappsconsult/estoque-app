'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boxes, Loader2, Search, MapPin, Building2, Factory } from 'lucide-react';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { Local } from '@/types/database';
import { filtrarItensPorLojaOperadora, idLocalLojaOperadora } from '@/lib/operador-loja-scope';

interface ItemRow {
  id: string;
  token_qr: string;
  estado: string;
  local_atual_id: string | null;
  data_validade: string | null;
  created_at: string;
  produto: { id: string; nome: string };
  local_atual: { id: string; nome: string; tipo: string } | null;
}

export default function EstoquePage() {
  const { usuario } = useAuth();
  const visaoDonoDisponivel =
    usuario?.perfil === 'ADMIN_MASTER' || usuario?.perfil === 'MANAGER';
  const lojaOperadoraId = idLocalLojaOperadora(usuario);
  const { data: locais } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const { data: itens, loading } = useRealtimeQuery<ItemRow>({
    table: 'itens',
    select: '*, produto:produtos(id, nome), local_atual:locais!local_atual_id(id, nome, tipo)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [filtroLocal, setFiltroLocal] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('EM_ESTOQUE');
  const [modoVisualizacao, setModoVisualizacao] = useState<'operacional' | 'dono'>('operacional');

  const itensEscopo = filtrarItensPorLojaOperadora(itens, usuario);

  useEffect(() => {
    if (!visaoDonoDisponivel && modoVisualizacao === 'dono') {
      setModoVisualizacao('operacional');
    }
  }, [visaoDonoDisponivel, modoVisualizacao]);

  const filtrados = itensEscopo.filter((i) => {
    if (filtroEstado && i.estado !== filtroEstado) return false;
    if (!lojaOperadoraId && filtroLocal && i.local_atual_id !== filtroLocal) return false;
    if (
      searchTerm &&
      !i.produto?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !i.token_qr.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  const agrupado = useMemo(() => {
    const porProdutoLocal: Record<
      string,
      { nome: string; local: string; count: number; proximaValidade: string | null }
    > = {};
    filtrados.forEach((i) => {
      const key = `${i.produto?.id}-${i.local_atual_id}`;
      if (!porProdutoLocal[key]) {
        porProdutoLocal[key] = {
          nome: i.produto?.nome || '?',
          local: i.local_atual?.nome || 'Sem local',
          count: 0,
          proximaValidade: null,
        };
      }
      porProdutoLocal[key].count++;
      if (
        i.data_validade &&
        (!porProdutoLocal[key].proximaValidade ||
          i.data_validade < porProdutoLocal[key].proximaValidade)
      ) {
        porProdutoLocal[key].proximaValidade = i.data_validade;
      }
    });
    return porProdutoLocal;
  }, [filtrados]);

  const resumoPorLocal = useMemo(() => {
    const porLocal = new Map<
      string,
      {
        localId: string | null;
        localNome: string;
        localTipo: string;
        totalItens: number;
        proximaValidade: string | null;
        produtos: Map<string, { produtoNome: string; count: number; proximaValidade: string | null }>;
      }
    >();

    filtrados.forEach((item) => {
      const localKey = item.local_atual_id || 'SEM_LOCAL';
      const existente = porLocal.get(localKey) || {
        localId: item.local_atual_id,
        localNome: item.local_atual?.nome || 'Sem local',
        localTipo: item.local_atual?.tipo || 'N/A',
        totalItens: 0,
        proximaValidade: null,
        produtos: new Map<string, { produtoNome: string; count: number; proximaValidade: string | null }>(),
      };

      existente.totalItens++;
      if (
        item.data_validade &&
        (!existente.proximaValidade || item.data_validade < existente.proximaValidade)
      ) {
        existente.proximaValidade = item.data_validade;
      }

      const produtoKey = item.produto?.id || 'SEM_PRODUTO';
      const produtoExistente = existente.produtos.get(produtoKey) || {
        produtoNome: item.produto?.nome || 'Produto não identificado',
        count: 0,
        proximaValidade: null,
      };
      produtoExistente.count++;
      if (
        item.data_validade &&
        (!produtoExistente.proximaValidade || item.data_validade < produtoExistente.proximaValidade)
      ) {
        produtoExistente.proximaValidade = item.data_validade;
      }
      existente.produtos.set(produtoKey, produtoExistente);
      porLocal.set(localKey, existente);
    });

    return Array.from(porLocal.values())
      .map((local) => ({
        ...local,
        produtos: Array.from(local.produtos.values()).sort((a, b) => b.count - a.count),
      }))
      .sort((a, b) => {
        if (b.totalItens !== a.totalItens) return b.totalItens - a.totalItens;
        return a.localNome.localeCompare(b.localNome, 'pt-BR');
      });
  }, [filtrados]);

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Estoque</h1>
        <Badge variant="info">{filtrados.length} itens</Badge>
      </div>

      {visaoDonoDisponivel && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={modoVisualizacao === 'operacional' ? 'primary' : 'outline'}
            onClick={() => setModoVisualizacao('operacional')}
          >
            Visão operacional
          </Button>
          <Button
            size="sm"
            variant={modoVisualizacao === 'dono' ? 'primary' : 'outline'}
            onClick={() => setModoVisualizacao('dono')}
          >
            Visão do dono
          </Button>
        </div>
      )}

      {usuario?.perfil === 'OPERATOR_STORE' && !usuario.local_padrao_id && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Defina a <strong>loja de atuação</strong> deste usuário em Cadastro → Usuários e faça login de novo. Sem isso,
          o estoque não é exibido (evita misturar unidades de outras lojas).
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        {lojaOperadoraId && (
          <p className="text-xs text-gray-600 mb-3">
            Mostrando apenas itens na sua loja:{' '}
            <span className="font-medium">
              {locais.find((l) => l.id === lojaOperadoraId)?.nome || 'Loja vinculada ao seu usuário'}
            </span>
            . Mercadoria a caminho da indústria aparece em <strong>Receber entrega</strong> após o envio.
          </p>
        )}
        {!lojaOperadoraId && modoVisualizacao === 'dono' && (
          <p className="text-xs text-gray-600 mb-3">
            Consolidado por unidade (lojas + indústria), com total de itens e distribuição por produto em cada local.
          </p>
        )}
        <div className="flex gap-3 flex-wrap">
          <div className="w-full sm:flex-1 min-w-0 relative">
            <Input placeholder="Buscar produto ou QR" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          </div>
          {!lojaOperadoraId && (
            <Select
              options={[{ value: '', label: 'Todos os locais' }, ...locais.map((l) => ({ value: l.id, label: l.nome }))]}
              value={filtroLocal}
              onChange={(e) => setFiltroLocal(e.target.value)}
            />
          )}
          <Select
            options={[
              { value: '', label: 'Todos os estados' },
              { value: 'EM_ESTOQUE', label: 'Em Estoque' },
              { value: 'EM_TRANSFERENCIA', label: 'Em Transferência' },
              { value: 'BAIXADO', label: 'Baixado' },
              { value: 'DESCARTADO', label: 'Descartado' },
            ]}
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
          />
        </div>
      </div>

      {modoVisualizacao === 'dono' && !lojaOperadoraId ? (
        <div className="space-y-3">
          {resumoPorLocal.map((local) => (
            <div key={local.localId || local.localNome} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {local.localTipo === 'WAREHOUSE' ? (
                      <Factory className="w-4 h-4 text-gray-500" />
                    ) : (
                      <Building2 className="w-4 h-4 text-gray-500" />
                    )}
                    {local.localNome}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge size="sm" variant="info">{local.localTipo === 'WAREHOUSE' ? 'Indústria' : local.localTipo === 'STORE' ? 'Loja' : local.localTipo}</Badge>
                    <Badge size="sm" variant="success">{local.totalItens} itens</Badge>
                    <Badge size="sm" variant="default">{local.produtos.length} produtos</Badge>
                    {local.proximaValidade && (
                      <Badge size="sm" variant="warning">
                        Próx. validade: {new Date(local.proximaValidade).toLocaleDateString('pt-BR')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-3 border-t border-gray-100 pt-3 space-y-1">
                {local.produtos.map((produto) => (
                  <div key={`${local.localNome}-${produto.produtoNome}`} className="flex items-center justify-between text-sm py-1">
                    <span className="text-gray-700">{produto.produtoNome}</span>
                    <div className="flex items-center gap-3 text-xs text-gray-500">
                      {produto.proximaValidade && (
                        <span>Val: {new Date(produto.proximaValidade).toLocaleDateString('pt-BR')}</span>
                      )}
                      <span className="font-semibold text-gray-700">{produto.count} un</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {resumoPorLocal.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Boxes className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum item encontrado</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {Object.entries(agrupado).map(([key, g]) => (
            <div key={key} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{g.nome}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-400 flex items-center gap-1"><MapPin className="w-3 h-3" />{g.local}</span>
                  {g.proximaValidade && (
                    <span className="text-xs text-gray-400">Val: {new Date(g.proximaValidade).toLocaleDateString('pt-BR')}</span>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{g.count}</p>
                <p className="text-xs text-gray-400">unidades</p>
              </div>
            </div>
          ))}
          {Object.keys(agrupado).length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Boxes className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Nenhum item encontrado</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
