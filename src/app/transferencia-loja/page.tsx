'use client';

import { useState } from 'react';
import { Truck, Loader2, QrCode, CheckCircle, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { getItemByTokenQR } from '@/lib/services/itens';
import { criarTransferencia } from '@/lib/services/transferencias';
import { Local } from '@/types/database';

export default function TransferenciaLojaPage() {
  const { usuario } = useAuth();
  const { data: locais, loading } = useRealtimeQuery<Local>({ table: 'locais', orderBy: { column: 'nome', ascending: true } });
  const lojas = locais.filter(l => l.tipo === 'STORE');

  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [itens, setItens] = useState<{ id: string; token_qr: string; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  const escanear = async () => {
    if (!tokenInput.trim()) return;
    setErro('');
    try {
      const item = await getItemByTokenQR(tokenInput.trim());
      if (!item) { setErro('Não encontrado'); return; }
      if (item.estado !== 'EM_ESTOQUE') { setErro('Não está em estoque'); return; }
      if (item.local_atual_id !== origemId) { setErro('Item não está nesta loja'); return; }
      if (itens.find(i => i.id === item.id)) { setErro('Já escaneado'); return; }
      setItens(prev => [...prev, { id: item.id, token_qr: item.token_qr, nome: item.produto?.nome || '' }]);
      setTokenInput('');
    } catch { setErro('Erro'); }
  };

  const criar = async () => {
    if (!usuario) return;
    setSaving(true);
    try {
      await criarTransferencia(
        { tipo: 'STORE_STORE', origem_id: origemId, destino_id: destinoId, criado_por: usuario.id, status: 'AWAITING_ACCEPT' },
        itens.map(i => i.id)
      );
      setSucesso(true);
      setItens([]);
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
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center"><Truck className="w-5 h-5 text-blue-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Transferência Loja → Loja</h1>
          <p className="text-sm text-gray-500">Emergencial com aceite</p>
        </div>
      </div>

      {sucesso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <p className="font-semibold text-green-800">Transferência criada! Aguardando aceite da loja destino.</p>
          <button onClick={() => setSucesso(false)} className="ml-auto"><X className="w-4 h-4 text-green-400" /></button>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4 mb-6">
        <Select label="Loja Origem" required options={[{ value: '', label: 'Selecione...' }, ...lojas.map(l => ({ value: l.id, label: l.nome }))]} value={origemId} onChange={(e) => setOrigemId(e.target.value)} />
        <Select label="Loja Destino" required options={[{ value: '', label: 'Selecione...' }, ...lojas.filter(l => l.id !== origemId).map(l => ({ value: l.id, label: l.nome }))]} value={destinoId} onChange={(e) => setDestinoId(e.target.value)} />
      </div>

      {origemId && destinoId && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
            <div className="flex gap-2">
              <Input placeholder="Código QR" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && escanear()} />
              <Button variant="primary" onClick={escanear}><QrCode className="w-4 h-4" /></Button>
            </div>
            {erro && <p className="text-sm text-red-500 mt-2">{erro}</p>}
          </div>

          {itens.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <p className="font-semibold">Itens</p>
                <Badge variant="info">{itens.length}</Badge>
              </div>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {itens.map(i => (
                  <div key={i.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm">
                    <span>{i.nome}</span>
                    <button onClick={() => setItens(prev => prev.filter(x => x.id !== i.id))} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button variant="primary" className="w-full" onClick={criar} disabled={saving || itens.length === 0}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Criar Transferência ({itens.length} itens)
          </Button>
        </>
      )}
    </div>
  );
}
