'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { escopoValidadesPorPerfil } from '@/lib/operador-loja-scope';
import { DIAS_AVISO_VALIDADE_HOME, useValidadeAlert } from './ValidadeAlertProvider';

function chaveDismiss(usuarioId: string, nV: number, nP: number): string {
  return `validade.banner.dismiss.${usuarioId}.${nV}.${nP}`;
}

type BannerSeveridadeProps = {
  sigKey: string;
  isCritico: boolean;
  mensagem: string;
};

function BannerComFechar({ sigKey, isCritico, mensagem }: BannerSeveridadeProps) {
  const [fechado, setFechado] = useState(() => {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(sigKey) === '1';
  });

  const fechar = () => {
    sessionStorage.setItem(sigKey, '1');
    setFechado(true);
  };

  if (fechado) return null;

  return (
    <div
      role="region"
      aria-live={isCritico ? 'assertive' : 'polite'}
      aria-label="Alertas de validade"
      className={
        isCritico
          ? 'relative border-b border-red-200 bg-red-50 px-3 py-2 pr-10 text-sm text-red-900'
          : 'relative border-b border-amber-200 bg-amber-50 px-3 py-2 pr-10 text-sm text-amber-950'
      }
    >
      <p className="leading-snug">
        <span className="font-medium">{mensagem}</span>{' '}
        <Link
          href="/validades"
          className={
            isCritico
              ? 'font-semibold text-red-700 underline decoration-red-300 hover:text-red-900'
              : 'font-semibold text-amber-900 underline decoration-amber-400 hover:text-amber-950'
          }
        >
          Ver validades
        </Link>
      </p>
      <button
        type="button"
        onClick={fechar}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-current opacity-70 hover:opacity-100"
        aria-label="Fechar aviso"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Faixa fina abaixo do header: vencidos (crítico) ou a vencer em até N dias.
 * Fechar guarda em sessionStorage só para esta combinação de contagens (nova situação reabre).
 */
export function ValidadeBanner() {
  const { usuario } = useAuth();
  const escopo = useMemo(() => escopoValidadesPorPerfil(usuario), [usuario]);
  const { severidade, nVencidos, nProximos, loading, podeValidades, error } = useValidadeAlert();

  const sigKey =
    usuario?.id && (severidade === 'critico' || severidade === 'atencao')
      ? chaveDismiss(usuario.id, nVencidos, nProximos)
      : null;

  if (!podeValidades) {
    return null;
  }

  if (escopo.tipo === 'indisponivel' && escopo.mensagem) {
    return (
      <div
        role="region"
        aria-label="Validades"
        className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
      >
        <p className="leading-snug">{escopo.mensagem}</p>
      </div>
    );
  }

  if (loading) {
    return null;
  }

  if (error) {
    return (
      <div
        role="region"
        aria-label="Validades"
        className="border-b border-red-100 bg-red-50/80 px-3 py-2 text-xs text-red-800"
      >
        Não foi possível verificar validades.{' '}
        <Link href="/validades" className="font-medium underline">
          Abrir Validades
        </Link>
      </div>
    );
  }

  if (severidade === 'nenhum' || !sigKey) {
    return null;
  }

  const localFrase =
    escopo.tipo === 'local' && escopo.contexto === 'loja'
      ? 'na sua loja'
      : escopo.tipo === 'local' && escopo.contexto === 'industria'
        ? 'na matriz'
        : 'na rede';

  const isCritico = severidade === 'critico';
  const mensagem = isCritico
    ? `Há itens vencidos ${localFrase}.`
    : `Há itens que vencem em até ${DIAS_AVISO_VALIDADE_HOME} dias ${localFrase}.`;

  return <BannerComFechar key={sigKey} sigKey={sigKey} isCritico={isCritico} mensagem={mensagem} />;
}
