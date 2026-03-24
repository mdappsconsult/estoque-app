'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Loader2, RotateCcw, Save, AlertTriangle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import {
  clearPermissionMatrix,
  getDefaultRoutePermissions,
  getEffectiveRoutePermissions,
  PERFIS_COLUNA,
  ROUTE_UI_META,
  savePermissionMatrix,
  rotaEhPublicaOuWildcard,
} from '@/lib/permissions';

function agruparPorSecao() {
  const map = new Map<string, typeof ROUTE_UI_META>();
  for (const row of ROUTE_UI_META) {
    const list = map.get(row.section) || [];
    list.push(row);
    map.set(row.section, list);
  }
  return map;
}

export default function PermissoesPage() {
  const { usuario } = useAuth();
  const router = useRouter();
  const [matrix, setMatrix] = useState<Record<string, string[]>>(getDefaultRoutePermissions);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState<'salvo' | 'reset' | null>(null);

  useEffect(() => {
    setMatrix(getEffectiveRoutePermissions());
  }, []);

  const secoes = useMemo(() => agruparPorSecao(), []);

  const toggle = useCallback((path: string, perfil: string, checked: boolean) => {
    setMatrix((prev) => {
      if (rotaEhPublicaOuWildcard(path, prev)) return prev;
      if (perfil === 'ADMIN_MASTER' && (path === '/configuracoes/permissoes' || path === '/cadastros/usuarios')) {
        return prev;
      }
      const atual = [...(prev[path] || [])];
      if (checked) {
        if (!atual.includes(perfil)) atual.push(perfil);
      } else {
        const idx = atual.indexOf(perfil);
        if (idx >= 0) atual.splice(idx, 1);
      }
      return { ...prev, [path]: atual };
    });
  }, []);

  const salvar = async () => {
    setSaving(true);
    setMensagem(null);
    try {
      savePermissionMatrix(matrix);
      setMensagem('salvo');
      setTimeout(() => setMensagem(null), 4000);
    } finally {
      setSaving(false);
    }
  };

  const restaurarPadrao = () => {
    if (!window.confirm('Restaurar permissões padrão do sistema neste dispositivo?')) return;
    clearPermissionMatrix();
    setMatrix(getEffectiveRoutePermissions());
    setMensagem('reset');
    setTimeout(() => setMensagem(null), 4000);
  };

  if (!usuario) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Faça login para continuar.
      </div>
    );
  }

  if (usuario.perfil !== 'ADMIN_MASTER') {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <Shield className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">Acesso restrito</h1>
        <p className="text-gray-500 mb-6">Apenas o administrador pode alterar permissões por perfil.</p>
        <Button variant="primary" onClick={() => router.push('/')}>Voltar ao início</Button>
      </div>
    );
  }

  return (
    <div className="max-w-[1000px] mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Permissões por perfil</h1>
            <p className="text-sm text-gray-500">
              Defina quais perfis acessam cada tela. As alterações ficam salvas neste dispositivo e navegador.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={restaurarPadrao} disabled={saving}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Restaurar padrão
          </Button>
          <Button variant="primary" onClick={salvar} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex gap-3 mb-6">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-900">
          <p className="font-semibold">Administrador e cadastro de usuários</p>
          <p className="mt-1 text-amber-800">
            O perfil <strong>Administrador</strong> mantém acesso fixo a <strong>Permissões</strong> e{' '}
            <strong>Usuários</strong> para você não ficar bloqueado. Demais telas seguem a matriz abaixo.
          </p>
        </div>
      </div>

      {mensagem === 'salvo' && (
        <p className="text-sm text-green-600 mb-4">Permissões salvas. O menu atualiza automaticamente.</p>
      )}
      {mensagem === 'reset' && (
        <p className="text-sm text-green-600 mb-4">Padrão do sistema restaurado neste dispositivo.</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left py-3 px-4 font-semibold text-gray-700 w-[220px]">Tela / rota</th>
              {PERFIS_COLUNA.map((p) => (
                <th key={p.value} className="text-center py-3 px-2 font-semibold text-gray-700 whitespace-nowrap" title={p.label}>
                  <span className="hidden sm:inline">{p.label}</span>
                  <span className="sm:hidden">{p.short}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from(secoes.entries()).map(([section, rows]) => (
              <Fragment key={section}>
                <tr className="bg-gray-100">
                  <td colSpan={1 + PERFIS_COLUNA.length} className="py-2 px-4 text-xs font-bold text-gray-600 uppercase tracking-wide">
                    {section}
                  </td>
                </tr>
                {rows.map((row) => {
                  const roles = matrix[row.path] || [];
                  const isWildcard = rotaEhPublicaOuWildcard(row.path, matrix);
                  return (
                    <tr key={row.path} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-gray-900">{row.label}</div>
                        <div className="text-xs text-gray-400 font-mono">{row.path}</div>
                        {isWildcard && (
                          <div className="text-xs text-blue-600 mt-1">Público — todos os perfis</div>
                        )}
                      </td>
                      {PERFIS_COLUNA.map((p) => {
                        const adminLocked =
                          p.value === 'ADMIN_MASTER' &&
                          (row.path === '/configuracoes/permissoes' || row.path === '/cadastros/usuarios');
                        const disabled = isWildcard || adminLocked;
                        const checked =
                          adminLocked || roles.includes('*') || roles.includes(p.value);
                        return (
                          <td key={p.value} className="text-center py-2 px-1">
                            <input
                              type="checkbox"
                              className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-40"
                              checked={checked}
                              disabled={disabled}
                              onChange={(e) => toggle(row.path, p.value, e.target.checked)}
                              aria-label={`${row.label} — ${p.label}`}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-4">
        Dica: em outro computador ou navegador, salve de novo se precisar do mesmo comportamento; no futuro dá para
        sincronizar isso no Supabase.
      </p>
    </div>
  );
}
