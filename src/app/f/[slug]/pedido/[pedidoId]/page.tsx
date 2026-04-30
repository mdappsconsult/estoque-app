import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMockFreezerBySlug } from '@/lib/quiosque/mock-catalog';
import { CheckCircle2 } from 'lucide-react';

type Props = { params: Promise<{ slug: string; pedidoId: string }> };

export default async function PedidoConfirmacaoPage({ params }: Props) {
  const { slug, pedidoId } = await params;
  const freezer = getMockFreezerBySlug(slug);
  if (!freezer) notFound();

  return (
    <div className="p-4 max-w-lg mx-auto text-center space-y-6 pb-24">
      <div className="flex justify-center pt-4">
        <CheckCircle2 className="w-16 h-16 text-emerald-500" />
      </div>
      <div>
        <h1 className="text-xl font-bold text-white">Pedido registrado (demo)</h1>
        <p className="text-sm text-zinc-500 mt-2">
          Referência: <span className="text-zinc-300 font-mono">{pedidoId}</span>
        </p>
      </div>
      <p className="text-sm text-zinc-400">
        Quando o PIX estiver integrado, este passo mostrará status em tempo real (pago / pendente).
      </p>
      <Link
        href={`/f/${slug}`}
        className="inline-flex items-center justify-center rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3"
      >
        Voltar ao cardápio
      </Link>
    </div>
  );
}
