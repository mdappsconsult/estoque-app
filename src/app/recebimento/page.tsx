'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Store, Loader2, QrCode, CheckCircle, AlertTriangle, ShieldCheck, Users, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import QRScanner from '@/components/QRScanner';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { errMessage } from '@/lib/errMessage';
import {
  bipQrRecebimentoColaborativo,
  fecharRemessaRecebimentoColaborativo,
  receberTransferencia,
} from '@/lib/services/transferencias';
import {
  filtrarRecebimentoPorLoja,
  transferenciaDisponivelParaRecebimento,
} from '@/lib/operador-loja-scope';
import { supabase } from '@/lib/supabase';
import EnvioDiretoConferenciaCard from '@/components/recebimento/EnvioDiretoConferenciaCard';
import RecebimentoDiretoCard from '@/components/recebimento/RecebimentoDiretoCard';

interface TransRow {
  id: string;
  tipo: string;
  status: string;
  origem_id: string;
  destino_id: string;
  created_at: string;
  origem: { nome: string };
  destino: { nome: string };
  transferencia_itens?: { id: string }[];
  modo_bip_loja?: boolean;
  produto_demandado_id?: string | null;
  quantidade_demandada?: number | null;
  produto_demandado?: { nome: string } | { nome: string }[] | null;
}

interface ItemEsperado {
  id: string;
  token_qr: string;
  token_short: string | null;
  nome: string;
  /** Presente ao conferir mais de uma remessa na mesma sessão. */
  transferencia_id: string;
  recebido: boolean;
  recebido_em: string | null;
  recebedor_nome: string | null;
}

/** Formata HH:MM curto, fuso América/SP (auditor visual sob cada linha bipada). */
function horaCurtaBr(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    });
  } catch {
    return '';
  }
}

/** Ações sensíveis no recebimento (divergência ou confirmar tudo sem QR): só `ADMIN_MASTER`. */
function recebimentoSomenteAdminMaster(perfil: string | undefined): boolean {
  return perfil === 'ADMIN_MASTER';
}

