'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  Home, 
  QrCode, 
  PackagePlus,
  FileImage,
  ChefHat,
  FlaskConical,
  Truck,
  Store,
  Repeat2,
  ClipboardCheck,
  Archive,
  Search,
  AlertTriangle,
  Settings,
  ChevronDown
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { hasAccessWithMap } from '@/lib/permissions';
import { usuarioIndustriaSemConsultaEstoque } from '@/lib/printing/etiquetas-usuario-industria';
import { useEffectivePermissionsMap } from '@/hooks/useEffectivePermissionsMap';
import { LogoKim } from '@/components/branding/LogoKim';

const menuItems: { name: string; href: string; icon: LucideIcon; badge?: string }[] = [
  { name: 'Início', href: '/', icon: Home },
  { name: 'Scanner', href: '/qrcode', icon: QrCode },
  { name: 'Registrar Compra', href: '/entrada-compra', icon: PackagePlus },
  { name: 'Compra (foto NF)', href: '/entrada-compra-nota', icon: FileImage },
  { name: 'Produção', href: '/producao', icon: ChefHat },
  {
    name: 'Prévia saldo parcial',
    href: '/producao-previa-saldo-parcial',
    icon: FlaskConical,
    badge: 'demo',
  },
  { name: 'Separar por Loja', href: '/separar-por-loja', icon: Truck },
  { name: 'Viagem / Aceite', href: '/viagem-aceite', icon: Truck },
  { name: 'Receber Entrega', href: '/recebimento', icon: Store },
  { name: 'Transf. Loja → Loja', href: '/transferencia-loja', icon: Repeat2 },
  { name: 'Aceites Pendentes', href: '/aceites-pendentes', icon: ClipboardCheck },
  { name: 'Baixa Diária', href: '/baixa-diaria', icon: Archive },
  { name: 'Declarar estoque (loja)', href: '/contagem-loja', icon: ClipboardCheck },
  { name: 'Perdas', href: '/perdas', icon: AlertTriangle },
  { name: 'Estoque', href: '/estoque', icon: Archive },
  { name: 'Rastreio por QR', href: '/rastreio-qr', icon: Search },
];

const menuExpandable = [
  { 
    name: 'Configurações',
    icon: Settings,
    items: [
      // Admin / Gestão
      { name: 'Divergências', href: '/divergencias' },
      { name: 'Dashboard', href: '/dashboard-admin' },
      { name: 'Acompanhamento de viagens', href: '/acompanhamento-viagens' },
      { name: 'Relatório — Baldes', href: '/relatorios/baldes' },

      // Cadastros
      { name: 'Produtos', href: '/cadastros/produtos' },
      { name: 'Receitas de produção', href: '/cadastros/receitas-producao' },
      { name: 'Categorias', href: '/cadastros/categorias' },
      { name: 'Tipos de Embalagem', href: '/cadastros/embalagens' },
      { name: 'Reposição de estoque por loja', href: '/cadastros/reposicao-loja' },
      { name: 'Locais', href: '/cadastros/locais' },
      { name: 'Usuários', href: '/cadastros/usuarios' },

      // Preferências / sistema
      { name: 'Perfil', href: '/configuracoes/perfil' },
      { name: 'Impressoras (Pi)', href: '/configuracoes/impressoras' },
      { name: 'Permissões', href: '/configuracoes/permissoes' },
    ]
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<string[]>([]);
  const { usuario } = useAuth();
  const perfil = usuario?.perfil || '';
  const permissionsMap = useEffectivePermissionsMap();

  const filteredMenuItems = menuItems.filter((item) => {
    if (usuario && item.href === '/estoque' && usuarioIndustriaSemConsultaEstoque(usuario)) return false;
    return hasAccessWithMap(perfil, item.href, permissionsMap);
  });
  const filteredMenuExpandable = menuExpandable
    .map(section => ({
      ...section,
      items: section.items.filter(item => hasAccessWithMap(perfil, item.href, permissionsMap)),
    }))
    .filter(section => section.items.length > 0);

  const toggleExpand = (name: string) => {
    setExpanded(prev => 
      prev.includes(name) 
        ? prev.filter(n => n !== name) 
        : [...prev, name]
    );
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 h-screen flex flex-col fixed left-0 top-0">
      <div className="p-5 border-b border-gray-100">
        <LogoKim className="max-h-14 w-auto mx-auto mb-2" />
        <p className="text-xs text-center text-gray-500">Estoque · operações</p>
      </div>

      {/* Menu principal */}
      <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
        {filteredMenuItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                isActive 
                  ? 'bg-red-50 text-red-500' 
                  : 'text-gray-600 hover:bg-gray-50'
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.name}</span>
              {item.badge && (
                <span className="ml-auto text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}

        {/* Separador */}
        <div className="my-4 border-t border-gray-200" />

        {/* Menus expansíveis */}
        {filteredMenuExpandable.map((section) => {
          const isExpanded = expanded.includes(section.name);
          const hasActiveChild = section.items.some(item => pathname === item.href);
          
          return (
            <div key={section.name}>
              <button
                onClick={() => toggleExpand(section.name)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
                  hasActiveChild 
                    ? 'text-red-500' 
                    : 'text-gray-600 hover:bg-gray-50'
                )}
              >
                <section.icon className="w-5 h-5" />
                <span className="font-medium">{section.name}</span>
                <ChevronDown 
                  className={clsx(
                    'w-4 h-4 ml-auto transition-transform',
                    isExpanded && 'rotate-180'
                  )} 
                />
              </button>
              
              {isExpanded && (
                <div className="ml-12 space-y-1 mt-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.name}
                        href={item.href}
                        className={clsx(
                          'block px-4 py-2 rounded-lg transition-colors text-sm',
                          isActive 
                            ? 'text-red-500 bg-red-50' 
                            : 'text-gray-600 hover:bg-gray-50'
                        )}
                      >
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">
          © 2026 Controle de Estoque
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Todos os direitos reservados.
        </p>
      </div>
    </aside>
  );
}
