'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Factory, Loader2 } from 'lucide-react';
import Select from '@/components/ui/Select';
import CadastrosIndustriaDiaPainel from '@/components/cadastros/CadastrosIndustriaDiaPainel';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { Local } from '@/types/database';

export default function CadastrosIndustriaPage() {
  const { data: locais, loading } = useRealtimeQuery<Local>({
    table: 'locais',
    select: 'id, nome, tipo, status',
    orderBy: { column: 'nome', ascending: true },
  });

  const lojasAtivas = useMemo(
    () => locais.filter((l) => l.tipo === 'STORE' && l.status === 'ativo'),
    [locais]
  );

  const [filtroLojaId, setFiltroLojaId] = useState('');
  const nomeLojaFiltro = lojasAtivas.find((l) => l.id === filtroLojaId)?.nome ?? null;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
          <Factory className="w-5 h-5 text-violet-700" aria-hidden />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cadastros — Indústria</h1>
          <p className="text-sm text-gray-600 mt-1 leading-relaxed">
            O que foi registrado <strong>hoje</strong> no Supabase para as lojas (fuso deste aparelho). Para ver o que já
            foi <strong>enviado</strong> (baldes, unidades), use{' '}
            <Link href="/separar-por-loja" className="text-violet-700 font-semibold underline underline-offset-2">
              Separar por Loja
            </Link>
            .
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <Select
          label="Filtrar reposição por loja (opcional)"
          value={filtroLojaId}
          onChange={(e) => setFiltroLojaId(e.target.value)}
          options={[
            { value: '', label: 'Todas as lojas (até 120 linhas de reposição)' },
            ...lojasAtivas.map((l) => ({ value: l.id, label: l.nome })),
          ]}
        />
      </div>

      <CadastrosIndustriaDiaPainel lojaDestinoId={filtroLojaId || null} nomeLojaDestinoLabel={nomeLojaFiltro} />
    </div>
  );
}
