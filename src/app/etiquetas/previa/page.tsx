'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Loader2, Printer } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  confirmarImpressao,
  FORMATO_CONFIG,
  gerarDocumentoHtmlEtiquetas,
  imprimirEtiquetasEmJobUnico,
  SESSION_STORAGE_PREVIA_ETIQUETAS_PREFIX,
  type PreviaEtiquetasSessionPayload,
} from '@/lib/printing/label-print';

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function PreviaEtiquetasInner() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

  const [payload, setPayload] = useState<PreviaEtiquetasSessionPayload | null>(null);
  const [erro, setErro] = useState('');
  const [htmlSrcDoc, setHtmlSrcDoc] = useState('');
  const [gerando, setGerando] = useState(false);
  const [imprimindo, setImprimindo] = useState(false);

  const [inputDe, setInputDe] = useState('1');
  const [inputAte, setInputAte] = useState('1');
  const [visualDe, setVisualDe] = useState(1);
  const [visualAte, setVisualAte] = useState(1);

  useEffect(() => {
    if (!id?.trim()) {
      setErro('Link inválido. Abra a prévia pela tela Etiquetas ou Produção.');
      setPayload(null);
      return;
    }
    const raw = sessionStorage.getItem(`${SESSION_STORAGE_PREVIA_ETIQUETAS_PREFIX}${id}`);
    if (!raw) {
      setErro(
        'Dados da prévia não encontrados (outra aba, sessão nova ou armazenamento limpo). Gere a prévia de novo na tela de origem.'
      );
      setPayload(null);
      return;
    }
    try {
      const p = JSON.parse(raw) as PreviaEtiquetasSessionPayload;
      if (!Array.isArray(p.etiquetas) || p.etiquetas.length === 0 || !p.formato) {
        throw new Error('incompleto');
      }
      setPayload(p);
      const n = p.etiquetas.length;
      setVisualDe(1);
      setVisualAte(n);
      setInputDe('1');
      setInputAte(String(n));
      setErro('');
    } catch {
      setErro('Não foi possível ler os dados da prévia.');
      setPayload(null);
    }
  }, [id]);

  useEffect(() => {
    if (!payload) return;
    let cancel = false;
    (async () => {
      setGerando(true);
      try {
        const slice = payload.etiquetas.slice(visualDe - 1, visualAte);
        const doc = await gerarDocumentoHtmlEtiquetas(slice, payload.formato, {
          ...payload.opcoesGerador,
          mostrarIndicesPrevia: true,
          indicePreviaInicio: visualDe,
        });
        if (!cancel) setHtmlSrcDoc(doc);
      } catch (e) {
        if (!cancel) setErro(e instanceof Error ? e.message : 'Falha ao montar a prévia');
      } finally {
        if (!cancel) setGerando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [payload, visualDe, visualAte]);

  const nTotal = payload?.etiquetas.length ?? 0;
  const labelFmt = payload ? FORMATO_CONFIG[payload.formato].label : '';
  const voltarHref = payload?.voltarPath?.trim() || '/etiquetas';

  const aplicarIntervaloNaPrevia = useCallback(() => {
    if (!payload || nTotal === 0) return;
    const d = clamp(parseInt(inputDe, 10) || 1, 1, nTotal);
    const a = clamp(parseInt(inputAte, 10) || nTotal, d, nTotal);
    setVisualDe(d);
    setVisualAte(a);
  }, [payload, nTotal, inputDe, inputAte]);

  const imprimirIntervaloNavegador = useCallback(async () => {
    if (!payload || nTotal === 0) return;
    const d = clamp(parseInt(inputDe, 10) || 1, 1, nTotal);
    const a = clamp(parseInt(inputAte, 10) || nTotal, d, nTotal);
    const slice = payload.etiquetas.slice(d - 1, a);
    if (slice.length === 0) return;
    if (!confirmarImpressao(slice.length, payload.formato)) return;
    setImprimindo(true);
    try {
      await imprimirEtiquetasEmJobUnico(slice, payload.formato, payload.opcoesGerador);
    } finally {
      setImprimindo(false);
    }
  }, [payload, nTotal, inputDe, inputAte]);

  if (!payload && erro) {
    return (
      <div className="max-w-lg mx-auto space-y-4 py-8 print:hidden">
        <p className="text-red-700">{erro}</p>
        <Link
          href="/etiquetas"
          className="inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
        >
          Ir para Etiquetas
        </Link>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex justify-center py-16 print:hidden">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" aria-hidden />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto flex flex-col gap-4 pb-8 print:hidden">
      <div className="rounded-xl border border-slate-200 bg-slate-900 text-slate-50 p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Link
              href={voltarHref}
              className="inline-flex items-center justify-center rounded-full bg-white/15 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/25"
            >
              Voltar
            </Link>
            <span className="text-sm font-medium">
              Prévia — {nTotal} etiqueta(s) total · {labelFmt}
            </span>
          </div>
          {gerando ? (
            <span className="inline-flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Gerando…
            </span>
          ) : null}
        </div>
        {payload.mensagemBarra ? (
          <p className="text-sm text-slate-200/95 leading-snug">{payload.mensagemBarra}</p>
        ) : null}
        {erro ? <p className="text-sm text-amber-200">{erro}</p> : null}

        <div className="rounded-lg bg-slate-800/80 p-3 space-y-2 border border-slate-600/60">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-200">
              Da etiqueta (nº)
              <input
                type="number"
                min={1}
                max={nTotal}
                value={inputDe}
                onChange={(e) => setInputDe(e.target.value)}
                className="w-24 rounded-md border border-slate-500 bg-slate-950 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-slate-200">
              Até (nº)
              <input
                type="number"
                min={1}
                max={nTotal}
                value={inputAte}
                onChange={(e) => setInputAte(e.target.value)}
                className="w-24 rounded-md border border-slate-500 bg-slate-950 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <Button type="button" variant="secondary" size="sm" onClick={aplicarIntervaloNaPrevia} disabled={gerando}>
              Atualizar prévia
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setInputDe('1');
                setInputAte(String(nTotal));
                setVisualDe(1);
                setVisualAte(nTotal);
              }}
              disabled={gerando}
            >
              Ver todas
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void imprimirIntervaloNavegador()}
              disabled={gerando || imprimindo}
            >
              {imprimindo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" aria-hidden />
                  Abrindo impressão…
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4 mr-2" aria-hidden />
                  Imprimir este intervalo
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 overflow-hidden bg-white min-h-[480px]">
        {htmlSrcDoc ? (
          <iframe
            title="Prévia de etiquetas"
            className="w-full min-h-[70vh] border-0"
            srcDoc={htmlSrcDoc}
          />
        ) : (
          <div className="flex items-center justify-center min-h-[40vh] text-gray-500 text-sm">Carregando prévia…</div>
        )}
      </div>
    </div>
  );
}

export default function PreviaEtiquetasPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 text-red-500 animate-spin" aria-hidden />
        </div>
      }
    >
      <PreviaEtiquetasInner />
    </Suspense>
  );
}
