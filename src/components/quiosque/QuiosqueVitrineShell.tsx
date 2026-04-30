'use client';

import Link from 'next/link';
import { LogoKim } from '@/components/branding/LogoKim';
import { ShoppingBag } from 'lucide-react';

type Props = {
  slug: string;
  tituloFreezer: string;
  children: React.ReactNode;
};

export function QuiosqueVitrineShell({ slug, tituloFreezer, children }: Props) {
  return (
    <div className="min-h-screen bg-[#1a1a1a] text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-[#212121]/95 backdrop-blur px-4 py-3 flex items-center gap-3">
        <Link href={`/f/${slug}`} className="flex items-center gap-2 shrink-0">
          <LogoKim className="max-h-10 w-auto" priority />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500">Quiosque</p>
          <p className="font-semibold text-sm truncate">{tituloFreezer}</p>
        </div>
        <Link
          href={`/f/${slug}/carrinho`}
          className="flex items-center gap-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-3 py-2 transition-colors"
        >
          <ShoppingBag className="w-4 h-4" />
          Carrinho
        </Link>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">
        Açaí do Kim · pagamento na próxima etapa (demo)
      </footer>
    </div>
  );
}
