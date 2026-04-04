'use client';

import {
  QrCode, PackageCheck, Truck, Archive, Boxes, AlertTriangle, BarChart3,
  ChefHat, Store, ClipboardCheck, Search, Timer, FileText, Settings, MapPin, Users, Shield, Printer
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { hasAccessWithMap } from '@/lib/permissions';
import { useEffectivePermissionsMap } from '@/hooks/useEffectivePermissionsMap';
import { PerfilUsuario } from '@/types/database';

type HomeFeature = {
  title: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  href: string;
};

type HomeSection = {
  title: string;
  items: string[];
};

const features: HomeFeature[] = [
  { title: 'Escanear QR', description: 'Ações por item.', icon: QrCode, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/qrcode' },
  { title: 'Registrar Compra', description: 'Registrar compra do dia (lote + etiquetas).', icon: PackageCheck, iconBg: 'bg-green-100', iconColor: 'text-green-600', href: '/entrada-compra' },
  { title: 'Produção', description: 'Lote de produção + etiquetas.', icon: ChefHat, iconBg: 'bg-green-100', iconColor: 'text-green-600', href: '/producao' },
  { title: 'Etiquetas', description: 'Impressão de QR.', icon: QrCode, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', href: '/etiquetas' },
  { title: 'Separar por Loja', description: 'Warehouse → Store.', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/separar-por-loja' },
  { title: 'Viagem / Aceite', description: 'Aceite do motorista.', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/viagem-aceite' },
  { title: 'Receber Entrega', description: 'Conferência por QR.', icon: Store, iconBg: 'bg-green-100', iconColor: 'text-green-600', href: '/recebimento' },
  { title: 'Transf. Loja → Loja', description: 'Emergencial com aceite.', icon: Truck, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/transferencia-loja' },
  { title: 'Aceites Pendentes', description: 'Aceitar/recusar.', icon: ClipboardCheck, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', href: '/aceites-pendentes' },
  { title: 'Baixa Diária', description: 'Baixa por QR.', icon: Archive, iconBg: 'bg-orange-100', iconColor: 'text-orange-600', href: '/baixa-diaria' },
  { title: 'Declarar estoque na loja', description: 'Informe quantas unidades você tem de cada produto.', icon: ClipboardCheck, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', href: '/contagem-loja' },
  { title: 'Perdas / Descarte', description: 'Descarte com motivo.', icon: AlertTriangle, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', href: '/perdas' },
  { title: 'Contagem', description: 'Inventário por produto.', icon: ClipboardCheck, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', href: '/contagem' },
  { title: 'Estoque', description: 'Leitura atual.', icon: Boxes, iconBg: 'bg-purple-100', iconColor: 'text-purple-600', href: '/estoque' },
  { title: 'Validades', description: 'Itens próximos do vencimento.', icon: Timer, iconBg: 'bg-red-100', iconColor: 'text-red-600', href: '/validades' },
  { title: 'Divergências', description: 'Pendências de envio.', icon: AlertTriangle, iconBg: 'bg-yellow-100', iconColor: 'text-yellow-600', href: '/divergencias' },
  { title: 'Rastreio por QR', description: 'Linha do tempo.', icon: Search, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/rastreio-qr' },
  { title: 'Dashboard Admin', description: 'Visão gerencial.', icon: BarChart3, iconBg: 'bg-red-100', iconColor: 'text-red-600', href: '/dashboard-admin' },
  { title: 'Relatórios', description: 'Exportar dados.', icon: FileText, iconBg: 'bg-indigo-100', iconColor: 'text-indigo-600', href: '/relatorios' },
  { title: 'Produtos', description: 'Cadastro.', icon: Boxes, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/produtos' },
  { title: 'Tipos de Embalagem', description: 'Caixa, balde, pote etc.', icon: Boxes, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/embalagens' },
  { title: 'Reposição de estoque por loja', description: 'Mínimos por loja (só produtos de escopo loja).', icon: Store, iconBg: 'bg-blue-100', iconColor: 'text-blue-600', href: '/cadastros/reposicao-loja' },
  { title: 'Locais', description: 'Indústria e lojas.', icon: MapPin, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/locais' },
  { title: 'Usuários', description: 'Equipe e perfis.', icon: Users, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/cadastros/usuarios' },
  { title: 'Configurações', description: 'Perfil e sistema.', icon: Settings, iconBg: 'bg-gray-100', iconColor: 'text-gray-700', href: '/configuracoes/perfil' },
  { title: 'Impressoras (Pi)', description: 'Ponte estoque e indústria.', icon: Printer, iconBg: 'bg-emerald-50', iconColor: 'text-emerald-700', href: '/configuracoes/impressoras' },
  { title: 'Permissões', description: 'Quem acessa cada tela (admin).', icon: Shield, iconBg: 'bg-red-50', iconColor: 'text-red-600', href: '/configuracoes/permissoes' },
];

const featuresByHref = Object.fromEntries(
  features.map((f) => [f.href, f])
) as Record<string, HomeFeature>;

const homeSectionsByProfile: Partial<Record<PerfilUsuario, HomeSection[]>> = {
  ADMIN_MASTER: [
    {
      title: 'Operação do Dia',
      items: [
        '/qrcode',
        '/entrada-compra',
        '/producao',
        '/etiquetas',
        '/separar-por-loja',
        '/viagem-aceite',
        '/aceites-pendentes',
        '/recebimento',
      ],
    },
    {
      title: 'Controle e Gestão',
      items: ['/estoque', '/validades', '/divergencias', '/dashboard-admin', '/relatorios'],
    },
    {
      title: 'Configuração',
      items: ['/cadastros/produtos', '/cadastros/categorias', '/cadastros/embalagens', '/cadastros/reposicao-loja', '/cadastros/locais', '/cadastros/usuarios', '/configuracoes/perfil', '/configuracoes/impressoras', '/configuracoes/permissoes'],
    },
  ],
  MANAGER: [
    {
      title: 'Operação do Dia',
      items: [
        '/entrada-compra',
        '/producao',
        '/etiquetas',
        '/separar-por-loja',
        '/viagem-aceite',
        '/aceites-pendentes',
        '/recebimento',
        '/qrcode',
      ],
    },
    {
      title: 'Acompanhamento',
      items: ['/estoque', '/validades', '/perdas', '/relatorios'],
    },
    {
      title: 'Cadastros',
      items: ['/cadastros/produtos', '/cadastros/categorias', '/cadastros/embalagens', '/cadastros/reposicao-loja', '/cadastros/locais', '/configuracoes/perfil', '/configuracoes/impressoras'],
    },
  ],
  OPERATOR_WAREHOUSE: [
    {
      title: 'Operação',
      items: ['/entrada-compra', '/producao', '/etiquetas', '/separar-por-loja', '/qrcode'],
    },
    {
      title: 'Transporte',
      items: ['/viagem-aceite', '/aceites-pendentes'],
    },
    {
      title: 'Conferência',
      items: ['/estoque', '/validades', '/perdas', '/baixa-diaria'],
    },
  ],
  OPERATOR_WAREHOUSE_DRIVER: [
    {
      title: 'Operação',
      items: ['/entrada-compra', '/producao', '/etiquetas', '/separar-por-loja', '/qrcode'],
    },
    {
      title: 'Transporte',
      items: ['/viagem-aceite', '/aceites-pendentes', '/recebimento'],
    },
  ],
  OPERATOR_STORE: [
    {
      title: 'Operação da Loja',
      items: ['/recebimento', '/transferencia-loja', '/aceites-pendentes', '/contagem-loja', '/qrcode'],
    },
    {
      title: 'Conferência',
      items: ['/estoque', '/validades', '/baixa-diaria', '/perdas'],
    },
  ],
  DRIVER: [
    {
      title: 'Transporte',
      items: ['/viagem-aceite', '/aceites-pendentes'],
    },
    {
      title: 'Conferência',
      items: ['/qrcode', '/configuracoes/perfil'],
    },
  ],
};

const defaultSections: HomeSection[] = [
  {
    title: 'Acesso Rápido',
    items: ['/qrcode', '/estoque', '/configuracoes/perfil'],
  },
];

export default function Home() {
  const { usuario } = useAuth();
  const permissionsMap = useEffectivePermissionsMap();
  const sections = usuario
    ? homeSectionsByProfile[usuario.perfil] ?? defaultSections
    : defaultSections;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {usuario ? `Olá, ${usuario.nome}` : 'Home'}
        </h1>
        <p className="text-gray-500 mt-1">Navegação organizada por prioridade de trabalho</p>
      </div>

      <div className="space-y-8">
        {sections.map((section) => {
          const sectionFeatures = section.items
            .map((href) => featuresByHref[href])
            .filter(Boolean)
            .filter((f) => (usuario ? hasAccessWithMap(usuario.perfil, f.href, permissionsMap) : true));

          if (sectionFeatures.length === 0) return null;

          return (
            <section key={section.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 mb-3">
                {section.title}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {sectionFeatures.map((f) => (
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
            </section>
          );
        })}
      </div>
    </div>
  );
}
