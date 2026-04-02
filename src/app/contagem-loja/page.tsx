'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ClipboardCheck, Loader2, Package } from 'lucide-react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { Local } from '@/types/database';
import {
  ensureTodosProdutosElegiveisNaLoja,
  getConfigProdutosLoja,
  getContagensLoja,
  salvarContagensLoja,
  participaReposicaoLoja,
  LojaProdutoConfigRow,
  LojaContagemRow,
} from '@/lib/services/reposicao-loja';

function parseQtd(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) && !Number.isNaN(n) ? Math.max(0, Math.floor(n)) : 0;
}

export default function ContagemLojaPage() {
  const { usuario } = useAuth();
  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    select: 'id, nome, tipo, status',
    orderBy: { column: 'nome', ascending: true },
  });

  const lojasAtivas = useMemo(
    () => locais.filter((local) => local.tipo === 'STORE' && local.status === 'ativo'),
    [locais]
  );

  const lojaInicial = usuario?.local_padrao_id || '';
  const [lojaId, setLojaId] = useState(lojaInicial);
  const [configs, setConfigs] = useState<LojaProdutoConfigRow[]>([]);
  const [contagens, setContagens] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!lojaInicial) return;
    setLojaId(lojaInicial);
  }, [lojaInicial]);

  const configsOrdenados = useMemo(
    () =>
      [...configs].sort((a, b) =>
        (a.produto?.nome || '').localeCompare(b.produto?.nome || '', 'pt-BR')
      ),
    [configs]
  );

  const carregarDados = async (idLoja: string) => {
    if (!idLoja) {
      setConfigs([]);
      setContagens({});
      setLoading(false);
      return;
    }
    setLoading(true);
    setErro('');
    try {
      await ensureTodosProdutosElegiveisNaLoja(idLoja);
      const [configData, contagensData] = await Promise.all([
        getConfigProdutosLoja(idLoja),
        getContagensLoja(idLoja),
      ]);
      const ativos = configData.filter(
        (config) =>
          config.ativo_na_loja &&
          config.produto?.status !== 'inativo' &&
          participaReposicaoLoja(config.produto?.escopo_reposicao, config.produto?.origem)
      );
      const mapaContagens = new Map<string, LojaContagemRow>(
        contagensData.map((item) => [item.produto_id, item])
      );
      const valoresIniciais: Record<string, string> = {};
      ativos.forEach((item) => {
        const valor = mapaContagens.get(item.produto_id)?.quantidade_contada ?? 0;
        valoresIniciais[item.produto_id] = String(valor);
      });
      setConfigs(ativos);
      setContagens(valoresIniciais);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Não foi possível carregar os produtos da loja');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void carregarDados(lojaId);
  }, [lojaId]);

  const salvar = async () => {
    if (!usuario?.id) {
      alert('Faça login novamente');
      return;
    }
    if (!lojaId) {
      alert('Selecione a loja');
      return;
    }
    const payload = configs.map((config) => ({
      produtoId: config.produto_id,
      quantidadeContada: parseQtd(contagens[config.produto_id] ?? '0'),
    }));

    setSaving(true);
    setErro('');
    try {
      await salvarContagensLoja({
        lojaId,
        usuarioId: usuario.id,
        contagens: payload,
      });
      setSucesso(true);
      await carregarDados(lojaId);
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Falha ao enviar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <Package className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Declarar estoque na loja</h1>
          <p className="text-sm text-gray-500">
            Para cada produto abaixo, informe <span className="text-gray-700 font-medium">só quantas unidades você tem</span>{' '}
            em estoque na loja (produtos fechados prontos para venda). Não precisa calcular nada além disso.
          </p>
        </div>
      </div>

      {sucesso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <CheckCircle className="w-6 h-6 text-green-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-green-800">Registro salvo</p>
            <p className="text-sm text-green-700 mt-1">Suas quantidades foram enviadas. Obrigado.</p>
          </div>
          <button
            type="button"
            className="ml-auto text-green-600 hover:text-green-800 shrink-0"
            aria-label="Fechar"
            onClick={() => setSucesso(false)}
          >
            ×
          </button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        <Select
          label="Loja"
          required
          options={[
            { value: '', label: 'Selecione...' },
            ...lojasAtivas.map((loja) => ({ value: loja.id, label: loja.nome })),
          ]}
          value={lojaId}
          onChange={(e) => setLojaId(e.target.value)}
          disabled={Boolean(usuario?.local_padrao_id)}
        />
        {usuario?.local_padrao_id && (
          <p className="text-xs text-gray-500">Loja fixa conforme seu cadastro de operador de loja.</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-purple-600" />
            <h2 className="text-sm font-semibold text-gray-900">Produtos</h2>
          </div>
          <span className="text-xs text-gray-500">{configsOrdenados.length} itens</span>
        </div>

        {loading ? (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : configsOrdenados.length === 0 ? (
          <p className="text-sm text-gray-500 py-10 px-4 text-center">
            Não há produtos para declarar nesta loja no momento. Se algo estiver faltando na lista, avise o estoque.
          </p>
        ) : (
          <>
            <div className="max-h-[min(70vh,520px)] overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs font-medium text-gray-500 border-b border-gray-200 bg-white sticky top-0 z-[1]">
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-4 py-2.5 w-[8rem] text-center sm:text-left">Quantidade que tenho</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {configsOrdenados.map((config) => (
                    <tr key={config.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-2 text-gray-900">{config.produto?.nome || 'Produto'}</td>
                      <td className="px-4 py-1.5">
                        <input
                          type="number"
                          min={0}
                          inputMode="numeric"
                          aria-label={`Quantidade em estoque de ${config.produto?.nome || 'produto'}`}
                          className="w-full max-w-[6.5rem] sm:ml-0 mx-auto block px-2 py-1.5 text-sm text-center sm:text-left tabular-nums border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500"
                          value={contagens[config.produto_id] ?? '0'}
                          onChange={(e) =>
                            setContagens((prev) => ({
                              ...prev,
                              [config.produto_id]: e.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {erro && <p className="text-sm text-red-600 px-4 py-2 border-t border-red-100 bg-red-50/50">{erro}</p>}

            <div className="p-4 border-t border-gray-100">
              <Button variant="primary" className="w-full sm:w-auto" onClick={() => void salvar()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Salvar estoque declarado
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
