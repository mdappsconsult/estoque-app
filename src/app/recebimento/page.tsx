'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Store, Loader2, QrCode, CheckCircle, AlertTriangle, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QRScanner from '@/components/QRScanner';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { getItemPorCodigoEscaneado } from '@/lib/services/itens';
import { errMessage } from '@/lib/errMessage';
import { receberTransferencia } from '@/lib/services/transferencias';
import { filtrarRecebimentoPorLoja } from '@/lib/operador-loja-scope';
import { supabase } from '@/lib/supabase';

interface TransRow {
  id: string;
  tipo: string;
  status: string;
  origem_id: string;
  destino_id: string;
  created_at: string;
  origem: { nome: string };
  destino: { nome: string };
  transferencia_itens?: { id: string }[];
}

interface ItemEsperado {
  id: string;
  token_qr: string;
  token_short: string | null;
  nome: string;
}

export default function RecebimentoPage() {
  const { usuario } = useAuth();
  const { data: transferencias, loading } = useRealtimeQuery<TransRow>({
    table: 'transferencias',
    select: '*, origem:locais!origem_id(nome), destino:locais!destino_id(nome), transferencia_itens(id)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const emTransito = transferencias.filter((t) => t.status === 'IN_TRANSIT');
  const pendentes = filtrarRecebimentoPorLoja(emTransito, usuario);
  const [selecionada, setSelecionada] = useState<string>('');
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarEntradaManual, setMostrarEntradaManual] = useState(false);
  const [itensRecebidos, setItensRecebidos] = useState<{ id: string; token_qr: string; nome: string }[]>([]);
  const [itensEsperados, setItensEsperados] = useState<ItemEsperado[]>([]);
  const [loadingEsperados, setLoadingEsperados] = useState(false);
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ divergencias: number } | null>(null);
  const scanEmAndamentoRef = useRef(false);

  useEffect(() => {
    const carregarItensEsperados = async () => {
      if (!selecionada) {
        setItensEsperados([]);
        return;
      }
      setLoadingEsperados(true);
      try {
        const { data, error } = await supabase
          .from('transferencia_itens')
          .select('item_id, item:itens!item_id(id, token_qr, token_short, produto:produtos(nome))')
          .eq('transferencia_id', selecionada);
        if (error) throw error;
        type ItemJoin = {
          id?: string;
          token_qr?: string;
          token_short?: string | null;
          produto?: { nome?: string } | { nome?: string }[] | null;
        };
        type TiRow = { item_id: string; item: ItemJoin | ItemJoin[] | null };
        const normItem = (item: TiRow['item']): ItemJoin | null => {
          if (item == null) return null;
          return Array.isArray(item) ? (item[0] ?? null) : item;
        };
        const normProd = (p: ItemJoin['produto']): { nome?: string } | null => {
          if (p == null) return null;
          return Array.isArray(p) ? (p[0] ?? null) : p;
        };
        const itens = ((data || []) as TiRow[])
          .map((row) => {
            const it = normItem(row.item);
            return {
              id: it?.id || row.item_id,
              token_qr: it?.token_qr || '',
              token_short: it?.token_short || null,
              nome: normProd(it?.produto)?.nome || 'Produto',
            };
          })
          .filter((item: ItemEsperado) => Boolean(item.id));
        setItensEsperados(itens);
      } catch {
        setItensEsperados([]);
      } finally {
        setLoadingEsperados(false);
      }
    };
    void carregarItensEsperados();
  }, [selecionada]);

  const idsEscaneados = useMemo(
    () => new Set(itensRecebidos.map((i) => i.id)),
    [itensRecebidos]
  );

  const escanear = async (codigo?: string) => {
    const tk = codigo || tokenInput.trim();
    if (!tk) return;
    if (scanEmAndamentoRef.current) return;
    scanEmAndamentoRef.current = true;
    setErro('');
    try {
      if (loadingEsperados) {
        setErro('Aguarde carregar os itens esperados da transferência');
        return;
      }
      const item = await getItemPorCodigoEscaneado(tk);
      if (!item) { setErro('Item não encontrado. Confira o código e tente novamente.'); return; }
      if (itensEsperados.length > 0 && !itensEsperados.some((e) => e.id === item.id)) {
        setErro(
          'Este item existe no sistema, mas não consta nesta transferência. Confira se a etiqueta é desta remessa e se a separação foi registrada com as mesmas unidades (imprimir após «Criar separação» evita divergência).'
        );
        return;
      }
      let duplicado = false;
      setItensRecebidos((prev) => {
        if (prev.some((i) => i.id === item.id || i.token_qr === item.token_qr)) {
          duplicado = true;
          return prev;
        }
        return [...prev, { id: item.id, token_qr: item.token_qr, nome: item.produto?.nome || '' }];
      });
      if (duplicado) {
        setErro('Já escaneado');
        return;
      }
      setTokenInput('');
    } catch { setErro('Não foi possível buscar o item. Tente novamente.'); }
    finally {
      scanEmAndamentoRef.current = false;
    }
  };

  const confirmarRecebimento = async () => {
    if (!usuario) {
      setErro('Faça login novamente para continuar');
      return;
    }
    if (!selecionada) {
      setErro('Selecione uma transferência em trânsito');
      return;
    }
    if (itensRecebidos.length === 0) {
      setErro('Escaneie pelo menos 1 item antes de confirmar');
      return;
    }

    const transSelecionada = transferencias.find((t) => t.id === selecionada);
    if (!transSelecionada) {
      setErro('Transferência não encontrada. Atualize a página e tente novamente.');
      return;
    }
    if (transSelecionada.status !== 'IN_TRANSIT') {
      setErro('Esta transferência não está mais em trânsito.');
      return;
    }
    if (!pendentes.some((t) => t.id === selecionada)) {
      setErro('Esta transferência não está disponível para o seu usuário.');
      return;
    }
    const confirmou = window.confirm(
      `Confirmar recebimento de ${itensRecebidos.length} item(ns) desta transferência?`
    );
    if (!confirmou) return;

    setSaving(true);
    setErro('');
    try {
      const res = await receberTransferencia(
        selecionada,
        itensRecebidos.map((i) => i.id),
        transSelecionada.destino_id,
        usuario.id
      );
      setResultado({ divergencias: res.divergencias.length });
      setItensRecebidos([]);
      setSelecionada('');
    } catch (err: unknown) {
      setErro(errMessage(err, 'Erro ao confirmar recebimento'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><Store className="w-5 h-5 text-green-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receber Entrega</h1>
          <p className="text-sm text-gray-500">Conferência por QR</p>
        </div>
      </div>

      {resultado && (
        <div className={`${resultado.divergencias > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'} border rounded-xl p-4 mb-6 flex items-center gap-3`}>
          {resultado.divergencias > 0 ? <AlertTriangle className="w-6 h-6 text-yellow-500" /> : <CheckCircle className="w-6 h-6 text-green-500" />}
          <div>
            <p className="font-semibold">{resultado.divergencias > 0 ? `${resultado.divergencias} divergência(s) registrada(s)` : 'Recebimento concluído!'}</p>
          </div>
          <button onClick={() => setResultado(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-2">
        {usuario?.perfil === 'OPERATOR_STORE' && usuario.local_padrao_id && (
          <p className="text-xs text-gray-600">
            Lista só entregas <span className="font-medium">em trânsito para a sua loja</span> (origem pode ser a
            indústria ou outra loja — o que importa é o destino ser a unidade vinculada ao seu usuário).
          </p>
        )}
        <Select
          label="Transferência em trânsito"
          options={[
            { value: '', label: 'Selecione...' },
            ...pendentes.map((t) => {
              const qtdItens = t.transferencia_itens?.length || 0;
              const data = new Date(t.created_at).toLocaleString('pt-BR');
              return {
                value: t.id,
                label: `${t.origem?.nome || '?'} → ${t.destino?.nome || '?'} • ${qtdItens} item(ns) • ${data}`,
              };
            }),
          ]}
          value={selecionada}
          onChange={(e) => {
            setSelecionada(e.target.value);
            setItensRecebidos([]);
            setErro('');
            setMostrarEntradaManual(false);
          }}
        />
      </div>

      {selecionada && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-900">Itens esperados desta entrega</p>
              <div className="flex items-center gap-2">
                <Badge variant="info" size="sm">Total: {itensEsperados.length}</Badge>
                <Badge variant="success" size="sm">Escaneados: {itensRecebidos.length}</Badge>
                <Badge variant="warning" size="sm">Faltando: {Math.max(itensEsperados.length - itensRecebidos.length, 0)}</Badge>
              </div>
            </div>
            {loadingEsperados ? (
              <div className="py-6 flex items-center justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Carregando itens esperados...
              </div>
            ) : itensEsperados.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {itensEsperados.map((item) => {
                  const escaneado = idsEscaneados.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                        escaneado
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.nome}</p>
                        <p className="text-xs text-gray-400 font-mono">
                          {item.token_short || item.token_qr}
                        </p>
                      </div>
                      <Badge variant={escaneado ? 'success' : 'warning'} size="sm">
                        {escaneado ? 'Escaneado' : 'Pendente'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Não foi possível carregar os itens da transferência.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Escanear QR do item recebido</label>
            <QRScanner onScan={(code) => escanear(code)} label="Ativar leitor de QR (câmera)" />
            {!mostrarEntradaManual ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setMostrarEntradaManual(true)}
              >
                Não conseguiu ler? Digitar código
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite o código QR ou token curto"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && escanear()}
                  />
                  <Button variant="primary" onClick={() => escanear()}>
                    <QrCode className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMostrarEntradaManual(false);
                    setTokenInput('');
                  }}
                >
                  Fechar digitação manual
                </Button>
              </div>
            )}
            {erro && <p className="text-sm text-red-500 mt-2">{erro}</p>}
          </div>

          {itensRecebidos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">Itens recebidos</p>
                <Badge variant="success">{itensRecebidos.length}</Badge>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {itensRecebidos.map(i => (
                  <div key={i.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                    <span>{i.nome}</span>
                    <span className="text-xs text-gray-400 font-mono">{i.token_qr}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={confirmarRecebimento} disabled={saving || itensRecebidos.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Confirmar Recebimento
          </Button>
        </>
      )}

      {pendentes.length === 0 && !selecionada && (
        <div className="text-center py-12 text-gray-400">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhuma entrega em trânsito</p>
          {usuario?.perfil === 'OPERATOR_STORE' &&
            usuario.local_padrao_id &&
            emTransito.length > 0 && (
              <p className="text-xs text-gray-500 mt-2 max-w-xs mx-auto">
                Há entregas em trânsito para outras lojas. Só aparecem aqui os pedidos com destino na{' '}
                <span className="font-medium">sua loja</span> (local padrão do seu usuário).
              </p>
            )}
          {usuario?.perfil === 'OPERATOR_STORE' && !usuario.local_padrao_id && (
            <p className="text-xs text-amber-700 mt-2 max-w-xs mx-auto">
              Seu usuário não tem loja padrão cadastrada. Peça ao administrador para vincular sua loja em
              cadastro de usuários.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
