import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  getMockFreezerBySlug,
  findProduto,
  formatBrlFromCentavos,
} from '@/lib/quiosque/mock-catalog';
import { ProdutoOpcoesClient } from '@/components/quiosque/ProdutoOpcoesClient';

type Props = { params: Promise<{ slug: string; itemId: string }> };

export default async function FreezerProdutoPage({ params }: Props) {
  const { slug, itemId } = await params;
  const freezer = getMockFreezerBySlug(slug);
  if (!freezer) notFound();
  const produto = findProduto(freezer, itemId);
  if (!produto) notFound();

  return (
    <div className="p-4 max-w-lg mx-auto pb-28">
      <Link
        href={`/f/${slug}`}
        className="text-sm text-blue-400 hover:text-blue-300 mb-4 inline-block"
      >
        ← Voltar ao cardápio
      </Link>

      <div className="relative aspect-[4/3] w-full max-h-56 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800">
        <Image
          src={produto.imagemSrc}
          alt={produto.nome}
          fill
          className="object-contain p-6"
          sizes="(max-width: 512px) 100vw, 512px"
          priority
        />
      </div>

      <h1 className="text-2xl font-bold text-white mt-4">{produto.nome}</h1>
      <p className="text-zinc-400 text-sm mt-2">{produto.descricao}</p>
      <p className="text-lg font-semibold text-blue-400 mt-3">
        A partir de {formatBrlFromCentavos(produto.precoCentavos)}
      </p>

      <ProdutoOpcoesClient slug={slug} produto={produto} />
    </div>
  );
}
