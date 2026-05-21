'use client';

import { useEffect, useState } from 'react';
import { Loader2, Save, Settings, ShieldX } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { errMessage } from '@/lib/errMessage';
import {
  listarPrazosConfig,
  PRAZOS_DEFAULT,
  PRIORIDADES,
  salvarPrazoConfig,
  type PrazoConfig,
  type PrazosConfigMap,
  type Prioridade,
} from '@/lib/services/protocolos';
import { PRIORIDADE_BOLA, PRIORIDADE_LABEL } from '@/lib/protocolos/ui-labels';

type FormMap = Record<Prioridade, { horas: string; dias: string }>;

function paraForm(prazos: PrazosConfigMap): FormMap {
  const out = {} as FormMap;
  for (const p of PRIORIDADES) {
    out[p] = {
      horas: String(prazos[p]?.horas_para_aceitar ?? PRAZOS_DEFAULT[p].horas_para_aceitar),
      dias: String(prazos[p]?.dias_para_fechar ?? PRAZOS_DEFAULT[p].dias_para_fechar),
    };
  }
  return out;
}

export default function PrazosProtocolosPage() {
  const { usuario } = useAuth();
  const ehAdmin = usuario?.perfil === 'ADMIN_MASTER';

  const [prazos, setPrazos] = useState<PrazosConfigMap>(PRAZOS_DEFAULT);
  const [form, setForm] = useState<FormMap>(paraForm(PRAZOS_DEFAULT));
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    listarPrazosConfig()
      .then((m) => {
        if (!ativo) return;
        setPrazos(m);
        setForm(paraForm(m));
      })
      .catch(() => {
        if (!ativo) return;
        setForm(paraForm(PRAZOS_DEFAULT));
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  if (!usuario) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!ehAdmin) {
    return (
      <div className="max-w-md mx-auto text-center py-12">
        <ShieldX className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-gray-500">Só o administrador master pode mudar prazos.</p>
      </div>
    );
  }

  const handleSalvar = async () => {
    setSalvando(true);
    try {
      const atualizado: PrazosConfigMap = { ...prazos };
      for (const p of PRIORIDADES) {
        const horas = Number(form[p].horas);
        const dias = Number(form[p].dias);
        if (!Number.isInteger(horas) || horas <= 0) {
          throw new Error(`Prazo «horas» de ${PRIORIDADE_LABEL[p]} precisa ser número inteiro maior que zero.`);
        }
        if (!Number.isInteger(dias) || dias <= 0) {
          throw new Error(`Prazo «dias» de ${PRIORIDADE_LABEL[p]} precisa ser número inteiro maior que zero.`);
        }
        const anterior = prazos[p];
        if (
          !anterior ||
          anterior.horas_para_aceitar !== horas ||
          anterior.dias_para_fechar !== dias
        ) {
          const novo: PrazoConfig = { horas_para_aceitar: horas, dias_para_fechar: dias };
          await salvarPrazoConfig(p, novo, usuario.id);
          atualizado[p] = novo;
        }
      }
      setPrazos(atualizado);
      alert('Prazos atualizados.');
    } catch (err) {
      alert(errMessage(err, 'Erro ao salvar'));
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6 text-red-500" />
          Prazos dos pedidos
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          <span className="font-medium">Horas p/ aceitar</span> = quanto tempo a secretaria tem
          para dar a primeira resposta. <span className="font-medium">Dias p/ fechar</span> =
          quanto tempo até o pedido ser encerrado por completo (contando do momento que foi
          aberto). Pedidos que passam desses limites aparecem na aba <b>Atrasados</b>.
        </p>
      </header>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr className="text-xs uppercase text-gray-500">
              <th className="text-left px-4 py-3">Prioridade</th>
              <th className="text-left px-4 py-3">Horas p/ aceitar</th>
              <th className="text-left px-4 py-3">Dias p/ fechar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {PRIORIDADES.map((p) => (
              <tr key={p}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-3 h-3 rounded-full ${PRIORIDADE_BOLA[p]}`} />
                    <span className="font-medium text-gray-800">{PRIORIDADE_LABEL[p]}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form[p].horas}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [p]: { ...prev[p], horas: e.target.value } }))
                    }
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    inputMode="numeric"
                    value={form[p].dias}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, [p]: { ...prev[p], dias: e.target.value } }))
                    }
                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button
        variant="primary"
        className="w-full text-base py-3"
        onClick={handleSalvar}
        disabled={salvando}
      >
        {salvando ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…
          </>
        ) : (
          <>
            <Save className="w-4 h-4 mr-2" /> Salvar prazos
          </>
        )}
      </Button>
    </div>
  );
}
