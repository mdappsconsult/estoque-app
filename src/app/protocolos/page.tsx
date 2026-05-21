'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ClipboardList,
  Plus,
  MapPin,
  Camera,
  X,
  RefreshCw,
  AlertTriangle,
  Clock,
  Wrench,
  CheckCircle2,
  CheckCircle,
  XCircle,
  Send,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { supabase } from '@/lib/supabase';
import { errMessage } from '@/lib/errMessage';
import { getSenhaOperacionalSession } from '@/lib/auth';
import { useProtocoloAlert } from '@/components/protocolos/ProtocoloAlertProvider';
import PushBanner from '@/components/protocolos/PushBanner';
import { comprimirFotoProtocolo } from '@/lib/protocolos/foto-cliente';
import {
  STATUS_LABEL,
  STATUS_CHIP,
  PRIORIDADE_LABEL,
  PRIORIDADE_BOLA,
  PRIORIDADE_BOTAO_FORM,
  PRIORIDADE_BOTAO_FORM_ATIVO,
  formatarTempoDesde,
  formatarDataAmigavel,
} from '@/lib/protocolos/ui-labels';
import {
  aceitarProtocolo,
  abrirProtocolo,
  adicionarComentario,
  alterarPrioridade,
  eGestao,
  eOperador,
  eAtrasadoParaAceitar,
  eAtrasadoParaFechar,
  fecharProtocolo,
  iniciarExecucao,
  listarPrazosConfig,
  listarTimelineProtocolo,
  marcarConcluido,
  PRAZOS_DEFAULT,
  PRIORIDADES,
  recusarProtocolo,
  type PrazosConfigMap,
  type Prioridade,
  type ProtocoloComEmbed,
  type StatusProtocolo,
  type TimelineEntrada,
} from '@/lib/services/protocolos';
import type { Local } from '@/types/database';

type AbaGestao = 'aberto' | 'atrasados' | 'fechados' | 'recusados';

