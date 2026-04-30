import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMockFreezerBySlug, formatBrlFromCentavos } from '@/lib/quiosque/mock-catalog';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ item?: string }> };

export default async function CarrinhoPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const freezer = getMockFreezerBySlug(slug);
  if (!freezer) notFound();

  const itemNome = sp.item ? decodeURIComponent(sp.item) : 'Item (demo)';
  const precoDemo = 2350;

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 pb-24">
      <h1 className="text-xl font-bold text-white">Carrinho</h1>
      <p className="text-sm text-zinc-500">
        Resumo fixo para demo (sem persistência). Depois: linhas vindas do banco e sessão.
      </p>

      <ul className="rounded-2xl border border-zinc-800 divide-y divide-zinc-800 bg-[#262626]">
        <li className="p-4 flex justify-between gap-3">
          <div>
            <p className="font-medium text-white">{itemNome}</p>
            <p className="text-xs text-zinc-500 mt-1">1 unidade</p>
          </div>
          <p className="font-semibold text-blue-400 tabular-nums">{formatBrlFromCentavos(precoDemo)}</p>
        </li>
      </ul>

      <div className="flex justify-between text-sm text-zinc-400">
        <span>Subtotal</span>
        <span className="text-white font-medium tabular-nums">{formatBrlFromCentavos(precoDemo)}</span>
      </div>

      <div className="flex flex-col gap-3 pt-4">
        <Link
          href={`/f/${slug}/pagamento`}
          className="block w-full text-center rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-semibold py-3.5"
        >
          Ir para pagamento (PIX)
        </Link>
        <Link href={`/f/${slug}`} className="text-center text-sm text-zinc-500 hover:text-zinc-300">
          Continuar comprando
        </Link>
      </div>
    </div>
  );
}
