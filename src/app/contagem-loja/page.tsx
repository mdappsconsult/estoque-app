'use client';

import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, ClipboardCheck, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { Local } from '@/types/database';
import {
  getConfigProdutosLoja,
  getContagensLoja,
  salvarContagensLoja,
  participaReposicaoLoja,
  LojaProdutoConfigRow,
  LojaContagemRow,
} from '@/lib/services/reposicao-loja';

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
      const [configData, contagensData] = await Promise.all([getConfigProdutosLoja(idLoja), getContagensLoja(idLoja)]);
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
      quantidadeContada: Number(contagens[config.produto_id] || 0),
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
      setErro(err instanceof Error ? err.message : 'Falha ao enviar contagem');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
          <ClipboardCheck className="w-5 h-5 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contagem da loja</h1>
          <p className="text-sm text-gray-500">Envie a contagem atual para gerar reposição automática</p>
        </div>
      </div>

      {sucesso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <div>
            <p className="font-semibold text-green-800">Contagem enviada com sucesso</p>
            <p className="text-sm text-green-600">A separação já pode usar os faltantes calculados para esta loja.</p>
          </div>
          <button className="ml-auto text-green-500" onClick={() => setSucesso(false)}>x</button>
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
          <p className="text-xs text-gray-500">
            Loja travada pelo seu perfil operacional.
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        {loading ? (
          <div className="py-10 flex justify-center">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        ) : configs.length === 0 ? (
          <p className="text-sm text-gray-500 py-8 text-center">
            Esta loja não tem produtos ativos para contagem. Peça ao estoque para configurar em Cadastros.
          </p>
        ) : (
          <>
            <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {configs.map((config) => (
                <div key={config.id} className="border border-gray-200 rounded-lg p-3">
                  <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{config.produto?.nome || 'Produto'}</p>
                      <p className="text-xs text-gray-500">Mínimo da loja: {config.estoque_minimo_loja}</p>
                    </div>
                    <Input
                      type="number"
                      min="0"
                      className="w-full md:w-44"
                      value={contagens[config.produto_id] ?? '0'}
                      onChange={(e) =>
                        setContagens((prev) => ({
                          ...prev,
                          [config.produto_id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              ))}
            </div>

            {erro && <p className="text-sm text-red-500 mt-3">{erro}</p>}

            <div className="mt-4">
              <Button variant="primary" className="w-full" onClick={() => void salvar()} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Enviar contagem
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
