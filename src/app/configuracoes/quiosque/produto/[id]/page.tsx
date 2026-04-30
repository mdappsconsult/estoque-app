import { notFound } from 'next/navigation';
import { QuiosqueProdutoEditor } from '@/components/quiosque-admin/QuiosqueProdutoEditor';
import { findProdutoAdmin } from '@/lib/quiosque/mock-catalog';

type Props = { params: Promise<{ id: string }> };

export default async function ConfigQuiosqueProdutoPage({ params }: Props) {
  const { id } = await params;
  if (id === 'novo') {
    return <QuiosqueProdutoEditor mode="novo" />;
  }
  const data = findProdutoAdmin(id);
  if (!data) notFound();
  return <QuiosqueProdutoEditor mode="edit" freezer={data.freezer} produto={data.produto} />;
}
