'use client';

import { useState } from 'react';
import { Archive, Loader2, QrCode, CheckCircle, X, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Badge from '@/components/ui/Badge';
import QRScanner from '@/components/QRScanner';
import { useAuth } from '@/hooks/useAuth';
import { getItemByTokenQR, baixarItem } from '@/lib/services/itens';

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

  const localId = usuario?.local_padrao_id;

  const escanearBaixa = async (codigo?: string) => {
    const token = codigo || tokenInput.trim();
    if (!token || !usuario || !localId) return;
    setProcessando(true);
    try {
      const item = await getItemByTokenQR(token);
      if (!item) {
        setResultados(prev => [{ token_qr: token, nome: '?', success: false, error: 'Não encontrado' }, ...prev]);
      } else {
        await baixarItem(item.id, localId, usuario.id);
        setResultados(prev => [{ token_qr: item.token_qr, nome: item.produto?.nome || '', success: true }, ...prev]);
      }
    } catch (err: any) {
      setResultados(prev => [{ token_qr: token, nome: '?', success: false, error: err?.message || 'Erro' }, ...prev]);
    } finally {
      setTokenInput('');
      setProcessando(false);
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
        <QRScanner onScan={(code) => escanearBaixa(code)} label="Abrir câmera para escanear" />
        <div className="flex gap-2">
          <Input
            placeholder="Ou digite o código QR"
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
