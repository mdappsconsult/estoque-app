'use client';

import { useRef, useState } from 'react';
import { Archive, Loader2, QrCode, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QRScanner from '@/components/QRScanner';
import { useAuth } from '@/hooks/useAuth';
import { baixarItem, getItemPorCodigoEscaneado } from '@/lib/services/itens';
import { errMessage } from '@/lib/errMessage';

interface BaixaResult {
  token_qr: string;
  nome: string;
  success: boolean;
  error?: string;
}

export default function BaixaDiariaPage() {
  const { usuario } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [processando, setProcessando] = useState(false);
  const [resultados, setResultados] = useState<BaixaResult[]>([]);
  const [mostrarEntradaManual, setMostrarEntradaManual] = useState(false);
  const processandoRef = useRef(false);
  const ultimoScanRef = useRef<{ token: string; ts: number } | null>(null);
  const itensBaixadosRef = useRef<Set<string>>(new Set());

  const localId = usuario?.local_padrao_id;

  const escanearBaixa = async (codigo?: string) => {
    const token = codigo || tokenInput.trim();
    if (!token || !usuario || !localId) return;

    // Scanner de câmera pode disparar o mesmo QR várias vezes em milissegundos.
    const agora = Date.now();
    const ultimo = ultimoScanRef.current;
    if (ultimo && ultimo.token === token && agora - ultimo.ts < 1200) {
      return;
    }
    ultimoScanRef.current = { token, ts: agora };

    if (processandoRef.current) return;
    processandoRef.current = true;

    setProcessando(true);
    try {
      const item = await getItemPorCodigoEscaneado(token);
      if (!item) {
        setResultados(prev => [{ token_qr: token, nome: token, success: false, error: 'Item não encontrado. Confira o código e tente novamente.' }, ...prev]);
      } else {
        if (itensBaixadosRef.current.has(item.id)) {
          setResultados(prev => [
            { token_qr: item.token_qr, nome: item.produto?.nome || '?', success: false, error: 'Item já baixado nesta sessão' },
            ...prev,
          ]);
          return;
        }
        await baixarItem(item.id, localId, usuario.id);
        itensBaixadosRef.current.add(item.id);
        setResultados(prev => [{ token_qr: item.token_qr, nome: item.produto?.nome || '', success: true }, ...prev]);
      }
    } catch (err: unknown) {
      setResultados((prev) => [
        {
          token_qr: token,
          nome: token,
          success: false,
          error: errMessage(err, 'Não foi possível buscar o item. Tente novamente.'),
        },
        ...prev,
      ]);
    } finally {
      setTokenInput('');
      setProcessando(false);
      processandoRef.current = false;
    }
  };

  const totalBaixados = resultados.filter(r => r.success).length;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center"><Archive className="w-5 h-5 text-orange-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Baixa Diária</h1>
          <p className="text-sm text-gray-500">Escanear QR das embalagens vazias</p>
        </div>
      </div>

      {!localId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500" />
          <p className="text-sm text-yellow-700">Você não tem um local padrão configurado. Peça ao admin.</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-3">
        <QRScanner
          onScan={(code) => escanearBaixa(code)}
          label="Ativar leitor de QR (câmera)"
        />
        <div>
          {!mostrarEntradaManual ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setMostrarEntradaManual(true)}
              disabled={!localId}
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
                  onKeyDown={(e) => e.key === 'Enter' && escanearBaixa()}
                  disabled={!localId}
                  autoFocus
                />
                <Button variant="primary" onClick={() => escanearBaixa()} disabled={processando || !localId || !tokenInput.trim()}>
                  {processando ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
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
        </div>
      </div>

      {totalBaixados > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-2xl font-bold text-green-600">{totalBaixados}</p>
          <p className="text-sm text-green-500">itens baixados nesta sessão</p>
        </div>
      )}

      {resultados.length > 0 && (
        <div className="space-y-2">
          {resultados.map((r, i) => (
            <div key={i} className={`flex items-center justify-between p-3 rounded-lg ${r.success ? 'bg-green-50' : 'bg-red-50'}`}>
              <div>
                <p className={`text-sm font-medium ${r.success ? 'text-green-800' : 'text-red-800'}`}>{r.nome || r.token_qr}</p>
                <p className="text-xs text-gray-400 font-mono">{r.token_qr}</p>
              </div>
              {r.success ? (
                <CheckCircle className="w-5 h-5 text-green-500" />
              ) : (
                <span className="text-xs text-red-500">{r.error}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
