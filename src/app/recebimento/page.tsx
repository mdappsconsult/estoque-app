'use client';

import { useState } from 'react';
import { Store, Loader2, QrCode, CheckCircle, AlertTriangle, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { getItemByTokenQR } from '@/lib/services/itens';
import { receberTransferencia, TransferenciaCompleta } from '@/lib/services/transferencias';

interface TransRow {
  id: string;
  tipo: string;
  status: string;
  origem_id: string;
  destino_id: string;
  created_at: string;
  origem: { nome: string };
  destino: { nome: string };
}

export default function RecebimentoPage() {
  const { usuario } = useAuth();
  const { data: transferencias, loading } = useRealtimeQuery<TransRow>({
    table: 'transferencias',
    select: '*, origem:locais!origem_id(nome), destino:locais!destino_id(nome)',
    orderBy: { column: 'created_at', ascending: false },
  });

  const pendentes = transferencias.filter(t => t.status === 'IN_TRANSIT');
  const [selecionada, setSelecionada] = useState<string>('');
  const [tokenInput, setTokenInput] = useState('');
  const [itensRecebidos, setItensRecebidos] = useState<{ id: string; token_qr: string; nome: string }[]>([]);
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ divergencias: number } | null>(null);

  const escanear = async () => {
    if (!tokenInput.trim()) return;
    setErro('');
    try {
      const item = await getItemByTokenQR(tokenInput.trim());
      if (!item) { setErro('Item não encontrado'); return; }
      if (itensRecebidos.find(i => i.id === item.id)) { setErro('Já escaneado'); return; }
      setItensRecebidos(prev => [...prev, { id: item.id, token_qr: item.token_qr, nome: item.produto?.nome || '' }]);
      setTokenInput('');
    } catch { setErro('Erro ao buscar'); }
  };

  const confirmarRecebimento = async () => {
    if (!usuario) return;
    const trans = pendentes.find(t => t.id === selecionada);
    if (!trans) return;
    setSaving(true);
    try {
      const res = await receberTransferencia(selecionada, itensRecebidos.map(i => i.id), trans.destino_id, usuario.id);
      setResultado({ divergencias: res.divergencias.length });
      setItensRecebidos([]);
      setSelecionada('');
    } catch (err: any) {
      alert(err?.message || 'Erro');
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

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
        <Select
          label="Transferência em trânsito"
          options={[{ value: '', label: 'Selecione...' }, ...pendentes.map(t => ({ value: t.id, label: `${t.origem?.nome} → ${t.destino?.nome} (${new Date(t.created_at).toLocaleDateString('pt-BR')})` }))]}
          value={selecionada}
          onChange={(e) => { setSelecionada(e.target.value); setItensRecebidos([]); }}
        />
      </div>

      {selecionada && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Escanear QR do item recebido</label>
            <div className="flex gap-2">
              <Input placeholder="Código QR" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && escanear()} />
              <Button variant="primary" onClick={escanear}><QrCode className="w-4 h-4" /></Button>
            </div>
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
        </div>
      )}
    </div>
  );
}
