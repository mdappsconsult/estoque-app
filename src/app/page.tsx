'use client';

import {
  QrCode, PackageCheck, Truck, Archive, Boxes, AlertTriangle, BarChart3,
  ChefHat, Store, ClipboardCheck, Search, Timer, FileText, Settings, MapPin, Users
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

const features = [
  { title: 'Escanear QR', description: 'Ações por item.', icon: QrCode, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/qrcode' },
  { title: 'Entrada de Compra', description: 'Lote de compra + etiquetas.', icon: PackageCheck, iconBg: 'bg-green-100', iconColor: 'text-green-600', href: '/entrada-compra' },
  { title: 'Produção', description: 'Lote de produção + etiquetas.', icon: ChefHat, iconBg: 'bg-green-100', iconColor: 'text-green-600', href: '/producao' },
  { title: 'Etiquetas', description: 'Impressão de QR.', icon: QrCode, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', href: '/etiquetas' },
  { title: 'Separar por Loja', description: 'Warehouse → Store.', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/separar-por-loja' },
  { title: 'Viagem / Aceite', description: 'Aceite do motorista.', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/viagem-aceite' },
  { title: 'Receber Entrega', description: 'Conferência por QR.', icon: Store, iconBg: 'bg-green-100', iconColor: 'text-green-600', href: '/recebimento' },
  { title: 'Transf. Loja → Loja', description: 'Emergencial com aceite.', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/transferencia-loja' },
  { title: 'Aceites Pendentes', description: 'Aceitar/recusar.', icon: ClipboardCheck, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', href: '/aceites-pendentes' },
  { title: 'Baixa Diária', description: 'Baixa por QR.', icon: Archive, iconBg: 'bg-orange-100', iconColor: 'text-orange-600', href: '/baixa-diaria' },
  { title: 'Perdas / Descarte', description: 'Descarte com motivo.', icon: AlertTriangle, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', href: '/perdas' },
  { title: 'Contagem', description: 'Inventário por produto.', icon: ClipboardCheck, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', href: '/contagem' },
  { title: 'Estoque', description: 'Leitura atual.', icon: Boxes, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', href: '/estoque' },
  { title: 'Validades', description: 'Itens próximos do vencimento.', icon: Timer, iconBg: 'bg-red-100', iconColor: 'text-red-600', href: '/validades' },
  { title: 'Divergências', description: 'Pendências de envio.', icon: AlertTriangle, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', href: '/divergencias' },
  { title: 'Rastreio por QR', description: 'Linha do tempo.', icon: Search, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/rastreio-qr' },
  { title: 'Dashboard Admin', description: 'Visão gerencial.', icon: BarChart3, iconBg: 'bg-red-100', iconColor: 'text-red-600', href: '/dashboard-admin' },
  { title: 'Relatórios', description: 'Exportar dados.', icon: FileText, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', href: '/relatorios' },
  { title: 'Produtos', description: 'Cadastro.', icon: Boxes, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/produtos' },
  { title: 'Locais', description: 'Indústria e lojas.', icon: MapPin, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/locais' },
  { title: 'Usuários', description: 'Equipe e perfis.', icon: Users, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/usuarios' },
  { title: 'Configurações', description: 'Perfil e sistema.', icon: Settings, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/configuracoes/perfil' },
];

export default function Home() {
  const { usuario } = useAuth();

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {usuario ? `Olá, ${usuario.nome}` : 'Home'}
        </h1>
        <p className="text-gray-500 mt-1">Acesso rápido às operações do dia</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {features.map((f) => (
          <Link key={f.href} href={f.href} className="block">
            <Card className="flex flex-col h-full" hoverable>
              <CardHeader
                icon={<f.icon className={`w-7 h-7 ${f.iconColor}`} />}
                iconBg={f.iconBg}
              >
                <CardTitle>{f.title}</CardTitle>
                <CardDescription>{f.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
