'use client';

import Link from 'next/link';
import { QrCode } from 'lucide-react';

/** Placeholder até integrar Mercado Pago no servidor. */
export function PixCheckoutPlaceholder({ slug }: { slug: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#262626] p-6 space-y-4">
      <p className="text-sm text-zinc-400">
        Aqui será exibido o <strong className="text-zinc-200">PIX</strong> (QR + copia e cola) após a API do
        Mercado Pago. Por enquanto é só layout.
      </p>
      <div className="flex flex-col items-center gap-3 py-6 rounded-xl bg-zinc-900 border border-dashed border-zinc-700">
        <QrCode className="w-16 h-16 text-zinc-600" />
        <p className="text-xs text-zinc-500 text-center max-w-xs">
          Integração: `POST` interno cria pagamento → retorna `qr_code` / `copy_paste` → webhook confirma.
        </p>
      </div>
      <Link
        href={`/f/${slug}/pedido/demo-123`}
        className="block w-full text-center rounded-xl border border-zinc-600 text-zinc-200 text-sm py-3 hover:bg-zinc-800"
      >
        Simular pedido confirmado (demo)
      </Link>
    </div>
  );
}
