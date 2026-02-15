'use client';

import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, X } from 'lucide-react';
import Button from '@/components/ui/Button';

interface QRScannerProps {
  onScan: (code: string) => void;
  label?: string;
}

export default function QRScanner({ onScan, label = 'Escanear QR Code' }: QRScannerProps) {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState('');
  const scannerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;

    let scanner: any = null;

    const iniciar = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText: string) => {
            onScan(decodedText);
            // não fecha automático — permite escanear vários
          },
          () => {} // ignore errors durante scan
        );
      } catch (err: any) {
        console.error('QR Scanner error:', err);
        setErro(
          err?.message?.includes('NotAllowedError') || err?.message?.includes('Permission')
            ? 'Permissão da câmera negada. Libere nas configurações do navegador.'
            : 'Não foi possível abrir a câmera. Verifique as permissões.'
        );
      }
    };

    iniciar();

    return () => {
      if (scanner) {
        scanner.stop().catch(() => {});
        scanner.clear().catch(() => {});
      }
      scannerRef.current = null;
    };
  }, [aberto, onScan]);

  const fechar = () => {
    setAberto(false);
    setErro('');
  };

  if (!aberto) {
    return (
      <Button variant="secondary" onClick={() => setAberto(true)} className="w-full">
        <Camera className="w-4 h-4 mr-2" />
        {label}
      </Button>
    );
  }

  return (
    <div className="relative bg-black rounded-xl overflow-hidden">
      <div className="flex items-center justify-between p-3 bg-gray-900">
        <span className="text-white text-sm font-medium">📷 Câmera</span>
        <button onClick={fechar} className="text-white/70 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div id="qr-reader" ref={containerRef} className="w-full" />
      {erro && (
        <div className="p-4 bg-red-900/80 text-white text-sm text-center">
          <CameraOff className="w-5 h-5 mx-auto mb-1" />
          {erro}
        </div>
      )}
    </div>
  );
}
