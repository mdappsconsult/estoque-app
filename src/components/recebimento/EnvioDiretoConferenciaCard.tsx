'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, QrCode, CheckCircle, AlertTriangle, X, Truck } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/QRScanner';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import {
  bipQrEnvioDireto,
  encerrarEnvioDiretoComDivergencia,
} from '@/lib/services/envio-direto-producao';

interface EnvioDiretoBipado {
  itemId: string;
  tokenQr?: string | null;
  tokenShort?: string | null;
}

export interface EnvioDiretoConferenciaCardProps {
  transferenciaId: string;
  destinoId: string;
  produtoNome: string;
  produtoId: string;
  quantidadeDemandada: number;
  origemNome: string;
  destinoNome: string;
  usuarioId: string;
  /** Permite operadores que não são ADMIN encerrar com falta (combinado com produção). */
  podeEncerrarComFalta: boolean;
  /** Avisa o pai que a remessa foi fechada (DELIVERED ou DIVERGENCE) para atualizar a lista. */
  onConcluida?: () => void;
  /** Avisa o pai sobre demanda da loja (mínimo configurado para esse produto). */
  estoqueMinimoLoja?: number;
  estoqueAtualLoja?: number;
}

export default function EnvioDiretoConferenciaCard(props: EnvioDiretoConferenciaCardProps) {
  const {
    transferenciaId,
    destinoId,
    produtoNome,
    produtoId,
    quantidadeDemandada,
    origemNome,
    destinoNome,
    usuarioId,
    podeEncerrarComFalta,
    onConcluida,
    estoqueMinimoLoja,
    estoqueAtualLoja,
  } = props;

  const [bipados, setBipados] = useState<EnvioDiretoBipado[]>([]);
  const [contagemServidor, setContagemServidor] = useState<number>(0);
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [erro, setErro] = useState<string>('');
  const [aviso, setAviso] = useState<string>('');
  const [encerrando, setEncerrando] = useState(false);
  const emAndamentoRef = useRef(false);

  const recarregarContagem = useCallback(async () => {
    const { count, error } = await supabase
      .from('transferencia_itens')
      .select('id', { count: 'exact', head: true })
      .eq('transferencia_id', transferenciaId);
    if (!error) setContagemServidor(count ?? 0);
  }, [transferenciaId]);

  useEffect(() => {
    void recarregarContagem();
  }, [recarregarContagem]);

  const restante = useMemo(
    () => Math.max(quantidadeDemandada - Math.max(contagemServidor, bipados.length), 0),
    [quantidadeDemandada, contagemServidor, bipados.length]
  );
  const completo = restante === 0;

  const aviso_demanda = useMemo(() => {
    if (estoqueMinimoLoja == null || estoqueAtualLoja == null) return null;
    const necessidade = Math.max(0, estoqueMinimoLoja - estoqueAtualLoja);
    if (necessidade > 0 && quantidadeDemandada < necessidade) {
      return `A loja precisaria de ${necessidade} baldes (mínimo ${estoqueMinimoLoja}, atual ${estoqueAtualLoja}); a indústria mandou ${quantidadeDemandada}.`;
    }
    return null;
  }, [estoqueMinimoLoja, estoqueAtualLoja, quantidadeDemandada]);

  const bipar = useCallback(
    async (codigo?: string) => {
      const tk = (codigo ?? tokenInput).trim();
      if (!tk) return;
      if (emAndamentoRef.current) return;
      emAndamentoRef.current = true;
      setErro('');
      setAviso('');
      try {
        const res = await bipQrEnvioDireto({
          transferenciaId,
          codigoQr: tk,
          usuarioId,
          localDestinoId: destinoId,
        });
        setBipados((prev) =>
          prev.some((b) => b.itemId === res.itemId) ? prev : [...prev, { itemId: res.itemId, tokenQr: tk }]
        );
        setContagemServidor(res.bipados);
        setTokenInput('');
        if (res.avisoFefo) setAviso(res.avisoFefo);
        if (res.fechouRemessa) {
          onConcluida?.();
        }
      } catch (err) {
        setErro(errMessage(err, 'Não foi possível bipar o QR.'));
      } finally {
        emAndamentoRef.current = false;
      }
    },
    [tokenInput, transferenciaId, usuarioId, destinoId, onConcluida]
  );

  const encerrar = async () => {
    if (!podeEncerrarComFalta) return;
    const faltam = restante;
    const msg =
      faltam > 0
        ? `Encerrar com FALTA de ${faltam} balde(s)? A remessa vai como divergência e a gerência fica avisada.`
        : 'Confirmar entrega completa?';
    if (!window.confirm(msg)) return;
    setEncerrando(true);
    setErro('');
    setAviso('');
    try {
      const res = await encerrarEnvioDiretoComDivergencia(transferenciaId, usuarioId);
      if (res.faltantes === 0) {
        setAviso('Remessa concluída.');
      } else {
        setAviso(`Remessa fechada com ${res.faltantes} balde(s) faltando — gerência avisada.`);
      }
      onConcluida?.();
    } catch (err) {
      setErro(errMessage(err, 'Erro ao encerrar.'));
    } finally {
      setEncerrando(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-blue-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center">
            <Truck className="w-4 h-4 text-blue-700" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{produtoNome}</p>
            <p className="text-xs text-gray-600">
              {origemNome} → {destinoNome} · envio direto da produção
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div className="bg-blue-50 rounded-lg py-2">
            <p className="text-[11px] text-blue-700 uppercase">Esperado</p>
            <p className="text-lg font-bold tabular-nums text-blue-900">{quantidadeDemandada}</p>
          </div>
          <div className={`${completo ? 'bg-green-50' : 'bg-gray-50'} rounded-lg py-2`}>
            <p className={`text-[11px] uppercase ${completo ? 'text-green-700' : 'text-gray-600'}`}>
              Bipados
            </p>
            <p
              className={`text-lg font-bold tabular-nums ${
                completo ? 'text-green-900' : 'text-gray-900'
              }`}
            >
              {Math.max(contagemServidor, bipados.length)}
            </p>
          </div>
          <div className={`${restante === 0 ? 'bg-green-50' : 'bg-amber-50'} rounded-lg py-2`}>
            <p
              className={`text-[11px] uppercase ${
                restante === 0 ? 'text-green-700' : 'text-amber-800'
              }`}
            >
              Faltam
            </p>
            <p
              className={`text-lg font-bold tabular-nums ${
                restante === 0 ? 'text-green-900' : 'text-amber-900'
              }`}
            >
              {restante}
            </p>
          </div>
        </div>
        {aviso_demanda && (
          <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
            <strong>Demanda incompleta:</strong> {aviso_demanda}
          </p>
        )}
        <p className="text-xs text-gray-500 leading-relaxed">
          Bipe cada balde que chegou. A cada bip, o sistema baixa da indústria e adiciona ao seu estoque
          automaticamente. Quando atingir <strong>{quantidadeDemandada}</strong>, a remessa fecha sozinha
          como entregue. Produto travado:{' '}
          <span className="font-mono text-[10px]">{produtoId.slice(0, 8)}…</span>
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <QRScanner onScan={(code) => void bipar(code)} label="Ativar leitor de QR (câmera)" />
        {!mostrarManual ? (
          <Button variant="outline" className="w-full" onClick={() => setMostrarManual(true)}>
            Não conseguiu ler? Digitar código
          </Button>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Token QR ou curto"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void bipar()}
                disabled={completo}
              />
              <Button
                variant="primary"
                onClick={() => void bipar()}
                disabled={completo}
              >
                <QrCode className="w-4 h-4" />
              </Button>
            </div>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => {
                setMostrarManual(false);
                setTokenInput('');
              }}
            >
              Fechar digitação manual
            </Button>
          </div>
        )}
        {aviso && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 flex items-start gap-2 text-xs text-amber-900">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{aviso}</p>
            <button
              onClick={() => setAviso('')}
              className="ml-auto"
              aria-label="Fechar"
              type="button"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {erro && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2 text-xs text-red-900">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{erro}</p>
          </div>
        )}
        {completo && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex items-start gap-2 text-xs text-green-900">
            <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>Remessa completa — entrega confirmada.</p>
          </div>
        )}
      </div>

      {bipados.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="font-semibold text-sm text-gray-800">Baldes bipados nesta sessão</p>
            <Badge variant="success" size="sm">
              {bipados.length}
            </Badge>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto text-xs font-mono text-gray-600">
            {bipados.map((b, idx) => (
              <li key={b.itemId} className="flex justify-between">
                <span>
                  {idx + 1}. {b.tokenQr || b.itemId.slice(0, 8)}
                </span>
                <CheckCircle className="w-3 h-3 text-green-600" />
              </li>
            ))}
          </ul>
        </div>
      )}

      {podeEncerrarComFalta && !completo && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => void encerrar()}
          disabled={encerrando}
        >
          {encerrando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : (
            <AlertTriangle className="w-4 h-4 mr-2" />
          )}
          Encerrar com falta ({restante})
        </Button>
      )}
    </div>
  );
}
