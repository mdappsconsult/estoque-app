import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMockFreezerBySlug } from '@/lib/quiosque/mock-catalog';
import { PixCheckoutPlaceholder } from '@/components/quiosque/PixCheckoutPlaceholder';

type Props = { params: Promise<{ slug: string }> };

export default async function PagamentoPage({ params }: Props) {
  const { slug } = await params;
  const freezer = getMockFreezerBySlug(slug);
  if (!freezer) notFound();

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 pb-24">
      <Link href={`/f/${slug}/carrinho`} className="text-sm text-blue-400 hover:text-blue-300 inline-block">
        ← Carrinho
      </Link>
      <h1 className="text-xl font-bold text-white">Pagamento</h1>
      <PixCheckoutPlaceholder slug={slug} />
    </div>
  );
}
