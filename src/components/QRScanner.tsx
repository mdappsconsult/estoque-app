'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, CameraOff, X } from 'lucide-react';
import Button from '@/components/ui/Button';

interface QRScannerProps {
  onScan: (code: string) => void;
  label?: string;
  autoOpen?: boolean;
}

export default function QRScanner({
  onScan,
  label = 'Escanear QR Code',
  autoOpen = false,
}: QRScannerProps) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const autoOpenAplicadoRef = useRef(false);

  const reactId = useId();
  const readerId = `qr-scanner-${reactId.replace(/:/g, '')}`;

  useEffect(() => {
    if (autoOpen && !autoOpenAplicadoRef.current) {
      setAberto(true);
      autoOpenAplicadoRef.current = true;
    }
  }, [autoOpen]);

  useEffect(() => {
    if (!aberto) return;

    let cancelado = false;
    const live = { current: null as import('html5-qrcode').Html5Qrcode | null };

    const parar = async () => {
      const sc = live.current;
      live.current = null;
      if (!sc) return;
      try {
        await sc.stop();
      } catch {
        /* ignore */
      }
      try {
        sc.clear();
      } catch {
        /* ignore */
      }
    };

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelado) return;

        const scanner = new Html5Qrcode(readerId, false);
        live.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            onScanRef.current(decodedText);
          },
          () => {}
        );
      } catch (err: unknown) {
        if (cancelado) return;
        console.error('QR Scanner error:', err);
        const msg = err instanceof Error ? err.message : '';
        setErro(
          msg.includes('NotAllowedError') || msg.includes('Permission')
            ? 'Permissão da câmera negada. Libere nas configurações do navegador.'
            : 'Não foi possível abrir a câmera. Verifique as permissões.'
        );
      }
    })();

    return () => {
      cancelado = true;
      void parar();
    };
  }, [aberto, readerId]);

  const fechar = () => {
    setAberto(false);
    setErro('');
  };

  if (!aberto) {
    return (
      <Button variant="secondary" onClick={() => setAberto(true)} className="w-full" type="button">
        <Camera className="w-4 h-4 mr-2" />
        {label}
      </Button>
    );
  }

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-gray-900">
        <span className="text-white text-sm font-medium">Câmera</span>
        <button type="button" onClick={fechar} className="text-white/70 hover:text-white" aria-label="Fechar câmera">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div id={readerId} className="w-full min-h-[200px]" />
      {erro && (
        <div className="p-4 bg-red-900/80 text-white text-sm text-center">
          <CameraOff className="w-5 h-5 mx-auto mb-1" />
          {erro}
        </div>
      )}
    </div>
  );
}