export default function RecebimentoPage() {
  const { usuario } = useAuth();
  const adminRecebimento = recebimentoSomenteAdminMaster(usuario?.perfil);

  /** Uma remessa (`[id]`) ou várias no modo agrupado (`>= 2` ids). */
  const [remessasIdsConferencia, setRemessasIdsConferencia] = useState<string[]>([]);
  const [modoMultiRemessas, setModoMultiRemessas] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [mostrarEntradaManual, setMostrarEntradaManual] = useState(false);
  /**
   * Estado único do painel de conferência colaborativa: cada linha de `transferencia_itens` da(s)
   * remessa(s) selecionada(s), com `recebido` e auditor (`recebedor_nome`) já resolvido. Vem do
   * banco e é mantido em sincronia por `postgres_changes` em `transferencia_itens` — vários
   * funcionários da loja bipam em paralelo e a tela de todo mundo atualiza em segundos.
   */
  const [itensEsperados, setItensEsperados] = useState<ItemEsperado[]>([]);
  const [loadingEsperados, setLoadingEsperados] = useState(false);
  const [erro, setErro] = useState('');
  const [saving, setSaving] = useState(false);
  const [resultado, setResultado] = useState<{ divergencias: number } | null>(null);
  /** Aviso quando a remessa selecionada deixa de estar em trânsito (ex.: outro aparelho confirmou antes). */
  const [avisoRemessaEncerrada, setAvisoRemessaEncerrada] = useState<string | null>(null);
  const scanEmAndamentoRef = useRef(false);

  /** Só a loja: busca no PostgREST já filtrada por destino — evita truncar/paginar o quadro geral e perder remessas novas. */
  const filtrosDestinoLoja = useMemo(() => {
    if (usuario?.perfil === 'OPERATOR_STORE' && usuario.local_padrao_id) {
      return [{ column: 'destino_id' as const, value: usuario.local_padrao_id }];
    }
    return undefined;
  }, [usuario?.perfil, usuario?.local_padrao_id]);

  const consultaRecebimentoHabilitada =
    usuario != null &&
    (usuario.perfil !== 'OPERATOR_STORE' || Boolean(usuario.local_padrao_id));

  const { data: transferencias, loading } = useRealtimeQuery<TransRow>({
    table: 'transferencias',
    select:
      '*, origem:locais!origem_id(nome), destino:locais!destino_id(nome), transferencia_itens(id), produto_demandado:produtos!produto_demandado_id(nome)',
    orderBy: { column: 'created_at', ascending: false },
    filters: filtrosDestinoLoja,
    enabled: consultaRecebimentoHabilitada,
    /** Evita lista vazia em falha de refetch após sucesso (realtime), que apagava escaneios locais. */
    preserveDataOnRefetchError: true,
    preserveDataWhileRefetching: true,
  });

  const pendentes = filtrarRecebimentoPorLoja(
    transferencias.filter(transferenciaDisponivelParaRecebimento),
    usuario
  );

  const conferenciaAgrupadaAtiva = modoMultiRemessas && remessasIdsConferencia.length >= 2;
  const remessaUnicaId =
    !modoMultiRemessas && remessasIdsConferencia.length === 1 ? remessasIdsConferencia[0]! : null;
  const remessaSelecionada = useMemo(
    () => (remessaUnicaId ? transferencias.find((t) => t.id === remessaUnicaId) ?? null : null),
    [remessaUnicaId, transferencias]
  );
  const envioDiretoAtivo = Boolean(remessaSelecionada?.modo_bip_loja);
  const produtoDemandadoNome = useMemo(() => {
    const raw = remessaSelecionada?.produto_demandado;
    if (!raw) return 'Produto';
    if (Array.isArray(raw)) return raw[0]?.nome || 'Produto';
    return raw.nome || 'Produto';
  }, [remessaSelecionada]);
  const exigePainelConferencia = remessaUnicaId != null || conferenciaAgrupadaAtiva;

  /** Mínimo cadastrado para o produto na loja (compara com qty mandada — só relevante em envio direto). */
  const [demandaLojaProduto, setDemandaLojaProduto] = useState<{
    estoqueMinimo: number;
    estoqueAtual: number;
  } | null>(null);

  useEffect(() => {
    let ativo = true;
    setDemandaLojaProduto(null);
    if (!envioDiretoAtivo || !remessaSelecionada?.produto_demandado_id || !remessaSelecionada?.destino_id) {
      return;
    }
    const carregar = async () => {
      try {
        const [{ data: cfg }, { count }] = await Promise.all([
          supabase
            .from('loja_produtos_config')
            .select('estoque_minimo_loja')
            .eq('loja_id', remessaSelecionada.destino_id)
            .eq('produto_id', remessaSelecionada.produto_demandado_id!)
            .maybeSingle(),
          supabase
            .from('itens')
            .select('id', { count: 'exact', head: true })
            .eq('local_atual_id', remessaSelecionada.destino_id)
            .eq('produto_id', remessaSelecionada.produto_demandado_id!)
            .eq('estado', 'EM_ESTOQUE'),
        ]);
        if (!ativo) return;
        setDemandaLojaProduto({
          estoqueMinimo: Math.max(0, Math.floor(Number(cfg?.estoque_minimo_loja || 0))),
          estoqueAtual: count ?? 0,
        });
      } catch {
        if (ativo) setDemandaLojaProduto(null);
      }
    };
    void carregar();
    return () => {
      ativo = false;
    };
  }, [envioDiretoAtivo, remessaSelecionada?.produto_demandado_id, remessaSelecionada?.destino_id]);

  const alternarRemessaNoModoMulti = (id: string) => {
    const candidata = pendentes.find((p) => p.id === id);
    if (candidata?.modo_bip_loja) {
      setErro(
        'Envio direto da produção só pode ser conferido isoladamente (bipe os QRs nesta tela).'
      );
      return;
    }
    setRemessasIdsConferencia((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length === 0) {
        setErro('');
        return next;
      }
      const destinos = next
        .map((rid) => pendentes.find((p) => p.id === rid)?.destino_id)
        .filter((d): d is string => Boolean(d));
      if (new Set(destinos).size > 1) {
        setErro('Só é possível agrupar remessas com o mesmo destino (mesma loja de entrega).');
        return prev;
      }
      setErro('');
      return next;
    });
  };

  /** Só informativo: encerradas não entram no <Select>. Ex.: Silvania — dia 9 em divergência. */
  const encerradasRecentesNaLoja = useMemo(() => {
    if (usuario?.perfil !== 'OPERATOR_STORE' || !usuario.local_padrao_id) return [];
    const dias = 14;
    const lim = Date.now() - dias * 24 * 60 * 60 * 1000;
    return transferencias
      .filter(
        (t) =>
          t.destino_id === usuario.local_padrao_id &&
          (t.status === 'DIVERGENCE' || t.status === 'DELIVERED') &&
          new Date(t.created_at).getTime() >= lim
      )
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [transferencias, usuario]);

  useEffect(() => {
    if (remessasIdsConferencia.length === 0 || loading) return;
    for (const rid of remessasIdsConferencia) {
      const t = transferencias.find((x) => x.id === rid);
      if (!t) {
        setAvisoRemessaEncerrada(
          'Não encontramos uma das remessas na lista atual. Atualize a página ou selecione outra entrega.'
        );
        setRemessasIdsConferencia([]);
        setModoMultiRemessas(false);
        setErro('');
        return;
      }
      if (!transferenciaDisponivelParaRecebimento(t)) {
        const msg =
          t.status === 'DELIVERED'
            ? 'Uma das entregas já foi concluída por outro funcionário da loja. Cada bip já fica salvo no servidor — a página atualizou sozinha.'
            : t.status === 'DIVERGENCE'
              ? 'Uma das remessas foi encerrada com divergência (faltante ou excedente). Não é possível continuar o recebimento aqui. Veja a tela Divergências ou fale com o gestor.'
              : `Uma transferência não está mais disponível para recebimento (status: ${t.status}).`;
        setAvisoRemessaEncerrada(msg);
        setRemessasIdsConferencia([]);
        setModoMultiRemessas(false);
        setErro('');
        return;
      }
    }
  }, [remessasIdsConferencia, transferencias, loading]);

  useEffect(() => {
    const ok =
      (!modoMultiRemessas && remessasIdsConferencia.length === 1) ||
      (modoMultiRemessas && remessasIdsConferencia.length >= 2);
    if (!ok) {
      setItensEsperados([]);
      return;
    }
    if (envioDiretoAtivo) {
      setItensEsperados([]);
      return;
    }

    let cancelado = false;
    const idsSelecionados = [...remessasIdsConferencia];

    const carregar = async () => {
      setLoadingEsperados(true);
      try {
        const { data, error } = await supabase
          .from('transferencia_itens')
          .select(
            'transferencia_id, item_id, recebido, recebido_em, recebido_por_usuario_id, ' +
              'item:itens!item_id(id, token_qr, token_short, produto:produtos(nome)), ' +
              'recebedor:usuarios!recebido_por_usuario_id(nome)'
          )
          .in('transferencia_id', idsSelecionados);
        if (error) throw error;
        type ItemJoin = {
          id?: string;
          token_qr?: string;
          token_short?: string | null;
          produto?: { nome?: string } | { nome?: string }[] | null;
        };
        type RecebedorJoin = { nome?: string | null } | { nome?: string | null }[] | null;
        type TiRow = {
          transferencia_id: string;
          item_id: string;
          recebido: boolean | null;
          recebido_em: string | null;
          recebido_por_usuario_id: string | null;
          item: ItemJoin | ItemJoin[] | null;
          recebedor: RecebedorJoin;
        };
        const norm1 = <T,>(v: T | T[] | null | undefined): T | null => {
          if (v == null) return null;
          return Array.isArray(v) ? (v[0] ?? null) : v;
        };
        const linhas = ((data || []) as unknown as TiRow[])
          .map((row) => {
            const it = norm1(row.item);
            const rec = norm1(row.recebedor);
            return {
              id: it?.id || row.item_id,
              token_qr: it?.token_qr || '',
              token_short: it?.token_short || null,
              nome: norm1(it?.produto)?.nome || 'Produto',
              transferencia_id: String(row.transferencia_id || ''),
              recebido: Boolean(row.recebido),
              recebido_em: row.recebido_em || null,
              recebedor_nome: rec?.nome || null,
            } satisfies ItemEsperado;
          })
          .filter((linha) => Boolean(linha.id) && Boolean(linha.transferencia_id));
        if (!cancelado) setItensEsperados(linhas);
      } catch {
        if (!cancelado) setItensEsperados([]);
      } finally {
        if (!cancelado) setLoadingEsperados(false);
      }
    };

    void carregar();

    /**
     * Canal realtime sem filtro: aceita só `eq` no `postgres_changes`; usamos um único canal por
     * tabela e refeitchamos apenas quando o evento toca uma das remessas selecionadas.
     * Debounce curto evita refetch em rajadas (vários bips ao mesmo tempo).
     */
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const refetchDebounced = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => {
        debounce = null;
        void carregar();
      }, 200);
    };
    const idsSet = new Set(idsSelecionados);
    const channel = supabase
      .channel(`recebimento-itens-${idsSelecionados.join('-')}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'transferencia_itens' },
        (payload) => {
          const novo = (payload.new as { transferencia_id?: string } | null)?.transferencia_id;
          const velho = (payload.old as { transferencia_id?: string } | null)?.transferencia_id;
          if ((novo && idsSet.has(novo)) || (velho && idsSet.has(velho))) {
            refetchDebounced();
          }
        }
      )
      .subscribe();

    return () => {
      cancelado = true;
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, [remessasIdsConferencia, modoMultiRemessas, envioDiretoAtivo]);

  /** Linhas já bipadas (`recebido=true`) — derivado do realtime, é a verdade do servidor. */
  const idsEscaneados = useMemo(
    () => new Set(itensEsperados.filter((e) => e.recebido).map((e) => e.id)),
    [itensEsperados]
  );
  const totalRecebidos = idsEscaneados.size;

  const conferenciaCompleta = useMemo(() => {
    if (loadingEsperados || itensEsperados.length === 0) return false;
    return itensEsperados.every((e) => e.recebido);
  }, [loadingEsperados, itensEsperados]);

  const escanear = async (codigo?: string) => {
    const tk = (codigo || tokenInput).trim();
    if (!tk) return;
    if (scanEmAndamentoRef.current) return;
    if (!usuario) {
      setErro('Faça login novamente para continuar');
      return;
    }
    if (loadingEsperados) {
      setErro('Aguarde carregar os itens esperados da transferência');
      return;
    }
    if (envioDiretoAtivo) {
      setErro('Esta remessa é envio direto — bipe no painel próprio acima.');
      return;
    }

    /**
     * Em conferência agrupada, a remessa do QR é resolvida em duas etapas: 1) tenta achar nas linhas
     * já carregadas (pode falhar se a remessa for outra do mesmo dia); 2) se não achou, percorre as
     * remessas selecionadas e deixa o servidor recusar — a primeira que aceitar é a correta.
     */
    const linhaEsperada = itensEsperados.find(
      (e) => e.token_qr === tk || e.token_short === tk.toUpperCase()
    );
    const remessasAlvo = linhaEsperada
      ? [linhaEsperada.transferencia_id]
      : conferenciaAgrupadaAtiva
        ? [...remessasIdsConferencia]
        : remessaUnicaId
          ? [remessaUnicaId]
          : [];
    if (remessasAlvo.length === 0) {
      setErro('Selecione a remessa para bipar.');
      return;
    }
    const destinoBip = linhaEsperada
      ? pendentes.find((t) => t.id === linhaEsperada.transferencia_id)?.destino_id
      : pendentes.find((t) => t.id === remessasAlvo[0])?.destino_id;
    if (!destinoBip) {
      setErro('Não foi possível identificar a loja destino da remessa.');
      return;
    }

    scanEmAndamentoRef.current = true;
    setErro('');
    try {
      let ultimoErro: string | null = null;
      let sucesso = false;
      for (const tid of remessasAlvo) {
        try {
          await bipQrRecebimentoColaborativo({
            transferenciaId: tid,
            codigoQr: tk,
            localDestinoId: destinoBip,
            usuarioId: usuario.id,
          });
          sucesso = true;
          break;
        } catch (err: unknown) {
          ultimoErro = errMessage(err, 'Erro ao bipar o QR.');
          if (
            !ultimoErro.includes('não está nesta remessa') &&
            !ultimoErro.includes('Item não encontrado')
          ) {
            break;
          }
        }
      }
      if (!sucesso && ultimoErro) {
        setErro(ultimoErro);
        return;
      }
      setTokenInput('');
    } finally {
      scanEmAndamentoRef.current = false;
    }
  };

  const confirmarRecebimento = async () => {
    if (!usuario) {
      setErro('Faça login novamente para continuar');
      return;
    }
    if (!conferenciaCompleta) {
      setErro(
        'Bipe todos os QRs da lista antes de confirmar. Se faltar produto na entrega, peça ao administrador do sistema.'
      );
      return;
    }

    if (conferenciaAgrupadaAtiva) {
      const destinoIdPrim = pendentes.find((t) => t.id === remessasIdsConferencia[0])?.destino_id;
      if (
        !destinoIdPrim ||
        remessasIdsConferencia.some((rid) => pendentes.find((t) => t.id === rid)?.destino_id !== destinoIdPrim)
      ) {
        setErro('Remessas com destinos diferentes não podem ser confirmadas juntas.');
        return;
      }
      for (const rid of remessasIdsConferencia) {
        const tr = transferencias.find((t) => t.id === rid);
        if (!tr || !transferenciaDisponivelParaRecebimento(tr) || !pendentes.some((t) => t.id === rid)) {
          setErro('Uma das remessas não está mais disponível para recebimento. Atualize a lista.');
          return;
        }
      }

      const confirmou = window.confirm(
        `Confirmar recebimento completo de ${totalRecebidos} item(ns) em ${remessasIdsConferencia.length} remessa(s)? Cada uma será marcada como entregue.`
      );
      if (!confirmou) return;

      setSaving(true);
      setErro('');
      try {
        for (const tid of remessasIdsConferencia) {
          await fecharRemessaRecebimentoColaborativo(tid, destinoIdPrim, usuario.id);
        }
        setResultado({ divergencias: 0 });
        setRemessasIdsConferencia([]);
        setModoMultiRemessas(false);
      } catch (err: unknown) {
        setErro(errMessage(err, 'Erro ao confirmar recebimento'));
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!remessaUnicaId) {
      setErro(
        modoMultiRemessas
          ? 'Marque pelo menos duas remessas para conferir juntas, ou use «Voltar a conferir uma remessa por vez».'
          : 'Selecione uma remessa para receber'
      );
      return;
    }

    const transSelecionada = transferencias.find((t) => t.id === remessaUnicaId);
    if (!transSelecionada) {
      setErro('Transferência não encontrada. Atualize a página e tente novamente.');
      return;
    }
    if (!transferenciaDisponivelParaRecebimento(transSelecionada)) {
      setErro(
        transSelecionada.status === 'DELIVERED'
          ? 'Esta entrega já foi concluída por outro funcionário. A página atualizou sozinha — pode iniciar a próxima.'
          : transSelecionada.status === 'DIVERGENCE'
            ? 'Esta remessa já foi encerrada com divergência. Não é possível confirmar de novo por aqui.'
            : 'Esta remessa não está mais disponível para recebimento.'
      );
      return;
    }
    if (!pendentes.some((t) => t.id === remessaUnicaId)) {
      setErro('Esta transferência não está disponível para o seu usuário.');
      return;
    }
    const confirmou = window.confirm(
      `Confirmar recebimento completo de ${totalRecebidos} item(ns)? A remessa será marcada como entregue.`
    );
    if (!confirmou) return;

    setSaving(true);
    setErro('');
    try {
      await fecharRemessaRecebimentoColaborativo(
        remessaUnicaId,
        transSelecionada.destino_id,
        usuario.id
      );
      setResultado({ divergencias: 0 });
      setRemessasIdsConferencia([]);
    } catch (err: unknown) {
      setErro(errMessage(err, 'Erro ao confirmar recebimento'));
    } finally {
      setSaving(false);
    }
  };

  /** Mesmo efeito de «tudo escaneado», mas envia todos os `item_id` da remessa — só administrador (ex.: suporte remoto). */
  const confirmarRecebimentoInteiroSemEscanearAdmin = async () => {
    if (!usuario) {
      setErro('Faça login novamente para continuar');
      return;
    }
    if (!recebimentoSomenteAdminMaster(usuario.perfil)) {
      setErro('Somente administrador do sistema pode confirmar a entrega inteira sem escanear.');
      return;
    }
    if (conferenciaAgrupadaAtiva) {
      setErro(
        'Com várias remessas agrupadas, use apenas a conferência por QR até completar todos os itens. Desmarque o modo agrupado se precisar de «sem escanear» ou divergência em uma remessa só.'
      );
      return;
    }
    if (!remessaUnicaId) {
      setErro('Selecione uma remessa para receber');
      return;
    }
    if (loadingEsperados || itensEsperados.length === 0) {
      setErro('Aguarde carregar os itens esperados da transferência.');
      return;
    }
    if (conferenciaCompleta) {
      setErro('Todos os itens já constam como escaneados. Use «Confirmar recebimento (tudo escaneado)».');
      return;
    }

    const transSelecionada = transferencias.find((t) => t.id === remessaUnicaId);
    if (!transSelecionada) {
      setErro('Transferência não encontrada. Atualize a página e tente novamente.');
      return;
    }
    if (!transferenciaDisponivelParaRecebimento(transSelecionada)) {
      setErro(
        transSelecionada.status === 'DELIVERED'
          ? 'Esta entrega já foi concluída.'
          : transSelecionada.status === 'DIVERGENCE'
            ? 'Esta remessa já foi encerrada com divergência.'
            : 'Esta remessa não está mais disponível para recebimento.'
      );
      return;
    }
    if (!pendentes.some((t) => t.id === remessaUnicaId)) {
      setErro('Esta transferência não está disponível para o seu usuário.');
      return;
    }

    const n = itensEsperados.length;
    const destinoNome = transSelecionada.destino?.nome || 'loja de destino';
    const confirmou = window.confirm(
      `Administrador: confirmar ENTREGA COMPLETA de ${n} unidade(ns) para «${destinoNome}» SEM leitura de QR neste aparelho.\n\n` +
        `Todos os itens desta remessa serão registrados como recebidos e entrarão no estoque da loja, como se cada QR tivesse sido escaneado.\n\n` +
        `Só continue se a carga física corresponde à remessa. A operação fica vinculada ao seu usuário em auditoria.`
    );
    if (!confirmou) return;

    setSaving(true);
    setErro('');
    try {
      const idsTodos = itensEsperados.map((e) => e.id);
      const res = await receberTransferencia(
        remessaUnicaId,
        idsTodos,
        transSelecionada.destino_id,
        usuario.id
      );
      setResultado({ divergencias: res.divergencias.length });
      setRemessasIdsConferencia([]);
    } catch (err: unknown) {
      setErro(errMessage(err, 'Erro ao confirmar recebimento integral (administrador)'));
    } finally {
      setSaving(false);
    }
  };

  const encerrarComDivergencia = async () => {
    if (!usuario) {
      setErro('Faça login novamente para continuar');
      return;
    }
    if (!recebimentoSomenteAdminMaster(usuario.perfil)) {
      setErro('Somente administrador do sistema pode encerrar com divergência. Use o login de administrador neste aparelho ou peça a um administrador.');
      return;
    }
    if (conferenciaAgrupadaAtiva) {
      setErro(
        'Com várias remessas agrupadas, use apenas a conferência por QR até completar todos os itens. Desmarque o modo agrupado se precisar encerrar com divergência em uma remessa só.'
      );
      return;
    }
    if (!remessaUnicaId) {
      setErro('Selecione uma remessa para receber');
      return;
    }
    if (loadingEsperados || itensEsperados.length === 0) {
      setErro('Aguarde carregar os itens esperados da transferência.');
      return;
    }
    if (conferenciaCompleta) {
      setErro('Todos os itens já foram escaneados. Use «Confirmar recebimento».');
      return;
    }

    const transSelecionada = transferencias.find((t) => t.id === remessaUnicaId);
    if (!transSelecionada) {
      setErro('Transferência não encontrada. Atualize a página e tente novamente.');
      return;
    }
    if (!transferenciaDisponivelParaRecebimento(transSelecionada)) {
      setErro(
        transSelecionada.status === 'DELIVERED'
          ? 'Esta entrega já foi concluída.'
          : transSelecionada.status === 'DIVERGENCE'
            ? 'Esta remessa já foi encerrada com divergência.'
            : 'Esta remessa não está mais disponível para recebimento.'
      );
      return;
    }
    if (!pendentes.some((t) => t.id === remessaUnicaId)) {
      setErro('Esta transferência não está disponível para o seu usuário.');
      return;
    }

    const total = itensEsperados.length;
    const escaneados = totalRecebidos;
    const mensagemConfirm =
      escaneados === 0
        ? `Nenhum item foi bipado. A remessa tem ${total} unidade(s) — tudo será registrado como FALTANTE e a remessa ficará em DIVERGÊNCIA. Só use se realmente nada foi entregue. Continuar?`
        : `Foram bipados ${escaneados} de ${total} itens. O que faltar será registrado como divergência (faltante). A remessa será encerrada. Continuar?`;

    if (!window.confirm(mensagemConfirm)) return;

    setSaving(true);
    setErro('');
    try {
      const idsRecebidosBanco = itensEsperados.filter((e) => e.recebido).map((e) => e.id);
      const res = await receberTransferencia(
        remessaUnicaId,
        idsRecebidosBanco,
        transSelecionada.destino_id,
        usuario.id,
        { encerrarComDivergencia: true }
      );
      setResultado({ divergencias: res.divergencias.length });
      setRemessasIdsConferencia([]);
    } catch (err: unknown) {
      setErro(errMessage(err, 'Erro ao encerrar com divergência'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 text-red-500 animate-spin" /></div>;

  return (
    <div className="max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center"><Store className="w-5 h-5 text-green-600" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Receber Entrega</h1>
          <p className="text-sm text-gray-500">Conferência por QR</p>
        </div>
      </div>

      {usuario?.local_padrao_id && (usuario.perfil === 'OPERATOR_STORE' || usuario.perfil === 'MANAGER' || usuario.perfil === 'ADMIN_MASTER') && (
        <RecebimentoDiretoCard
          destinoId={usuario.local_padrao_id}
          destinoNome="sua loja"
          usuarioId={usuario.id}
        />
      )}

      {avisoRemessaEncerrada && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="font-semibold text-amber-900">Remessa atualizada</p>
            <p className="text-sm text-amber-800 mt-1">{avisoRemessaEncerrada}</p>
          </div>
          <button
            type="button"
            onClick={() => setAvisoRemessaEncerrada(null)}
            className="ml-auto shrink-0"
            aria-label="Fechar aviso"
          >
            <X className="w-4 h-4 text-amber-700" />
          </button>
        </div>
      )}

      {resultado && (
        <div className={`${resultado.divergencias > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'} border rounded-xl p-4 mb-6 flex items-center gap-3`}>
          {resultado.divergencias > 0 ? <AlertTriangle className="w-6 h-6 text-yellow-500" /> : <CheckCircle className="w-6 h-6 text-green-500" />}
          <div>
            <p className="font-semibold">{resultado.divergencias > 0 ? `${resultado.divergencias} divergência(s) registrada(s)` : 'Recebimento concluído!'}</p>
          </div>
          <button onClick={() => setResultado(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {encerradasRecentesNaLoja.length > 0 && usuario?.perfil === 'OPERATOR_STORE' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 mb-4 text-sm text-slate-800">
          <p className="font-semibold text-slate-900">Remessas já encerradas (últimos 14 dias)</p>
          <p className="mt-1 text-slate-700 leading-relaxed">
            O menu de remessas só lista envios <strong>ainda não recebidos</strong>. Por
            isso um pedido do dia pode «sumir» da lista se já foi <strong>recebido</strong> ou ficou com{' '}
            <strong>divergência</strong>.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-slate-700">
            {encerradasRecentesNaLoja.slice(0, 8).map((t) => (
              <li key={t.id}>
                {new Date(t.created_at).toLocaleString('pt-BR')} · {t.origem?.nome ?? '?'} →{' '}
                {t.destino?.nome ?? '?'} ·{' '}
                {t.status === 'DIVERGENCE' ? (
                  <span className="font-medium text-amber-800">Divergência</span>
                ) : (
                  <span className="font-medium text-green-800">Já recebida</span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-600">
            Em divergência, o ajuste costuma ser com o <strong>gestor</strong> (tela administrativa de divergências).
          </p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-3">
        {usuario?.perfil === 'OPERATOR_STORE' && usuario.local_padrao_id && (
          <p className="text-xs text-gray-600">
            Lista remessas da indústria para a sua loja (após <strong>Separar por Loja</strong>) e entregas loja→loja em
            trânsito. Só escaneie QRs que constam na remessa escolhida.
          </p>
        )}
        {pendentes.length >= 2 && (
          <div className="space-y-2">
            {!modoMultiRemessas ? (
              <Button
                type="button"
                variant="outline"
                className="w-full text-sm"
                onClick={() => {
                  setAvisoRemessaEncerrada(null);
                  setModoMultiRemessas(true);
                  setErro('');
                  setMostrarEntradaManual(false);
                  if (usuario?.perfil === 'OPERATOR_STORE') {
                    setRemessasIdsConferencia(pendentes.map((t) => t.id));
                  } else {
                    setRemessasIdsConferencia([]);
                  }
                }}
              >
                Conferir várias remessas juntas (carga misturada na loja)
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full text-sm"
                onClick={() => {
                  setAvisoRemessaEncerrada(null);
                  setModoMultiRemessas(false);
                  setRemessasIdsConferencia([]);
                  setErro('');
                  setMostrarEntradaManual(false);
                }}
              >
                Voltar a conferir uma remessa por vez
              </Button>
            )}
          </div>
        )}
        {modoMultiRemessas ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-2">
            <p className="text-sm font-medium text-gray-900">Remessas nesta conferência</p>
            <p className="text-xs text-gray-600">
              Marque as que chegaram misturadas e escaneie os QRs em qualquer ordem. Ao confirmar, cada remessa é
              encerrada com os itens dela.
            </p>
            {usuario?.perfil !== 'OPERATOR_STORE' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5">
                Agrupe só remessas com o <strong>mesmo destino</strong> (mesma loja).
              </p>
            )}
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {pendentes.map((t) => {
                const qtdItens = t.transferencia_itens?.length || 0;
                const data = new Date(t.created_at).toLocaleString('pt-BR');
                return (
                  <li key={t.id}>
                    <label className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-1 rounded border-gray-300"
                        checked={remessasIdsConferencia.includes(t.id)}
                        onChange={() => {
                          setAvisoRemessaEncerrada(null);
                          alternarRemessaNoModoMulti(t.id);
                          setMostrarEntradaManual(false);
                        }}
                      />
                      <span>
                        <span className="font-medium">{t.origem?.nome || '?'} → {t.destino?.nome || '?'}</span>
                        <span className="text-gray-500"> · {qtdItens} item(ns) · {data}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {modoMultiRemessas && remessasIdsConferencia.length < 2 && (
              <p className="text-xs text-gray-500">Marque pelo menos duas remessas para carregar a lista unificada.</p>
            )}
          </div>
        ) : (
          <Select
            label="Remessa para receber"
            options={[
              { value: '', label: 'Selecione...' },
              ...pendentes.map((t) => {
                const qtdItens = t.transferencia_itens?.length || 0;
                const data = new Date(t.created_at).toLocaleString('pt-BR');
                const envioDireto = Boolean(t.modo_bip_loja);
                const prodNomeRaw = t.produto_demandado;
                const prodNome = Array.isArray(prodNomeRaw)
                  ? prodNomeRaw[0]?.nome
                  : prodNomeRaw?.nome;
                const sufixo = envioDireto
                  ? ` (envio direto: ${t.quantidade_demandada ?? 0} ${prodNome || 'produto'})`
                  : ` • ${qtdItens} item(ns)`;
                return {
                  value: t.id,
                  label: `${t.origem?.nome || '?'} → ${t.destino?.nome || '?'}${sufixo} • ${data}`,
                };
              }),
            ]}
            value={remessaUnicaId ?? ''}
            onChange={(e) => {
              setAvisoRemessaEncerrada(null);
              const v = e.target.value;
              setRemessasIdsConferencia(v ? [v] : []);
              setErro('');
              setMostrarEntradaManual(false);
            }}
          />
        )}
      </div>

      {exigePainelConferencia && envioDiretoAtivo && remessaSelecionada && usuario && (
        <EnvioDiretoConferenciaCard
          transferenciaId={remessaSelecionada.id}
          destinoId={remessaSelecionada.destino_id}
          produtoNome={produtoDemandadoNome}
          produtoId={remessaSelecionada.produto_demandado_id || ''}
          quantidadeDemandada={remessaSelecionada.quantidade_demandada || 0}
          origemNome={remessaSelecionada.origem?.nome || '?'}
          destinoNome={remessaSelecionada.destino?.nome || '?'}
          usuarioId={usuario.id}
          podeEncerrarComFalta={
            usuario.perfil === 'OPERATOR_STORE' ||
            usuario.perfil === 'ADMIN_MASTER' ||
            usuario.perfil === 'MANAGER'
          }
          estoqueMinimoLoja={demandaLojaProduto?.estoqueMinimo}
          estoqueAtualLoja={demandaLojaProduto?.estoqueAtual}
          onConcluida={() => {
            setRemessasIdsConferencia([]);
            setResultado({ divergencias: 0 });
          }}
        />
      )}

      {exigePainelConferencia && !envioDiretoAtivo && (
        <>
          <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold text-gray-900">
                {conferenciaAgrupadaAtiva
                  ? `Itens esperados (${remessasIdsConferencia.length} remessas)`
                  : 'Itens esperados desta entrega'}
              </p>
              <div className="flex items-center gap-2">
                <Badge variant="info" size="sm">Total: {itensEsperados.length}</Badge>
                <Badge variant="success" size="sm">Bipados: {totalRecebidos}</Badge>
                <Badge variant="warning" size="sm">Faltando: {Math.max(itensEsperados.length - totalRecebidos, 0)}</Badge>
              </div>
            </div>
            <div className="flex items-start gap-2 text-xs text-blue-900 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-3">
              <Users className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                Vários funcionários da loja podem bipar ao mesmo tempo — cada QR lido aparece em todos
                os aparelhos na hora. Não precisa esperar um terminar.
                {adminRecebimento && (
                  <>
                    {' '}
                    Como administrador, você ainda pode <strong>confirmar a entrega inteira sem escanear</strong> ou{' '}
                    <strong>encerrar com divergência</strong> se faltar/sobrar produto.
                  </>
                )}
              </span>
            </div>
            {loadingEsperados ? (
              <div className="py-6 flex items-center justify-center text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Carregando itens esperados...
              </div>
            ) : itensEsperados.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {itensEsperados.map((item) => {
                  const escaneado = item.recebido;
                  const hora = horaCurtaBr(item.recebido_em);
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                        escaneado
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.nome}</p>
                        <p className="text-xs text-gray-400 font-mono">
                          {item.token_short || item.token_qr}
                        </p>
                        {escaneado && item.recebedor_nome && (
                          <p className="text-xs text-green-700 mt-0.5">
                            bipado por <strong>{item.recebedor_nome}</strong>
                            {hora ? ` às ${hora}` : ''}
                          </p>
                        )}
                      </div>
                      <Badge variant={escaneado ? 'success' : 'warning'} size="sm">
                        {escaneado ? 'Bipado' : 'Pendente'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Não foi possível carregar os itens da transferência.
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4 space-y-3">
            <label className="block text-sm font-medium text-gray-700">Escanear QR do item recebido</label>
            <QRScanner onScan={(code) => escanear(code)} label="Ativar leitor de QR (câmera)" />
            {!mostrarEntradaManual ? (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setMostrarEntradaManual(true)}
              >
                Não conseguiu ler? Digitar código
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Digite o código QR ou token curto"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && escanear()}
                  />
                  <Button variant="primary" onClick={() => escanear()}>
                    <QrCode className="w-4 h-4" />
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    setMostrarEntradaManual(false);
                    setTokenInput('');
                  }}
                >
                  Fechar digitação manual
                </Button>
              </div>
            )}
            {erro && <p className="text-sm text-red-500 mt-2">{erro}</p>}
          </div>

          <div className="space-y-2">
            <Button
              variant="primary"
              className="w-full"
              onClick={confirmarRecebimento}
              disabled={
                saving || loadingEsperados || itensEsperados.length === 0 || !conferenciaCompleta
              }
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              Confirmar recebimento (tudo escaneado)
            </Button>
            {adminRecebimento && !conferenciaCompleta && (
              <Button
                variant="secondary"
                className="w-full"
                onClick={confirmarRecebimentoInteiroSemEscanearAdmin}
                disabled={
                  saving || loadingEsperados || itensEsperados.length === 0 || conferenciaAgrupadaAtiva
                }
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <ShieldCheck className="w-4 h-4 mr-2" />
                )}
                Confirmar entrega inteira sem escanear (administrador)
              </Button>
            )}
            {adminRecebimento && (
              <Button
                variant="outline"
                className="w-full"
                onClick={encerrarComDivergencia}
                disabled={
                  saving ||
                  loadingEsperados ||
                  itensEsperados.length === 0 ||
                  conferenciaCompleta ||
                  conferenciaAgrupadaAtiva
                }
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Encerrar com divergência…
              </Button>
            )}
            {!loadingEsperados && itensEsperados.length > 0 && !conferenciaCompleta && adminRecebimento && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Faltam {itensEsperados.filter((e) => !idsEscaneados.has(e.id)).length} item(ns) na conferência por QR.
                Se a mercadoria <strong>chegou completa</strong>, use «Confirmar entrega inteira sem escanear». Se
                faltou ou sobrou de fato, use «Encerrar com divergência».
              </p>
            )}
            {!loadingEsperados && itensEsperados.length > 0 && !conferenciaCompleta && !adminRecebimento && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                Faltam {itensEsperados.filter((e) => !idsEscaneados.has(e.id)).length} item(ns) para confirmar o
                recebimento. Se a carga chegou mas não dá para escanear, ou se houve divergência, peça ao{' '}
                <strong>administrador do sistema</strong> para tratar nesta tela (confirmação sem QR ou divergência).
              </p>
            )}
          </div>
        </>
      )}

      {pendentes.length === 0 && !exigePainelConferencia && (
        <div className="text-center py-12 text-gray-400">
          <Store className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Nenhuma entrega para receber agora</p>
          {usuario?.perfil === 'OPERATOR_STORE' && usuario.local_padrao_id && (
            <>
              <p className="text-xs text-gray-500 mt-2 max-w-sm mx-auto">
                Só aparecem aqui pedidos com destino na <span className="font-medium">sua loja</span>{' '}
                (local padrão do seu usuário).
              </p>
              <p className="text-xs text-gray-600 mt-3 max-w-sm mx-auto bg-blue-50 border border-blue-200 rounded-lg p-3 text-left">
                <strong>Chegou balde de produção que ninguém separou?</strong> Peça à indústria para
                abrir um <strong>Envio direto da produção</strong> (escolhem loja + produto + quantidade
                lá na indústria). Assim que abrir, a remessa aparece aqui e você bipa cada QR.
              </p>
            </>
          )}
          {usuario?.perfil === 'OPERATOR_STORE' && !usuario.local_padrao_id && (
            <p className="text-xs text-amber-700 mt-2 max-w-xs mx-auto">
              Seu usuário não tem loja padrão cadastrada. Peça ao administrador para vincular sua loja em
              cadastro de usuários.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
