import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getMockFreezerBySlug, formatBrlFromCentavos } from '@/lib/quiosque/mock-catalog';

type Props = { params: Promise<{ slug: string }> };

export default async function FreezerHomePage({ params }: Props) {
  const { slug } = await params;
  const freezer = getMockFreezerBySlug(slug);
  if (!freezer) notFound();

  return (
    <div className="p-4 max-w-lg mx-auto space-y-6 pb-24">
      <div>
        <p className="text-zinc-400 text-sm">{freezer.localNome}</p>
        <h1 className="text-xl font-bold text-white mt-1">O que vamos pedir hoje?</h1>
      </div>

      {freezer.categorias
        .filter((c) => c.ativo)
        .sort((a, b) => a.ordem - b.ordem)
        .map((cat) => (
          <section key={cat.id} className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wide">{cat.nome}</h2>
            <ul className="space-y-3">
              {cat.produtos
                .sort((a, b) => a.ordem - b.ordem)
                .map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/f/${slug}/p/${p.id}`}
                      className="flex gap-3 rounded-2xl border border-zinc-800 bg-[#262626] p-3 hover:border-blue-600/50 transition-colors"
                    >
                      <div className="relative h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-zinc-900">
                        <Image src={p.imagemSrc} alt={p.nome} fill className="object-contain p-1" sizes="80px" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-white leading-snug">{p.nome}</p>
                        <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5">{p.descricaoCurta}</p>
                        <p className="text-sm font-semibold text-blue-400 mt-1">
                          {formatBrlFromCentavos(p.precoCentavos)}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
