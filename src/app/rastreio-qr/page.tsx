'use client';

import { useState } from 'react';
import { Search, Loader2, QrCode, Clock, MapPin, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QRScanner from '@/components/QRScanner';
import Badge from '@/components/ui/Badge';
import { getItemByTokenQR, ItemCompleto } from '@/lib/services/itens';
import { getRastreioItem, AuditoriaCompleta } from '@/lib/services/auditoria';

export default function RastreioQRPage() {
  const [token, setToken] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [item, setItem] = useState<ItemCompleto | null>(null);
  const [timeline, setTimeline] = useState<AuditoriaCompleta[]>([]);
  const [erro, setErro] = useState('');

  const buscar = async (codigo?: string) => {
    const t = codigo || token.trim();
    if (!t) return;
    setToken(t);
    setBuscando(true);
    setItem(null);
    setTimeline([]);
    setErro('');
    try {
      const result = await getItemByTokenQR(t);
      if (!result) { setErro('Item não encontrado'); setBuscando(false); return; }
      setItem(result);
      const audit = await getRastreioItem(result.id);
      setTimeline(audit);
    } catch { setErro('Erro ao buscar'); }
    finally { setBuscando(false); }
  };

  const estadoBadge: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
    EM_ESTOQUE: 'success', EM_TRANSFERENCIA: 'warning', BAIXADO: 'error', DESCARTADO: 'error',
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center"><Search className="w-5 h-5 text-gray-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Rastreio por QR</h1>
          <p className="text-sm text-gray-500">Linha do tempo completa</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6 space-y-3">
        <QRScanner onScan={(code) => buscar(code)} label="Escanear com câmera" />
        <div className="flex gap-2">
          <Input placeholder="Ou digite o código QR" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} />
          <Button variant="primary" onClick={() => buscar()} disabled={buscando}>
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </Button>
        </div>
        {erro && <p className="text-sm text-red-500 mt-2">{erro}</p>}
      </div>

      {item && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">{item.produto?.nome}</p>
              <p className="text-xs text-gray-400 font-mono">{item.token_qr}</p>
            </div>
            <Badge variant={estadoBadge[item.estado]}>{item.estado.replace('_', ' ')}</Badge>
          </div>
          {item.local_atual && <p className="text-sm text-gray-500 mt-2 flex items-center gap-1"><MapPin className="w-3 h-3" />{item.local_atual.nome}</p>}
          {item.data_validade && <p className="text-sm text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />Val: {new Date(item.data_validade).toLocaleDateString('pt-BR')}</p>}
        </div>
      )}

      {timeline.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-700 mb-3">Timeline</h2>
          <div className="relative">
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200" />
            <div className="space-y-4">
              {timeline.map((t, i) => (
                <div key={t.id} className="relative pl-10">
                  <div className="absolute left-2.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white" />
                  <div className="bg-white rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="default" size="sm">{t.acao}</Badge>
                      <span className="text-xs text-gray-400">{new Date(t.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                    {t.usuario && <p className="text-sm text-gray-600 flex items-center gap-1"><User className="w-3 h-3" />{t.usuario.nome}</p>}
                    {t.local && <p className="text-sm text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{t.local.nome}</p>}
                    {t.detalhes && <p className="text-xs text-gray-400 mt-1">{JSON.stringify(t.detalhes)}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
