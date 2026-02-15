'use client';

import { useState } from 'react';
import { AlertTriangle, Loader2, QrCode, CheckCircle, AlertCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useAuth } from '@/hooks/useAuth';
import { getItemByTokenQR, descartarItem, ItemCompleto } from '@/lib/services/itens';

const MOTIVOS = [
  { value: 'vencido', label: 'Produto vencido' },
  { value: 'danificado', label: 'Embalagem danificada' },
  { value: 'contaminado', label: 'Contaminação' },
  { value: 'temperatura', label: 'Quebra de temperatura' },
  { value: 'outro', label: 'Outro' },
];

export default function PerdasPage() {
  const { usuario } = useAuth();
  const [tokenInput, setTokenInput] = useState('');
  const [item, setItem] = useState<ItemCompleto | null>(null);
  const [motivo, setMotivo] = useState('vencido');
  const [motivoOutro, setMotivoOutro] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sucesso, setSucesso] = useState(false);
  const [erro, setErro] = useState('');

  const localId = usuario?.local_padrao_id;

  const buscar = async () => {
    if (!tokenInput.trim()) return;
    setBuscando(true);
    setItem(null);
    setErro('');
    setSucesso(false);
    try {
      const result = await getItemByTokenQR(tokenInput.trim());
      if (!result) { setErro('Item não encontrado'); return; }
      if (result.estado !== 'EM_ESTOQUE') { setErro(`Item está ${result.estado}`); return; }
      setItem(result);
    } catch { setErro('Erro ao buscar'); }
    finally { setBuscando(false); }
  };

  const descartar = async () => {
    if (!item || !usuario || !localId) return;
    setSaving(true);
    try {
      const motivoFinal = motivo === 'outro' ? motivoOutro : MOTIVOS.find(m => m.value === motivo)?.label || motivo;
      await descartarItem(item.id, motivoFinal, localId, usuario.id);
      setSucesso(true);
      setItem(null);
      setTokenInput('');
    } catch (err: any) {
      alert(err?.message || 'Erro');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-yellow-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Perdas / Descarte</h1>
          <p className="text-sm text-gray-500">Descartar item com motivo</p>
        </div>
      </div>

      {!localId && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-500" />
          <p className="text-sm text-yellow-700">Configure seu local padrão primeiro.</p>
        </div>
      )}

      {sucesso && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle className="w-6 h-6 text-green-500" />
          <p className="font-semibold text-green-800">Item descartado com sucesso</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Escanear QR</label>
        <div className="flex gap-2">
          <Input placeholder="Código QR" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} />
          <Button variant="primary" onClick={buscar} disabled={buscando}>
            {buscando ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
          </Button>
        </div>
        {erro && <p className="text-sm text-red-500 mt-2">{erro}</p>}
      </div>

      {item && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <p className="text-lg font-bold text-gray-900">{item.produto?.nome}</p>
            <p className="text-sm text-gray-400 font-mono">{item.token_qr}</p>
            {item.data_validade && <p className="text-sm text-gray-500 mt-1">Validade: {new Date(item.data_validade).toLocaleDateString('pt-BR')}</p>}
          </div>

          <Select label="Motivo do descarte" options={MOTIVOS} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          {motivo === 'outro' && (
            <Input label="Descreva o motivo" value={motivoOutro} onChange={(e) => setMotivoOutro(e.target.value)} required />
          )}

          <Button variant="primary" className="w-full bg-yellow-500 hover:bg-yellow-600" onClick={descartar} disabled={saving || (motivo === 'outro' && !motivoOutro)}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            Descartar Item
          </Button>
        </div>
      )}
    </div>
  );
}
