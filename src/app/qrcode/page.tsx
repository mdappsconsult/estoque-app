'use client';

import { useState } from 'react';
import { QrCode, Loader2, Search, Package, MapPin, Clock, Tag } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QRScanner from '@/components/QRScanner';
import Badge from '@/components/ui/Badge';
import { getItemByTokenQR, ItemCompleto } from '@/lib/services/itens';

const estadoBadge = (estado: string) => {
  const map: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
    EM_ESTOQUE: 'success',
    EM_TRANSFERENCIA: 'warning',
    BAIXADO: 'error',
    DESCARTADO: 'error',
  };
  return map[estado] || 'default';
};

const estadoLabel = (estado: string) => {
  const map: Record<string, string> = {
    EM_ESTOQUE: 'Em Estoque',
    EM_TRANSFERENCIA: 'Em Transferência',
    BAIXADO: 'Baixado',
    DESCARTADO: 'Descartado',
  };
  return map[estado] || estado;
};

export default function QRCodePage() {
  const [token, setToken] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [item, setItem] = useState<ItemCompleto | null>(null);
  const [naoEncontrado, setNaoEncontrado] = useState(false);

  const buscar = async (codigo?: string) => {
    const t = codigo || token.trim();
    if (!t) return;
    setToken(t);
    setBuscando(true);
    setItem(null);
    setNaoEncontrado(false);
    try {
      const result = await getItemByTokenQR(t);
      if (result) {
        setItem(result);
      } else {
        setNaoEncontrado(true);
      }
    } catch {
      alert('Erro ao buscar');
    } finally {
      setBuscando(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><QrCode className="w-5 h-5 text-gray-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scanner QR</h1>
          <p className="text-sm text-gray-500">Consultar item por código QR</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-3">
        <QRScanner onScan={(code) => buscar(code)} label="Abrir câmera para escanear" />
        <div className="flex gap-2">
          <Input
            placeholder="Ou digite o código QR"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscar()}
          />
          <Button variant="primary" onClick={() => buscar()} disabled={buscando || !token.trim()}>
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {naoEncontrado && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-600 font-medium">Item não encontrado</p>
          <p className="text-sm text-red-400 mt-1">Verifique o código e tente novamente</p>
        </div>
      )}

      {item && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">{item.produto?.nome || 'Produto'}</h2>
            <Badge variant={estadoBadge(item.estado)}>{estadoLabel(item.estado)}</Badge>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Tag className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">QR:</span>
              <span className="font-mono text-gray-700">{item.token_qr}</span>
            </div>
            {item.token_short && (
              <div className="flex items-center gap-3 text-sm">
                <Tag className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Short:</span>
                <span className="font-mono text-gray-700">{item.token_short}</span>
              </div>
            )}
            {item.local_atual && (
              <div className="flex items-center gap-3 text-sm">
                <MapPin className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Local:</span>
                <span className="text-gray-700">{item.local_atual.nome}</span>
              </div>
            )}
            {item.data_validade && (
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Validade:</span>
                <span className="text-gray-700">{new Date(item.data_validade).toLocaleDateString('pt-BR')}</span>
              </div>
            )}
            {item.lote_compra?.fornecedor && (
              <div className="flex items-center gap-3 text-sm">
                <Package className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Fornecedor:</span>
                <span className="text-gray-700">{item.lote_compra.fornecedor}</span>
              </div>
            )}
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Criado:</span>
              <span className="text-gray-700">{new Date(item.created_at).toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