export default function ProtocolosPage() {
  const { usuario } = useAuth();
  const alerta = useProtocoloAlert();
  const ehGestao = usuario ? eGestao(usuario.perfil) : false;
  const ehOperador = usuario ? eOperador(usuario.perfil) : false;
  const podeAbrir = ehGestao || ehOperador;

  const { data: protocolos, loading, refetch } = useRealtimeQuery<ProtocoloComEmbed>({
    table: 'protocolos',
    select: `
      id, numero, titulo, descricao, local_id, prioridade, status, responsavel_externo,
      aberto_por, gerente_id, motivo_recusa, observacao_fechamento, foto_path, reaberto_de,
      created_at, aceito_em, iniciado_em, concluido_em, fechado_em,
      autor:usuarios!aberto_por(id, nome),
      gerente:usuarios!gerente_id(id, nome),
      local:locais(id, nome, tipo)
    `,
    orderBy: { column: 'created_at', ascending: false },
    enabled: !!usuario,
    preserveDataWhileRefetching: true,
    preserveDataOnRefetchError: true,
    refetchDebounceMs: 200,
  });

  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
    enabled: ehGestao,
  });

  const [prazos, setPrazos] = useState<PrazosConfigMap>(PRAZOS_DEFAULT);

  useEffect(() => {
    if (!usuario) return;
    listarPrazosConfig().then(setPrazos).catch(() => setPrazos(PRAZOS_DEFAULT));
  }, [usuario]);

  // Filtros da gestão
  const [aba, setAba] = useState<AbaGestao>('aberto');
  const [filtroLoja, setFiltroLoja] = useState<string>('');
  const [filtroPrioridade, setFiltroPrioridade] = useState<Prioridade | ''>('');
  const [busca, setBusca] = useState('');
  const [apenasMeus, setApenasMeus] = useState(false);
  const [mostrarHistoricoOperador, setMostrarHistoricoOperador] = useState(false);
  const [filtrosExpandidos, setFiltrosExpandidos] = useState(false);

  const meusProtocolos = useMemo(() => {
    if (!usuario || !ehOperador) return [];
    return protocolos.filter((p) => p.aberto_por === usuario.id);
  }, [protocolos, usuario, ehOperador]);

  const protocolosFiltrados = useMemo<ProtocoloComEmbed[]>(() => {
    if (!usuario) return [];
    if (ehOperador) {
      return meusProtocolos.filter((p) =>
        mostrarHistoricoOperador
          ? p.status === 'FECHADO' || p.status === 'RECUSADO'
          : p.status !== 'FECHADO' && p.status !== 'RECUSADO'
      );
    }
    let base = protocolos.slice();
    if (apenasMeus) base = base.filter((p) => p.aberto_por === usuario.id);
    if (filtroLoja) {
      base =
        filtroLoja === '__sem__'
          ? base.filter((p) => p.local_id == null)
          : base.filter((p) => p.local_id === filtroLoja);
    }
    if (filtroPrioridade) base = base.filter((p) => p.prioridade === filtroPrioridade);

    const buscaT = busca.trim().toLowerCase();
    if (buscaT) {
      base = base.filter((p) => {
        const numero = `#${p.numero}`;
        return (
          p.titulo.toLowerCase().includes(buscaT) ||
          p.descricao.toLowerCase().includes(buscaT) ||
          numero.includes(buscaT) ||
          (p.responsavel_externo || '').toLowerCase().includes(buscaT) ||
          (p.autor?.nome || '').toLowerCase().includes(buscaT)
        );
      });
    }

    if (aba === 'aberto') {
      base = base.filter((p) =>
        ['ABERTO', 'ACEITO', 'EM_EXECUCAO', 'CONCLUIDO'].includes(p.status)
      );
    } else if (aba === 'atrasados') {
      base = base.filter(
        (p) => eAtrasadoParaAceitar(p, prazos) || eAtrasadoParaFechar(p, prazos)
      );
    } else if (aba === 'fechados') {
      base = base.filter((p) => p.status === 'FECHADO');
    } else if (aba === 'recusados') {
      base = base.filter((p) => p.status === 'RECUSADO');
    }

    const ordem: Record<Prioridade, number> = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 };
    base.sort((a, b) => {
      const da = ordem[a.prioridade];
      const db = ordem[b.prioridade];
      if (da !== db) return da - db;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
    return base;
  }, [
    usuario,
    ehOperador,
    meusProtocolos,
    mostrarHistoricoOperador,
    protocolos,
    apenasMeus,
    filtroLoja,
    filtroPrioridade,
    busca,
    aba,
    prazos,
  ]);

  const contadorPendentesGestao = useMemo(() => {
    if (!ehGestao) return 0;
    return protocolos.filter((p) =>
      ['ABERTO', 'ACEITO', 'EM_EXECUCAO', 'CONCLUIDO'].includes(p.status)
    ).length;
  }, [ehGestao, protocolos]);

  const contadorAtrasados = useMemo(() => {
    if (!ehGestao) return 0;
    return protocolos.filter(
      (p) => eAtrasadoParaAceitar(p, prazos) || eAtrasadoParaFechar(p, prazos)
    ).length;
  }, [ehGestao, protocolos, prazos]);

  // Modais
  const [modalAbrir, setModalAbrir] = useState(false);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const aoConcluirAcao = useCallback(async () => {
    await Promise.all([refetch(), alerta.refetch?.()]);
  }, [refetch, alerta]);

  if (!usuario) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  if (!podeAbrir) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">Você não tem acesso aos protocolos.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <PushBanner />
      {/* Cabeçalho */}
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-red-500" />
            Pedidos
          </h1>
          {ehGestao ? (
            <p className="text-sm text-gray-500 mt-0.5">
              {contadorPendentesGestao === 0
                ? 'Nenhum pedido esperando você.'
                : `${contadorPendentesGestao} pedido${contadorPendentesGestao > 1 ? 's' : ''} esperando você`}
              {contadorAtrasados > 0 && (
                <span className="ml-2 text-red-600 font-semibold">
                  · {contadorAtrasados} atrasado{contadorAtrasados > 1 ? 's' : ''}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-0.5">Meus pedidos abertos</p>
          )}
        </div>
        {podeAbrir && (
          <button
            onClick={() => setModalAbrir(true)}
            className="px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-semibold inline-flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-5 h-5" /> Abrir pedido
          </button>
        )}
      </div>

      {/* Botão "+ Abrir pedido" gigante para operador */}
      {ehOperador && (
        <button
          onClick={() => setModalAbrir(true)}
          className="w-full mb-5 py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-semibold text-lg shadow-md inline-flex items-center justify-center gap-2"
        >
          <Plus className="w-6 h-6" /> Abrir um novo pedido
        </button>
      )}

      {/* Abas / filtros */}
      {ehGestao && (
        <>
          <div className="flex gap-2 mb-3 overflow-x-auto -mx-1 px-1 pb-1">
            {(
              [
                { id: 'aberto', label: 'Em aberto' },
                { id: 'atrasados', label: `Atrasados${contadorAtrasados ? ` (${contadorAtrasados})` : ''}` },
                { id: 'fechados', label: 'Encerrados' },
                { id: 'recusados', label: 'Recusados' },
              ] as { id: AbaGestao; label: string }[]
            ).map((a) => (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  aba === a.id
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>

          <details
            className="mb-4 rounded-xl border border-gray-200 bg-white"
            open={filtrosExpandidos}
            onToggle={(e) => setFiltrosExpandidos((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-gray-700 select-none flex items-center justify-between">
              <span>Filtrar e buscar</span>
              {filtrosExpandidos ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </summary>
            <div className="px-4 py-3 border-t border-gray-100 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <select
                  value={filtroLoja}
                  onChange={(e) => setFiltroLoja(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Todos os lugares</option>
                  <option value="__sem__">Administração / Geral</option>
                  {locais.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome}
                    </option>
                  ))}
                </select>
                <select
                  value={filtroPrioridade}
                  onChange={(e) =>
                    setFiltroPrioridade((e.target.value as Prioridade | '') || '')
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="">Qualquer prioridade</option>
                  {PRIORIDADES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORIDADE_LABEL[p]}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                placeholder="Buscar por título, número ou quem abriu…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={apenasMeus}
                  onChange={(e) => setApenasMeus(e.target.checked)}
                />
                Só os que eu abri
              </label>
            </div>
          </details>
        </>
      )}

      {/* Lista de cards */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-7 h-7 text-red-500 animate-spin" />
        </div>
      ) : protocolosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhum pedido por aqui.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {protocolosFiltrados.map((p) => (
            <CardProtocolo
              key={p.id}
              protocolo={p}
              ehGestao={ehGestao}
              usuarioId={usuario.id}
              prazos={prazos}
              onClickDetalhe={() => setDetalheId(p.id)}
              onAcaoConcluida={aoConcluirAcao}
            />
          ))}
        </div>
      )}

      {/* Toggle histórico operador */}
      {ehOperador && meusProtocolos.length > 0 && (
        <div className="mt-6 text-center">
          <button
            onClick={() => setMostrarHistoricoOperador((v) => !v)}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {mostrarHistoricoOperador ? '« Voltar para pedidos em aberto' : 'Ver pedidos antigos »'}
          </button>
        </div>
      )}

      {/* Modais */}
      {modalAbrir && (
        <ModalAbrirProtocolo
          isOpen={modalAbrir}
          onClose={() => setModalAbrir(false)}
          locais={locais}
          ehGestao={ehGestao}
          onCriou={async () => {
            setModalAbrir(false);
            await aoConcluirAcao();
          }}
        />
      )}
      {detalheId && (
        <ModalDetalheProtocolo
          isOpen={!!detalheId}
          onClose={() => setDetalheId(null)}
          protocoloId={detalheId}
          ehGestao={ehGestao}
          prazos={prazos}
          onAcaoConcluida={aoConcluirAcao}
        />
      )}
    </div>
  );
}

// ============================================================================
// Card
// ============================================================================

interface CardProtocoloProps {
  protocolo: ProtocoloComEmbed;
  ehGestao: boolean;
  usuarioId: string;
  prazos: PrazosConfigMap;
  onClickDetalhe: () => void;
  onAcaoConcluida: () => Promise<void> | void;
}

function IconeStatus({ status }: { status: StatusProtocolo }) {
  if (status === 'ABERTO') return <Clock className="w-4 h-4" />;
  if (status === 'ACEITO') return <CheckCircle2 className="w-4 h-4" />;
  if (status === 'EM_EXECUCAO') return <Wrench className="w-4 h-4" />;
  if (status === 'CONCLUIDO') return <CheckCircle2 className="w-4 h-4" />;
  if (status === 'FECHADO') return <CheckCircle className="w-4 h-4" />;
  return <XCircle className="w-4 h-4" />;
}

function CardProtocolo({
  protocolo: p,
  ehGestao,
  usuarioId,
  prazos,
  onClickDetalhe,
  onAcaoConcluida,
}: CardProtocoloProps) {
  const [agindo, setAgindo] = useState(false);
  const atrasadoAceitar = eAtrasadoParaAceitar(p, prazos);
  const atrasadoFechar = eAtrasadoParaFechar(p, prazos);
  const ehMeuPedido = p.aberto_por === usuarioId;

  const handleAceitar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Aceitar este pedido?')) return;
    setAgindo(true);
    try {
      await aceitarProtocolo(p.id, usuarioId);
      await onAcaoConcluida();
    } catch (err) {
      alert(errMessage(err, 'Erro ao aceitar'));
    } finally {
      setAgindo(false);
    }
  };

  const handleMarcarPronto = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Marcar este pedido como pronto?')) return;
    setAgindo(true);
    try {
      await marcarConcluido(p.id, usuarioId, ehGestao ? 'MANAGER' : 'OPERATOR_STORE');
      await onAcaoConcluida();
    } catch (err) {
      alert(errMessage(err, 'Erro ao marcar pronto'));
    } finally {
      setAgindo(false);
    }
  };

  const handleEncerrar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Encerrar este pedido?')) return;
    setAgindo(true);
    try {
      await fecharProtocolo(p.id, usuarioId, '');
      await onAcaoConcluida();
    } catch (err) {
      alert(errMessage(err, 'Erro ao encerrar'));
    } finally {
      setAgindo(false);
    }
  };

  const acaoPrincipal = (() => {
    if (!ehGestao) {
      // Operador (autor) só age em EM_EXECUCAO
      if (p.status === 'EM_EXECUCAO' && ehMeuPedido) {
        return (
          <button
            onClick={handleMarcarPronto}
            disabled={agindo}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold inline-flex items-center gap-1 disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" /> Ficou pronto
          </button>
        );
      }
      return null;
    }
    if (p.status === 'ABERTO') {
      return (
        <button
          onClick={handleAceitar}
          disabled={agindo}
          className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          Aceitar
        </button>
      );
    }
    if (p.status === 'EM_EXECUCAO') {
      return (
        <button
          onClick={handleMarcarPronto}
          disabled={agindo}
          className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          Marcar pronto
        </button>
      );
    }
    if (p.status === 'CONCLUIDO') {
      return (
        <button
          onClick={handleEncerrar}
          disabled={agindo}
          className="px-3 py-2 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
        >
          Encerrar
        </button>
      );
    }
    return null;
  })();

  const lugar = p.local?.nome || (p.local_id == null ? 'Administração' : '—');

  return (
    <button
      onClick={onClickDetalhe}
      className="w-full text-left bg-white rounded-xl border border-gray-200 hover:border-gray-300 p-4 shadow-sm transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`shrink-0 w-3 h-3 rounded-full ${PRIORIDADE_BOLA[p.prioridade]}`}
              aria-label={PRIORIDADE_LABEL[p.prioridade]}
            />
            <span className="text-xs text-gray-400 font-mono">#{p.numero}</span>
            {ehMeuPedido && ehGestao && (
              <span className="text-[10px] uppercase font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                Meu
              </span>
            )}
          </div>
          <p className="font-semibold text-gray-900 truncate">{p.titulo}</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {lugar}
            </span>
            <span>Aberto há {formatarTempoDesde(p.created_at)}</span>
            {ehGestao && p.autor?.nome && <span>por {p.autor.nome}</span>}
            {p.foto_path && (
              <span className="inline-flex items-center gap-1 text-gray-400">
                <ImageIcon className="w-3 h-3" /> foto
              </span>
            )}
          </div>
          {(atrasadoAceitar || atrasadoFechar) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {atrasadoAceitar && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> atrasado p/ aceitar
                </span>
              )}
              {atrasadoFechar && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
                  <AlertTriangle className="w-3 h-3" /> atrasado p/ fechar
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${STATUS_CHIP[p.status]}`}
          >
            <IconeStatus status={p.status} />
            {STATUS_LABEL[p.status]}
          </span>
          {acaoPrincipal}
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// Modal: Abrir protocolo
// ============================================================================

interface ModalAbrirProps {
  isOpen: boolean;
  onClose: () => void;
  locais: Local[];
  ehGestao: boolean;
  onCriou: () => void | Promise<void>;
}

function ModalAbrirProtocolo({ isOpen, onClose, locais, ehGestao, onCriou }: ModalAbrirProps) {
  const { usuario } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  // Operador NÃO escolhe prioridade (a secretaria define depois). Gestão pode escolher na hora.
  const [prioridade, setPrioridade] = useState<Prioridade>('MEDIA');
  const [localId, setLocalId] = useState<string>('');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const inputCameraRef = useRef<HTMLInputElement | null>(null);
  const inputGaleriaRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!usuario) return null;

  const trocarFoto = (file: File | null) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (file) {
      setArquivo(file);
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setArquivo(null);
      setPreviewUrl(null);
    }
    // Permite selecionar o mesmo arquivo de novo (`change` não dispara em mesma file).
    if (inputCameraRef.current) inputCameraRef.current.value = '';
    if (inputGaleriaRef.current) inputGaleriaRef.current.value = '';
  };

  const onInputArquivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    trocarFoto(e.target.files?.[0] || null);
  };

  const abrirCamera = () => {
    inputCameraRef.current?.click();
  };
  const abrirGaleria = () => {
    inputGaleriaRef.current?.click();
  };

  const handleEnviar = async () => {
    if (!titulo.trim()) {
      alert('Faltou contar o que aconteceu (resumo curto).');
      return;
    }
    if (titulo.length > 80) {
      alert('O resumo está muito longo. Deixe até 80 letras.');
      return;
    }
    if (!descricao.trim()) {
      alert('Conte com suas palavras o que rolou nos detalhes.');
      return;
    }

    setEnviando(true);
    try {
      let fotoPath: string | null = null;
      if (arquivo) {
        const loginOp = usuario.login_operacional?.trim() || '';
        if (!loginOp) {
          alert(
            'Para anexar foto, seu usuário precisa de login operacional. Cadastre em Cadastros → Usuários.'
          );
          setEnviando(false);
          return;
        }
        const senha = getSenhaOperacionalSession();
        if (!senha) {
          alert('Sessão expirada. Saia e entre de novo no sistema.');
          setEnviando(false);
          return;
        }

        const comprimida = await comprimirFotoProtocolo(arquivo);
        const res = await fetch('/api/operacional/upload-protocolo-foto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            login: loginOp,
            senha,
            imageBase64: comprimida.base64,
            mimeType: comprimida.mimeType,
          }),
        });
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          detalhe?: string;
          path?: string;
        };
        if (!res.ok || !body.path) {
          throw new Error(body.error || 'Não consegui enviar a foto agora, tenta de novo.');
        }
        fotoPath = body.path;
      }

      const localFinal = ehGestao ? (localId || null) : null;

      await abrirProtocolo({
        titulo: titulo.trim(),
        descricao: descricao.trim(),
        prioridade: ehGestao ? prioridade : undefined,
        local_id: localFinal,
        foto_path: fotoPath,
        aberto_por: usuario.id,
        perfil: usuario.perfil,
      });

      await onCriou();
    } catch (err) {
      alert(errMessage(err, 'Erro ao registrar o pedido'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Abrir um pedido" size="lg">
      <div className="p-5 space-y-4">
        {ehGestao && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Esse pedido é de qual lugar?
            </label>
            <select
              value={localId}
              onChange={(e) => setLocalId(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900"
            >
              <option value="">Administração / Geral</option>
              {locais.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </div>
        )}

        <Input
          label="Resumo curto"
          placeholder="Ex.: Ar condicionado parado na loja JK"
          value={titulo}
          maxLength={80}
          onChange={(e) => setTitulo(e.target.value)}
          required
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Detalhes do que aconteceu <span className="text-red-500">*</span>
          </label>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
            placeholder="Conte com suas palavras o que rolou"
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>

        {ehGestao ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">É urgente?</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRIORIDADES.map((p) => {
                const ativo = p === prioridade;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPrioridade(p)}
                    className={`px-3 py-3 border-2 rounded-xl text-sm font-semibold transition-colors ${
                      ativo ? PRIORIDADE_BOTAO_FORM_ATIVO[p] : PRIORIDADE_BOTAO_FORM[p]
                    }`}
                  >
                    {PRIORIDADE_LABEL[p]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            A secretaria vai ver seu pedido e dizer se é urgente.
          </p>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Tem foto? <span className="text-gray-400 font-normal">(opcional)</span>
          </label>

          <input
            ref={inputCameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={onInputArquivoChange}
          />
          <input
            ref={inputGaleriaRef}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={onInputArquivoChange}
          />

          {!previewUrl ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={abrirCamera}
                className="w-full py-4 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 inline-flex items-center justify-center gap-2 hover:border-red-400 hover:text-red-500 touch-manipulation"
              >
                <Camera className="w-5 h-5" /> Tirar foto
              </button>
              <button
                type="button"
                onClick={abrirGaleria}
                className="text-xs text-gray-500 underline w-full text-center py-1 touch-manipulation"
              >
                Escolher da galeria
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Foto"
                className="w-full max-h-72 object-contain rounded-xl border border-gray-200"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={abrirCamera}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-gray-700 text-sm inline-flex items-center justify-center gap-1 hover:bg-gray-50 touch-manipulation"
                >
                  <RefreshCw className="w-4 h-4" /> Outra foto
                </button>
                <button
                  type="button"
                  onClick={() => trocarFoto(null)}
                  className="flex-1 py-2 border border-red-300 text-red-600 rounded-lg text-sm inline-flex items-center justify-center gap-1 hover:bg-red-50 touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" /> Remover
                </button>
              </div>
            </div>
          )}
        </div>

        <Button
          variant="primary"
          className="w-full text-base py-3"
          onClick={handleEnviar}
          disabled={enviando}
        >
          {enviando ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Enviando…
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> Enviar pedido
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}

// ============================================================================
// Modal: Detalhe do protocolo
// ============================================================================

interface ModalDetalheProps {
  isOpen: boolean;
  onClose: () => void;
  protocoloId: string;
  ehGestao: boolean;
  prazos: PrazosConfigMap;
  onAcaoConcluida: () => Promise<void> | void;
}

function ModalDetalheProtocolo({
  isOpen,
  onClose,
  protocoloId,
  ehGestao,
  prazos,
  onAcaoConcluida,
}: ModalDetalheProps) {
  const { usuario } = useAuth();
  const [protocolo, setProtocolo] = useState<ProtocoloComEmbed | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntrada[]>([]);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [comentario, setComentario] = useState('');
  const [acaoEmAndamento, setAcaoEmAndamento] = useState(false);

  // Inputs auxiliares
  const [responsavel, setResponsavel] = useState('');
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [explicacaoRecusa, setExplicacaoRecusa] = useState('');
  const [observacaoFechar, setObservacaoFechar] = useState('');
  const [mostrarFormRecusa, setMostrarFormRecusa] = useState(false);
  const [mostrarFormIniciar, setMostrarFormIniciar] = useState(false);
  const [mostrarFormFechar, setMostrarFormFechar] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase
      .from('protocolos')
      .select(`
        id, numero, titulo, descricao, local_id, prioridade, status, responsavel_externo,
        aberto_por, gerente_id, motivo_recusa, observacao_fechamento, foto_path, reaberto_de,
        created_at, aceito_em, iniciado_em, concluido_em, fechado_em,
        autor:usuarios!aberto_por(id, nome),
        gerente:usuarios!gerente_id(id, nome),
        local:locais(id, nome, tipo)
      `)
      .eq('id', protocoloId)
      .maybeSingle();
    setProtocolo((data as unknown as ProtocoloComEmbed) || null);
    const t = await listarTimelineProtocolo(protocoloId).catch(() => []);
    setTimeline(t);
  }, [protocoloId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Realtime: recarrega o detalhe + timeline sempre que esse protocolo ou um comentário
  // dele muda no banco. Evita ter que dar F5 quando outro usuário aceita/comenta/encerra.
  useEffect(() => {
    let debounceId: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (debounceId) clearTimeout(debounceId);
      debounceId = setTimeout(() => {
        debounceId = null;
        void carregar();
      }, 250);
    };
    const channel = supabase
      .channel(`protocolo-detalhe-${protocoloId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'protocolos',
          filter: `id=eq.${protocoloId}`,
        },
        schedule
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'protocolo_comentarios',
          filter: `protocolo_id=eq.${protocoloId}`,
        },
        schedule
      )
      .subscribe();
    return () => {
      if (debounceId) clearTimeout(debounceId);
      supabase.removeChannel(channel);
    };
  }, [protocoloId, carregar]);

  useEffect(() => {
    if (!protocolo?.foto_path) {
      setFotoUrl(null);
      return;
    }
    let cancelado = false;
    fetch('/api/operacional/foto-protocolo-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: protocolo.foto_path }),
    })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { url?: string };
        if (!cancelado && j.url) setFotoUrl(j.url);
      })
      .catch(() => {});
    return () => {
      cancelado = true;
    };
  }, [protocolo?.foto_path]);

  if (!usuario || !protocolo) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Detalhe do pedido">
        <div className="p-6 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-red-500 animate-spin" />
        </div>
      </Modal>
    );
  }

  const p = protocolo;
  const ehAutor = p.aberto_por === usuario.id;
  const lugar = p.local?.nome || (p.local_id == null ? 'Administração' : '—');
  const atrasadoAceitar = eAtrasadoParaAceitar(p, prazos);
  const atrasadoFechar = eAtrasadoParaFechar(p, prazos);
  const podeComentar = p.status !== 'FECHADO' && p.status !== 'RECUSADO';

  const recarregar = async () => {
    await Promise.all([carregar(), onAcaoConcluida()]);
  };

  const onAceitar = async () => {
    if (!confirm('Aceitar este pedido?')) return;
    setAcaoEmAndamento(true);
    try {
      await aceitarProtocolo(p.id, usuario.id);
      await recarregar();
    } catch (err) {
      alert(errMessage(err, 'Erro ao aceitar'));
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  const onRecusarConfirmar = async () => {
    if (!motivoRecusa.trim() || !explicacaoRecusa.trim()) {
      alert('Preencha o motivo curto e a explicação para o operador.');
      return;
    }
    if (!confirm('Recusar este pedido?')) return;
    setAcaoEmAndamento(true);
    try {
      await recusarProtocolo(p.id, usuario.id, motivoRecusa.trim(), explicacaoRecusa.trim());
      setMostrarFormRecusa(false);
      setMotivoRecusa('');
      setExplicacaoRecusa('');
      await recarregar();
    } catch (err) {
      alert(errMessage(err, 'Erro ao recusar'));
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  const onIniciarConfirmar = async () => {
    if (!responsavel.trim()) {
      alert('Informe quem vai cuidar (nome do técnico/responsável).');
      return;
    }
    setAcaoEmAndamento(true);
    try {
      await iniciarExecucao(p.id, usuario.id, responsavel.trim());
      setMostrarFormIniciar(false);
      setResponsavel('');
      await recarregar();
    } catch (err) {
      alert(errMessage(err, 'Erro ao iniciar execução'));
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  const onMarcarPronto = async () => {
    if (!confirm('Marcar este pedido como pronto?')) return;
    setAcaoEmAndamento(true);
    try {
      await marcarConcluido(p.id, usuario.id, usuario.perfil);
      await recarregar();
    } catch (err) {
      alert(errMessage(err, 'Erro ao marcar pronto'));
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  const onEncerrarConfirmar = async () => {
    if (!confirm('Encerrar este pedido?')) return;
    setAcaoEmAndamento(true);
    try {
      await fecharProtocolo(p.id, usuario.id, observacaoFechar.trim());
      setMostrarFormFechar(false);
      setObservacaoFechar('');
      await recarregar();
    } catch (err) {
      alert(errMessage(err, 'Erro ao encerrar'));
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  const onEnviarComentario = async () => {
    const t = comentario.trim();
    if (!t) return;
    setAcaoEmAndamento(true);
    try {
      await adicionarComentario(p.id, usuario.id, t);
      setComentario('');
      await recarregar();
    } catch (err) {
      alert(errMessage(err, 'Erro ao comentar'));
    } finally {
      setAcaoEmAndamento(false);
    }
  };

  const acoesGestao = ehGestao && (
    <div className="space-y-2">
      {p.status === 'ABERTO' && (
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onAceitar}
            disabled={acaoEmAndamento}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold disabled:opacity-50"
          >
            Aceitar
          </button>
          <button
            onClick={() => setMostrarFormRecusa((v) => !v)}
            disabled={acaoEmAndamento}
            className="px-4 py-3 border-2 border-red-300 text-red-700 hover:bg-red-50 rounded-xl font-semibold disabled:opacity-50"
          >
            Recusar
          </button>
        </div>
      )}
      {mostrarFormRecusa && p.status === 'ABERTO' && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2">
          <Input
            label="Motivo curto"
            value={motivoRecusa}
            onChange={(e) => setMotivoRecusa(e.target.value)}
            placeholder="Ex.: Sem verba este mês"
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Explicação para quem abriu <span className="text-red-500">*</span>
            </label>
            <textarea
              value={explicacaoRecusa}
              onChange={(e) => setExplicacaoRecusa(e.target.value)}
              rows={3}
              placeholder="O operador vai ver este texto"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <Button
            variant="primary"
            className="w-full bg-red-600 hover:bg-red-700"
            onClick={onRecusarConfirmar}
            disabled={acaoEmAndamento}
          >
            Confirmar recusa
          </Button>
        </div>
      )}

      {p.status === 'ACEITO' && (
        <button
          onClick={() => setMostrarFormIniciar((v) => !v)}
          disabled={acaoEmAndamento}
          className="w-full px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold disabled:opacity-50"
        >
          Iniciar execução
        </button>
      )}
      {mostrarFormIniciar && p.status === 'ACEITO' && (
        <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl space-y-2">
          <Input
            label="Quem vai cuidar (técnico/responsável)"
            value={responsavel}
            onChange={(e) => setResponsavel(e.target.value)}
            placeholder="Ex.: Paulo (técnico de refrigeração)"
          />
          <Button
            variant="primary"
            className="w-full bg-purple-600 hover:bg-purple-700"
            onClick={onIniciarConfirmar}
            disabled={acaoEmAndamento}
          >
            Confirmar
          </Button>
        </div>
      )}

      {p.status === 'EM_EXECUCAO' && (
        <button
          onClick={onMarcarPronto}
          disabled={acaoEmAndamento}
          className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold disabled:opacity-50"
        >
          Marcar pronto
        </button>
      )}

      {p.status === 'CONCLUIDO' && (
        <button
          onClick={() => setMostrarFormFechar((v) => !v)}
          disabled={acaoEmAndamento}
          className="w-full px-4 py-3 bg-green-700 hover:bg-green-800 text-white rounded-xl font-semibold disabled:opacity-50"
        >
          Encerrar pedido
        </button>
      )}
      {mostrarFormFechar && p.status === 'CONCLUIDO' && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Alguma observação? (opcional)
            </label>
            <textarea
              value={observacaoFechar}
              onChange={(e) => setObservacaoFechar(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
          <Button
            variant="primary"
            className="w-full bg-green-700 hover:bg-green-800"
            onClick={onEncerrarConfirmar}
            disabled={acaoEmAndamento}
          >
            Confirmar encerramento
          </Button>
        </div>
      )}
    </div>
  );

  const acaoOperador = !ehGestao && ehAutor && p.status === 'EM_EXECUCAO' && (
    <button
      onClick={onMarcarPronto}
      disabled={acaoEmAndamento}
      className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold disabled:opacity-50"
    >
      Avisar que ficou pronto
    </button>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Pedido #${p.numero}`} size="xl">
      <div className="p-5 space-y-4">
        {fotoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={fotoUrl}
            alt="Foto do problema"
            className="w-full max-h-80 object-contain rounded-xl border border-gray-200 bg-gray-50"
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`shrink-0 w-3 h-3 rounded-full ${PRIORIDADE_BOLA[p.prioridade]}`}
            aria-label={PRIORIDADE_LABEL[p.prioridade]}
          />
          <span className="text-sm font-semibold text-gray-700">
            {PRIORIDADE_LABEL[p.prioridade]}
          </span>
          <span
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border ${STATUS_CHIP[p.status]}`}
          >
            <IconeStatus status={p.status} />
            {STATUS_LABEL[p.status]}
          </span>
          {atrasadoAceitar && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> atrasado p/ aceitar
            </span>
          )}
          {atrasadoFechar && (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase text-orange-700 bg-orange-100 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" /> atrasado p/ fechar
            </span>
          )}
        </div>

        {ehGestao && p.status !== 'FECHADO' && p.status !== 'RECUSADO' && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
            <label className="block text-xs font-semibold uppercase text-amber-800 mb-2">
              Definir urgência
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRIORIDADES.map((novaP) => {
                const ativo = novaP === p.prioridade;
                return (
                  <button
                    key={novaP}
                    type="button"
                    disabled={acaoEmAndamento || ativo}
                    onClick={async () => {
                      if (ativo) return;
                      if (!confirm(`Mudar urgência para «${PRIORIDADE_LABEL[novaP]}»?`)) return;
                      setAcaoEmAndamento(true);
                      try {
                        await alterarPrioridade(p.id, novaP, usuario.id, usuario.perfil);
                        await recarregar();
                      } catch (err) {
                        alert(errMessage(err, 'Erro ao mudar urgência'));
                      } finally {
                        setAcaoEmAndamento(false);
                      }
                    }}
                    className={`px-2 py-2 border-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-60 ${
                      ativo
                        ? PRIORIDADE_BOTAO_FORM_ATIVO[novaP]
                        : PRIORIDADE_BOTAO_FORM[novaP] + ' hover:opacity-80'
                    }`}
                  >
                    {PRIORIDADE_LABEL[novaP]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <h2 className="text-lg font-bold text-gray-900">{p.titulo}</h2>
        <p className="text-gray-700 whitespace-pre-wrap text-sm">{p.descricao}</p>

        <div className="text-xs text-gray-500 space-y-1">
          <p className="inline-flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {lugar}
          </p>
          <p>
            Aberto por <span className="font-medium">{p.autor?.nome || '—'}</span> em{' '}
            {formatarDataAmigavel(p.created_at)}
          </p>
          {p.gerente?.nome && (
            <p>
              Atendendo: <span className="font-medium">{p.gerente.nome}</span>
            </p>
          )}
          {p.responsavel_externo && (
            <p>
              Técnico/responsável:{' '}
              <span className="font-medium">{p.responsavel_externo}</span>
            </p>
          )}
        </div>

        {p.motivo_recusa && (
          <div className="bg-gray-100 border border-gray-200 rounded-xl p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-gray-500 mb-1">Motivo da recusa</p>
            <p className="text-gray-700">{p.motivo_recusa}</p>
          </div>
        )}
        {p.observacao_fechamento && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm">
            <p className="text-xs font-semibold uppercase text-green-700 mb-1">
              Observação ao encerrar
            </p>
            <p className="text-gray-700">{p.observacao_fechamento}</p>
          </div>
        )}

        {/* Ações */}
        {acoesGestao}
        {acaoOperador}

        {/* Timeline */}
        <div>
          <h3 className="text-sm font-semibold uppercase text-gray-500 mb-2">Histórico</h3>
          <div className="space-y-2">
            {timeline.length === 0 && (
              <p className="text-sm text-gray-400 italic">Sem registros ainda.</p>
            )}
            {timeline.map((t) => (
              <LinhaTimeline key={t.id} entrada={t} />
            ))}
          </div>
        </div>

        {/* Comentar */}
        {podeComentar && (
          <div className="border-t border-gray-100 pt-3">
            <div className="flex gap-2">
              <input
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void onEnviarComentario();
                  }
                }}
                placeholder="Comentar…"
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-900"
              />
              <button
                onClick={onEnviarComentario}
                disabled={acaoEmAndamento || !comentario.trim()}
                className="px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg disabled:opacity-50"
                aria-label="Enviar comentário"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="text-sm text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
          >
            <X className="w-4 h-4" /> Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LinhaTimeline({ entrada }: { entrada: TimelineEntrada }) {
  const t = entrada;
  let icone: React.ReactNode = <Clock className="w-4 h-4 text-gray-400" />;
  let texto = '';

  if (t.tipo === 'ABRIU') {
    icone = <Plus className="w-4 h-4 text-yellow-600" />;
    texto = `${t.usuario_nome || 'Alguém'} abriu o pedido`;
  } else if (t.tipo === 'ACEITOU') {
    icone = <CheckCircle2 className="w-4 h-4 text-blue-600" />;
    texto = `${t.usuario_nome || 'Secretaria'} aceitou`;
  } else if (t.tipo === 'RECUSOU') {
    icone = <XCircle className="w-4 h-4 text-gray-600" />;
    const motivo = (t.detalhes as { motivo?: string } | null)?.motivo;
    texto = `${t.usuario_nome || 'Secretaria'} recusou${motivo ? ` — ${motivo}` : ''}`;
  } else if (t.tipo === 'INICIOU') {
    icone = <Wrench className="w-4 h-4 text-purple-600" />;
    const resp = (t.detalhes as { responsavel?: string } | null)?.responsavel;
    texto = `${t.usuario_nome || 'Secretaria'} iniciou${resp ? ` com ${resp}` : ''}`;
  } else if (t.tipo === 'CONCLUIU') {
    icone = <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    texto = `${t.usuario_nome || 'Alguém'} marcou pronto`;
  } else if (t.tipo === 'FECHOU') {
    icone = <CheckCircle className="w-4 h-4 text-green-700" />;
    texto = `${t.usuario_nome || 'Secretaria'} encerrou`;
  } else if (t.tipo === 'MUDOU_PRIORIDADE') {
    icone = <AlertTriangle className="w-4 h-4 text-amber-600" />;
    const d = (t.detalhes as { de?: Prioridade; para?: Prioridade } | null) || {};
    const de = d.de ? PRIORIDADE_LABEL[d.de] : null;
    const para = d.para ? PRIORIDADE_LABEL[d.para] : null;
    texto = `${t.usuario_nome || 'Secretaria'} mudou a urgência${
      de && para ? ` de ${de} para ${para}` : para ? ` para ${para}` : ''
    }`;
  } else if (t.tipo === 'COMENTOU') {
    icone = <Send className="w-4 h-4 text-gray-500" />;
    texto = `${t.usuario_nome || 'Alguém'} comentou`;
  }

  return (
    <div className="flex gap-2 items-start">
      <div className="shrink-0 mt-0.5">{icone}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">
          {formatarDataAmigavel(t.em)} · {texto}
        </p>
        {t.texto && (
          <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">{t.texto}</p>
        )}
      </div>
    </div>
  );
}
