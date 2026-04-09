'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Printer, Loader2, ArrowLeft, Server } from 'lucide-react';
import Button from '@/components/ui/Button';
import { usePiPrintBridgeConfig } from '@/hooks/usePiPrintBridgeConfig';
import {
  FORMATO_CONFIG,
  FORMATO_IMPRESSAO_STORAGE_KEY,
  FormatoEtiqueta,
  gerarDocumentoHtmlEtiquetas,
  gerarEtiquetasDemonstracaoImpressao,
  imprimirEtiquetasEmJobUnico,
  obterFormatoImpressaoPadrao,
} from '@/lib/printing/label-print';
import { enviarHtmlParaPiPrintBridge } from '@/lib/printing/pi-print-ws-client';
import type { ImpressaoPiPapel } from '@/lib/services/config-impressao-pi';

function TesteImpressaoEtiquetaInner() {
  const searchParams = useSearchParams();
  const papelParam = searchParams.get('papel');
  const papel: ImpressaoPiPapel = papelParam === 'industria' ? 'industria' : 'estoque';

  const {
    loading: piCfgLoading,
    available: piPrintAvailable,
    connection: piConnection,
  } = usePiPrintBridgeConfig({ papel });
  const [formato, setFormato] = useState<FormatoEtiqueta>('60x30');
  const [abrindo, setAbrindo] = useState(false);
  const [avisoHttpsPi, setAvisoHttpsPi] = useState(false);

  useEffect(() => {
    if (papel === 'industria') {
      setFormato('60x60');
    } else {
      setFormato(obterFormatoImpressaoPadrao());
    }
  }, [papel]);

  useEffect(() => {
    if (!piConnection?.wsUrl) {
      setAvisoHttpsPi(false);
      return;
    }
    const u = piConnection.wsUrl.toLowerCase();
    setAvisoHttpsPi(window.location.protocol === 'https:' && u.startsWith('ws:'));
  }, [piConnection]);

  const gerarEImprimir = async () => {
    const amostras = gerarEtiquetasDemonstracaoImpressao(formato);
    setAbrindo(true);
    try {
      const ok = await imprimirEtiquetasEmJobUnico(amostras, formato);
      if (!ok) {
        alert('Não foi possível abrir a janela de impressão. Libere pop-ups e tente de novo.');
      }
    } finally {
      setAbrindo(false);
    }
  };

  const gerarEImprimirNoPi = async () => {
    if (!piPrintAvailable || !piConnection) {
      alert(
        'Configure a ponte no Supabase (wss:// via túnel) ou NEXT_PUBLIC_PI_PRINT_WS_URL. Veja docs/IMPRESSAO_PI_ACESSO_REMOTO.md e Configurações → Impressoras.'
      );
      return;
    }
    const amostras = gerarEtiquetasDemonstracaoImpressao(formato);
    setAbrindo(true);
    try {
      const html = await gerarDocumentoHtmlEtiquetas(amostras, formato);
      await enviarHtmlParaPiPrintBridge(html, {
        jobName: `teste-impressao-${formato}`,
        connection: piConnection,
        papel,
        formatoEtiquetaPdf: formato,
      });
      alert('Amostra enviada para impressão na estação (Raspberry / Zebra).');
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao imprimir na estação Pi');
    } finally {
      setAbrindo(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto">
      <Link
        href="/etiquetas"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-red-600 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Voltar para Etiquetas
      </Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
          <Printer className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Teste de impressão</h1>
          <p className="text-sm text-gray-500">Amostra fictícia — não altera o banco</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
          Ponte Pi: <strong>{papel === 'estoque' ? 'estoque (padrão)' : 'indústria'}</strong>. Para testar a segunda ponte, abra esta página com{' '}
          <code className="text-[11px]">?papel=industria</code> na URL.
        </p>

        <p className="text-sm text-gray-600">
          Mesma geração de HTML que <strong>Separar por Loja</strong> (60×30), <strong>Etiquetas</strong> (formato
          escolhido) e <strong>Produção</strong> (60×60 na indústria). Com ponte <strong>indústria</strong>, o formato
          inicial é <strong>60×60</strong>. A janela do navegador chama a impressão automaticamente.
        </p>

        <label className="block text-sm font-medium text-gray-700">Formato</label>
        <select
          value={formato}
          onChange={(e) => {
            const v = e.target.value as FormatoEtiqueta;
            setFormato(v);
            window.localStorage.setItem(FORMATO_IMPRESSAO_STORAGE_KEY, v);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          {(Object.keys(FORMATO_CONFIG) as FormatoEtiqueta[]).map((f) => (
            <option key={f} value={f}>
              {FORMATO_CONFIG[f].label}
            </option>
          ))}
        </select>

        <Button
          variant="primary"
          className="w-full"
          onClick={() => void gerarEImprimir()}
          disabled={abrindo}
        >
          {abrindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
          Gerar e abrir impressão
        </Button>

        <Button
          variant="outline"
          className="w-full border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:bg-emerald-100"
          onClick={() => void gerarEImprimirNoPi()}
          disabled={abrindo || piCfgLoading || !piPrintAvailable}
          title={
            piCfgLoading
              ? 'Carregando configuração…'
              : !piPrintAvailable
                ? 'config_impressao_pi no Supabase ou .env local'
                : 'Envia a mesma amostra para o Raspberry Pi (WebSocket → Zebra)'
          }
        >
          {abrindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Server className="w-4 h-4 mr-2" />}
          Imprimir na estação (Pi / Zebra)
        </Button>

        {!piCfgLoading && !piPrintAvailable && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Para <strong>Pi / Zebra</strong> a partir de qualquer lugar: túnel no Raspberry + URL{' '}
            <code className="text-[11px]">wss://…</code> em <code className="text-[11px]">config_impressao_pi</code> no
            Supabase (papel <code className="text-[11px]">{papel}</code>). Em LAN, pode usar{' '}
            <code className="text-[11px]">NEXT_PUBLIC_PI_PRINT_WS_URL</code> no <code className="text-[11px]">.env.local</code>.
            Guia: <code className="text-[11px]">docs/IMPRESSAO_PI_ACESSO_REMOTO.md</code>.
          </p>
        )}
        {avisoHttpsPi && (
          <p className="text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-3 py-2">
            Página em <strong>HTTPS</strong> com URL <strong>ws://</strong> — o navegador pode bloquear. Use{' '}
            <strong>http://localhost</strong> na mesma rede do Pi ou <strong>wss://</strong> no Raspberry.
          </p>
        )}

        <p className="text-xs text-gray-500">
          60×30: uma folha com <strong>dois</strong> QRs. 60×60: uma etiqueta por página (produção / indústria). Demais
          formatos: uma etiqueta por página.
        </p>
        <p className="text-xs text-amber-900/90 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          <strong>Térmica (Zebra etc.):</strong> na impressão, desative <strong>cabeçalhos e rodapés</strong>, margens
          mínimas e escala 100%. Calibre a mídia na impressora. Guia no projeto:{' '}
          <code className="text-[11px]">docs/IMPRESSAO_TERMICA_ZEBRA.md</code>.
        </p>
      </div>
    </div>
  );
}

export default function TesteImpressaoEtiquetaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-gray-500 gap-2">
          <Loader2 className="w-6 h-6 animate-spin" />
          Carregando…
        </div>
      }
    >
      <TesteImpressaoEtiquetaInner />
    </Suspense>
  );
}
