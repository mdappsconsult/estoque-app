'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Printer, Loader2, ArrowLeft } from 'lucide-react';
import Button from '@/components/ui/Button';
import {
  FORMATO_CONFIG,
  FORMATO_IMPRESSAO_STORAGE_KEY,
  FormatoEtiqueta,
  gerarEtiquetasDemonstracaoImpressao,
  imprimirEtiquetasEmJobUnico,
  obterFormatoImpressaoPadrao,
} from '@/lib/printing/label-print';

export default function TesteImpressaoEtiquetaPage() {
  const [formato, setFormato] = useState<FormatoEtiqueta>('60x30');
  const [abrindo, setAbrindo] = useState(false);

  useEffect(() => {
    setFormato(obterFormatoImpressaoPadrao());
  }, []);

  const gerarEImprimir = () => {
    const amostras = gerarEtiquetasDemonstracaoImpressao(formato);
    setAbrindo(true);
    try {
      const ok = imprimirEtiquetasEmJobUnico(amostras, formato);
      if (!ok) {
        alert('Não foi possível abrir a janela de impressão. Libere pop-ups e tente de novo.');
      }
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
        <p className="text-sm text-gray-600">
          Gera a mesma página de impressão usada em <strong>Separar por Loja</strong> e <strong>Etiquetas</strong>, com
          textos e QRs de exemplo. A janela abre e o navegador chama a impressão automaticamente — escolha sua impressora
          térmica e confira margens e tamanho do QR.
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

        <Button variant="primary" className="w-full" onClick={gerarEImprimir} disabled={abrindo}>
          {abrindo ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
          Gerar e abrir impressão
        </Button>

        <p className="text-xs text-gray-500">
          60×30: uma folha com <strong>dois</strong> QRs (linha pontilhada no meio). Formatos legados: uma etiqueta por
          página.
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
