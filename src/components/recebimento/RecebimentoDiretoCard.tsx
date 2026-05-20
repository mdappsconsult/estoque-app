'use client';

import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, QrCode, X, Zap } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/QRScanner';
import { errMessage } from '@/lib/errMessage';
import { bipQrAvulsoProducao } from '@/lib/services/envio-direto-producao';

interface BipadoSessao {
  itemId: string;
  produtoNome: string;
  origemNome: string;
  tokenQr?: string | null;
  emAs: string;
}

export interface RecebimentoDiretoCardProps {
  destinoId: string;
  destinoNome: string;
  usuarioId: string;
  /** Quando algum bip cai (move item), o pai pode querer recarregar listas/estoque. */
  onMovimentou?: () => void;
}

/**
 * Card simples no Recebimento: a loja bipa o QR do balde que chegou da indústria. A cada bip,
 * o app cria automaticamente uma remessa fechada (1 item), tira o balde da indústria e adiciona
 * ao estoque da loja. Não precisa a indústria criar nada antes.
 */
export default function RecebimentoDiretoCard({
  destinoId,
  destinoNome,
  usuarioId,
  onMovimentou,
}: RecebimentoDiretoCardProps) {
  const [aberto, setAberto] = useState(false);
  const [bipados, setBipados] = useState<BipadoSessao[]>([]);
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarManual, setMostrarManual] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const emAndamentoRef = useRef(false);

  const bipar = useCallback(
    async (codigo?: string) => {
      const tk = (codigo ?? tokenInput).trim();
      if (!tk) return;
      if (emAndamentoRef.current) return;
      emAndamentoRef.current = true;
      setErro('');
      setAviso('');
      try {
        const res = await bipQrAvulsoProducao({
          codigoQr: tk,
          localDestinoId: destinoId,
          usuarioId,
        });
        setBipados((prev) =>
          prev.some((b) => b.itemId === res.itemId)
            ? prev
            : [
                {
                  itemId: res.itemId,
                  produtoNome: res.produtoNome,
                  origemNome: res.origemNome,
                  tokenQr: tk,
                  emAs: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                },
                ...prev,
              ]
        );
        setTokenInput('');
        if (res.avisoFefo) setAviso(res.avisoFefo);
        onMovimentou?.();
      } catch (err) {
        setErro(errMessage(err, 'Não foi possível dar entrada nesse balde.'));
      } finally {
        emAndamentoRef.current = false;
      }
    },
    [tokenInput, destinoId, usuarioId, onMovimentou]
  );

  if (!aberto) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-blue-700" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-blue-900">Chegou balde direto da indústria?</p>
            <p className="text-xs text-blue-900/85 leading-relaxed mt-0.5">
              Bipe os QRs aqui — sem precisar a indústria criar remessa antes. Cada bip baixa
              da indústria e adiciona ao seu estoque na hora.
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setAberto(true)} className="shrink-0">
            <QrCode className="w-4 h-4 mr-1" /> Bipar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl p-4 mb-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
          <Zap className="w-4 h-4 text-blue-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Recebimento direto da produção</p>
          <p className="text-xs text-gray-600">
            Loja: <strong>{destinoNome}</strong> · cada QR escaneado vira recebimento automático.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAberto(false);
            setErro('');
            setAviso('');
          }}
          aria-label="Fechar"
          title="Fechar"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

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
            />
            <Button variant="primary" onClick={() => void bipar()}>
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
          <p className="leading-relaxed flex-1">{aviso}</p>
          <button onClick={() => setAviso('')} aria-label="Fechar" type="button">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2 text-xs text-red-900">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p className="leading-relaxed flex-1">{erro}</p>
          <button onClick={() => setErro('')} aria-label="Fechar" type="button">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {bipados.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-700">Bipados nesta sessão</p>
            <Badge variant="success" size="sm">{bipados.length}</Badge>
          </div>
          <ul className="space-y-1 max-h-40 overflow-y-auto text-xs text-gray-700">
            {bipados.map((b) => (
              <li key={b.itemId} className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-green-600 shrink-0" />
                <span className="font-mono text-[11px] shrink-0">
                  {b.tokenQr ? b.tokenQr.slice(0, 10) : b.itemId.slice(0, 8)}
                </span>
                <span className="truncate flex-1">{b.produtoNome}</span>
                <span className="text-gray-400 text-[10px] shrink-0">{b.emAs}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
