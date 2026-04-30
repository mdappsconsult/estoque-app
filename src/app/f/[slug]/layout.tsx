import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { QuiosqueVitrineShell } from '@/components/quiosque/QuiosqueVitrineShell';
import { getMockFreezerBySlug } from '@/lib/quiosque/mock-catalog';

type Props = { children: React.ReactNode; params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const f = getMockFreezerBySlug(slug);
  return {
    title: f ? f.nomeExibicao : 'Quiosque',
    description: 'Peça seu açaí no freezer — Açaí do Kim',
  };
}

export default async function FreezerSlugLayout({ children, params }: Props) {
  const { slug } = await params;
  const freezer = getMockFreezerBySlug(slug);
  if (!freezer) notFound();

  return (
    <QuiosqueVitrineShell slug={slug} tituloFreezer={freezer.nomeExibicao}>
      {children}
    </QuiosqueVitrineShell>
  );
}
