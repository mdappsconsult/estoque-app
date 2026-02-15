'use client';

import { useState } from 'react';
import { ChevronDown, LogOut, FileText, Warehouse } from 'lucide-react';
import clsx from 'clsx';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 fixed top-0 left-64 right-0 z-10">
      {/* Info da Unidade */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
          <Warehouse className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h2 className="font-semibold text-gray-800">Controle de Estoque</h2>
        </div>
        <span className="px-3 py-1 bg-red-100 text-red-600 text-xs font-medium rounded-full">
          Local: Indústria
        </span>
      </div>

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-3 hover:bg-gray-50 rounded-lg px-3 py-2 transition-colors"
        >
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <span className="text-gray-600 font-semibold">G</span>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">Operador</p>
            <p className="text-xs text-gray-500">OPERATOR_WAREHOUSE</p>
          </div>
          <ChevronDown className={clsx(
            'w-4 h-4 text-gray-500 transition-transform',
            menuOpen && 'rotate-180'
          )} />
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <>
            <div 
              className="fixed inset-0 z-10" 
              onClick={() => setMenuOpen(false)} 
            />
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
              <button className="w-full flex items-center gap-3 px-4 py-2 text-gray-700 hover:bg-gray-50 transition-colors">
                <LogOut className="w-4 h-4" />
                <span>SAIR</span>
              </button>
              <div className="border-t border-gray-200 my-2" />
              <div className="px-4 py-2">
                <p className="text-sm text-gray-500">• Legal</p>
              </div>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
