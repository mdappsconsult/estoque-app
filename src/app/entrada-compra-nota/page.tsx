'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FileImage,
  Loader2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  UserPlus,
  Camera,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { useRealtimeQuery } from '@/hooks/useRealtimeQuery';
import { useAuth } from '@/hooks/useAuth';
import { criarLoteCompra } from '@/lib/services/lotes-compra';
import { supabase } from '@/lib/supabase';
import { Produto, Local } from '@/types/database';
import { errMessage } from '@/lib/errMessage';
import { getSenhaOperacionalSession } from '@/lib/auth';
import {
  avaliarQualidadeImagemNota,
  fileToDataUrl,
  dataUrlToBase64AndMime,
} from '@/lib/nota-compra/qualidade-imagem';
import { sugerirProdutoId } from '@/lib/nota-compra/match-produto';
import type { NotaCompraExtraida } from '@/lib/nota-compra/ocr-extrair';

type FamiliaOpt = { id: string; nome: string };
type GrupoEmbalagem = { id: string; nome: string };
type ReceitaInsumoRow = {
  produto_id: string;
  receita?: { ativo: boolean } | { ativo: boolean }[] | null;
};

type LinhaDraft = {
  key: string;
  descricaoOcr: string;
  ean: string | null;
  quantidade: string;
  custoUnitario: string;
  produtoId: string;
  dataValidade: string;
  incluir: boolean;
};

type Etapa = 'foto' | 'conferencia' | 'resumo';

function produtoExigeValidade(p: Produto | undefined): boolean {
  if (!p) return true;
  return (
    (p.validade_dias || 0) > 0 ||
    (p.validade_horas || 0) > 0 ||
    (p.validade_minutos || 0) > 0
  );
}

function sugerirDataValidade(p: Produto | undefined): string {
  if (!produtoExigeValidade(p)) return '';
  const now = new Date();
  now.setDate(now.getDate() + (p?.validade_dias || 0));
  return now.toISOString().slice(0, 10);
}

export default function EntradaCompraNotaPage() {
  const { usuario } = useAuth();
  const { data: produtos, loading: loadProd, refetch: refetchProdutos } = useRealtimeQuery<Produto>({
    table: 'produtos',
    select: '*',
    orderBy: { column: 'nome', ascending: true },
  });

  const isUsuarioIndustria =
    usuario?.perfil === 'OPERATOR_WAREHOUSE' || usuario?.perfil === 'OPERATOR_WAREHOUSE_DRIVER';

  const { data: receitaInsumos } = useRealtimeQuery<ReceitaInsumoRow>({
    table: 'producao_receita_itens',
    select: 'produto_id, receita:producao_receitas(ativo)',
    orderBy: { column: 'produto_id', ascending: true },
    preserveDataWhileRefetching: true,
  });

  const produtoIdsEmReceitasAtivas = useMemo(() => {
    const set = new Set<string>();
    for (const row of receitaInsumos || []) {
      if (!row?.produto_id) continue;
      const receita = row.receita;
      const ativo = Array.isArray(receita) ? receita[0]?.ativo : receita?.ativo;
      if (ativo === false) continue;
      set.add(row.produto_id);
    }
    return set;
  }, [receitaInsumos]);

  const produtosCompra = useMemo(() => {
    const base = produtos.filter((p) => !p.origem || p.origem === 'COMPRA' || p.origem === 'AMBOS');
    if (!isUsuarioIndustria) return base;
    return base.filter((p) => produtoIdsEmReceitasAtivas.has(p.id));
  }, [isUsuarioIndustria, produtoIdsEmReceitasAtivas, produtos]);

  const { data: locais } = useRealtimeQuery<Local>({
    table: 'locais',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: familiasLista } = useRealtimeQuery<FamiliaOpt>({
    table: 'familias',
    select: 'id, nome',
    orderBy: { column: 'nome', ascending: true },
  });
  const { data: gruposEmbalagem } = useRealtimeQuery<GrupoEmbalagem>({
    table: 'grupos',
    select: 'id, nome',
    orderBy: { column: 'nome', ascending: true },
  });

  const warehouses = useMemo(() => locais.filter((l) => l.tipo === 'WAREHOUSE'), [locais]);
  const warehousesPermitidos = useMemo(() => {
    if (!isUsuarioIndustria) return warehouses;
    const localId = usuario?.local_padrao_id;
    if (!localId) return [];
    return warehouses.filter((w) => w.id === localId);
  }, [isUsuarioIndustria, usuario?.local_padrao_id, warehouses]);

  const [etapa, setEtapa] = useState<Etapa>('foto');
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [qualidadeMsg, setQualidadeMsg] = useState<string | null>(null);
  const [qualidadeOk, setQualidadeOk] = useState(false);
  const [extraindo, setExtraindo] = useState(false);
  const [erroExtrair, setErroExtrair] = useState<string | null>(null);
  const [modoOcr, setModoOcr] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string | null>(null);

  const [notaFiscal, setNotaFiscal] = useState('');
  const [fornecedor, setFornecedor] = useState('');
  const [localId, setLocalId] = useState('');
  const [semNota, setSemNota] = useState(false);
  const [motivoSemNota, setMotivoSemNota] = useState('');

  const [linhas, setLinhas] = useState<LinhaDraft[]>([]);
  const [salvandoLotes, setSalvandoLotes] = useState(false);

  const [modalRapidoAberto, setModalRapidoAberto] = useState(false);
  const [linhaCadastroKey, setLinhaCadastroKey] = useState<string | null>(null);
  const [salvandoRapido, setSalvandoRapido] = useState(false);
  const [formRapido, setFormRapido] = useState({
    nome: '',
    familia_id: '',
    embalagem_grupo_id: '',
    codigo_barras: '',
    unidade_medida: 'un',
    estoque_minimo: '0',
  });

  const inputCameraRef = useRef<HTMLInputElement>(null);
  const inputGaleriaRef = useRef<HTMLInputElement>(null);
  const videoWebcamRef = useRef<HTMLVideoElement | null>(null);
  const streamWebcamRef = useRef<MediaStream | null>(null);

  const [webcamAberta, setWebcamAberta] = useState(false);

  /** Prévia ok, aguardando o operador confirmar antes de chamar o OCR. */
  const emRevisaoFoto = Boolean(etapa === 'foto' && arquivo && qualidadeOk && !extraindo);

  /**
   * Tenta abrir o seletor/câmera ao entrar (celular, Mac, etc.).
   * Alguns navegadores bloqueiam sem gesto — use os botões abaixo.
   */
  useEffect(() => {
    if (etapa !== 'foto' || arquivo || extraindo) return;
    const t = window.setTimeout(() => inputCameraRef.current?.click(), 350);
    return () => window.clearTimeout(t);
  }, [etapa, arquivo, extraindo]);

  useEffect(() => {
    return () => {
      streamWebcamRef.current?.getTracks().forEach((tr) => tr.stop());
      streamWebcamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!webcamAberta || !videoWebcamRef.current || !streamWebcamRef.current) return;
    const v = videoWebcamRef.current;
    v.srcObject = streamWebcamRef.current;
    void v.play().catch(() => {});
  }, [webcamAberta]);

  const onInputArquivoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    void onEscolherArquivo(e.target.files?.[0] ?? null);
    e.target.value = '';
  };

  useEffect(() => {
    if (!isUsuarioIndustria) return;
    const lid = usuario?.local_padrao_id;
    if (!lid) return;
    setLocalId((prev) => (prev ? prev : lid));
  }, [isUsuarioIndustria, usuario?.local_padrao_id]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const linhasSemProduto = useMemo(
    () => linhas.filter((l) => l.incluir && !l.produtoId).length,
    [linhas]
  );

  /** Inclui produtos já vinculados nas linhas (ex.: cadastro rápido) mesmo fora do filtro de receita na indústria. */
  const produtosOpcoesLinha = useMemo(() => {
    const ids = new Set(linhas.map((l) => l.produtoId).filter(Boolean) as string[]);
    const extra = produtos.filter(
      (p) => ids.has(p.id) && !produtosCompra.some((b) => b.id === p.id)
    );
    return [...produtosCompra, ...extra];
  }, [produtosCompra, produtos, linhas]);

  const executarExtracaoNota = useCallback(
    async (arquivoLocal: File) => {
      if (!usuario) {
        alert('Faça login.');
        return;
      }
      const senha = getSenhaOperacionalSession();
      const loginOp = usuario.login_operacional?.trim() || '';
      if (!loginOp) {
        alert('Seu usuário não tem login operacional. Cadastre em Cadastros → Usuários.');
        return;
      }
      if (!senha) {
        alert('Sessão expirada. Saia e entre de novo no sistema.');
        return;
      }

      setExtraindo(true);
      setErroExtrair(null);
      try {
        const dataUrl = await fileToDataUrl(arquivoLocal);
        const parsed = dataUrlToBase64AndMime(dataUrl);
        if (!parsed) {
          throw new Error('Não foi possível codificar a imagem.');
        }

        const res = await fetch('/api/operacional/extrair-nota-compra', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            login: loginOp,
            senha,
            imageBase64: parsed.base64,
            mimeType: parsed.mimeType,
          }),
        });
        const body = (await res.json()) as {
          error?: string;
          detalhe?: string;
          extracao?: NotaCompraExtraida;
          storagePath?: string;
          modoOcr?: string;
        };
        if (!res.ok) {
          const extra = body.detalhe ? `\n\nDetalhe: ${body.detalhe}` : '';
          throw new Error((body.error || 'Falha na extração') + extra);
        }
        if (!body.extracao?.linhas?.length) {
          throw new Error(
            'Nenhuma linha de produto foi reconhecida. Tente outra foto ou use entrada manual.'
          );
        }

        setStoragePath(body.storagePath ?? null);
        setModoOcr(body.modoOcr ?? null);
        setNotaFiscal((body.extracao.nota_fiscal || '').trim().toUpperCase());
        setFornecedor((body.extracao.fornecedor || '').trim());

        const draft: LinhaDraft[] = body.extracao.linhas.map((l) => {
          const pid = sugerirProdutoId(produtos, l.ean, l.descricao);
          const p = produtos.find((x) => x.id === pid);
          return {
            key: crypto.randomUUID(),
            descricaoOcr: l.descricao,
            ean: l.ean,
            quantidade: l.quantidade != null && Number.isFinite(l.quantidade) ? String(l.quantidade) : '',
            custoUnitario:
              l.valor_unitario != null && Number.isFinite(l.valor_unitario)
                ? String(l.valor_unitario)
                : '',
            produtoId: pid,
            dataValidade: sugerirDataValidade(p),
            incluir: true,
          };
        });
        setLinhas(draft);
        setEtapa('conferencia');
      } catch (e: unknown) {
        setErroExtrair(errMessage(e, 'Erro ao extrair'));
      } finally {
        setExtraindo(false);
      }
    },
    [usuario, produtos]
  );

  const onEscolherArquivo = async (f: File | null) => {
    setErroExtrair(null);
    setQualidadeOk(false);
    setQualidadeMsg(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setArquivo(null);

    if (!f) return;

    const q = await avaliarQualidadeImagemNota(f);
    if (!q.ok) {
      setQualidadeMsg(q.motivo);
      setQualidadeOk(false);
      return;
    }

    setArquivo(f);
    setPreviewUrl(URL.createObjectURL(f));
    setQualidadeOk(true);
    setQualidadeMsg(null);
    /* Confirmação visual: «Usar esta foto» dispara o OCR. */
  };

  const confirmarUsarFotoELer = () => {
    if (!arquivo) return;
    void executarExtracaoNota(arquivo);
  };

  const fecharWebcam = () => {
    streamWebcamRef.current?.getTracks().forEach((tr) => tr.stop());
    streamWebcamRef.current = null;
    setWebcamAberta(false);
  };

  const abrirWebcam = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      alert('Este navegador não acessa a webcam. Use «Escolher arquivo».');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1920 } },
        audio: false,
      });
      streamWebcamRef.current = stream;
      setWebcamAberta(true);
    } catch {
      alert(
        'Não foi possível usar a webcam. No Mac: Preferências do Sistema → Privacidade e segurança → Câmera — autorize o navegador (Chrome/Safari).'
      );
    }
  };

  const capturarFrameWebcam = () => {
    const video = videoWebcamRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `nota-${Date.now()}.jpg`, { type: 'image/jpeg' });
        fecharWebcam();
        void onEscolherArquivo(file);
      },
      'image/jpeg',
      0.92
    );
  };

  const descartarFotoETentarDeNovo = () => {
    setErroExtrair(null);
    setQualidadeOk(false);
    setQualidadeMsg(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setArquivo(null);
    window.setTimeout(() => inputCameraRef.current?.click(), 350);
  };

  const atualizarLinha = (key: string, patch: Partial<LinhaDraft>) => {
    setLinhas((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const onProdutoLinhaChange = (key: string, produtoId: string) => {
    const p = produtos.find((x) => x.id === produtoId);
    atualizarLinha(key, {
      produtoId,
      dataValidade: sugerirDataValidade(p),
    });
  };

  const abrirCadastroRapido = (key: string) => {
    const linha = linhas.find((l) => l.key === key);
    setLinhaCadastroKey(key);
    setFormRapido({
      nome: linha?.descricaoOcr.slice(0, 120) || '',
      familia_id: '',
      embalagem_grupo_id: '',
      codigo_barras: linha?.ean || '',
      unidade_medida: 'un',
      estoque_minimo: '0',
    });
    setModalRapidoAberto(true);
  };

  const salvarCadastroRapido = async () => {
    if (!linhaCadastroKey) return;
    const nome = formRapido.nome.trim();
    if (!nome) {
      alert('Informe o nome do produto.');
      return;
    }
    if (isUsuarioIndustria && !formRapido.familia_id.trim()) {
      alert('Na indústria, selecione a família (categoria) do produto.');
      return;
    }

    const eanDigits = formRapido.codigo_barras.replace(/\D/g, '');
    const codigoBarras = eanDigits.length >= 8 ? eanDigits : null;

    setSalvandoRapido(true);
    try {
      const { data: criado, error } = await supabase
        .from('produtos')
        .insert({
          nome,
          unidade_medida: formRapido.unidade_medida,
          fornecedor: fornecedor.trim() || null,
          origem: 'COMPRA',
          familia_id: formRapido.familia_id || null,
          codigo_barras: codigoBarras,
          estoque_minimo: Math.max(0, Number.parseInt(formRapido.estoque_minimo, 10) || 0),
          validade_dias: 0,
          validade_horas: 0,
          validade_minutos: 0,
          contagem_do_dia: false,
          exibir_horario_etiqueta: false,
          escopo_reposicao: isUsuarioIndustria ? 'industria' : 'loja',
        })
        .select()
        .single();
      if (error) throw error;
      if (!criado?.id) throw new Error('Resposta inválida ao criar produto.');

      await supabase.from('estoque').insert({ produto_id: criado.id, quantidade: 0 });
      if (formRapido.embalagem_grupo_id) {
        await supabase.from('produto_grupos').insert({
          produto_id: criado.id,
          grupo_id: formRapido.embalagem_grupo_id,
        });
      }

      await refetchProdutos();
      atualizarLinha(linhaCadastroKey, {
        produtoId: criado.id,
        dataValidade: sugerirDataValidade(criado as Produto),
      });
      setModalRapidoAberto(false);
      setLinhaCadastroKey(null);
    } catch (e: unknown) {
      alert(errMessage(e, 'Erro ao cadastrar produto'));
    } finally {
      setSalvandoRapido(false);
    }
  };

  const validarCabecalho = (): string | null => {
    if (!localId) return 'Selecione o local de entrada.';
    if (!fornecedor.trim()) return 'Informe o fornecedor.';
    if (semNota) {
      if (!motivoSemNota.trim()) return 'Informe o motivo (sem nota fiscal).';
    } else if (!notaFiscal.trim()) {
      return 'Informe a nota fiscal ou marque «Sem nota fiscal».';
    }
    return null;
  };

  const irParaResumo = () => {
    const err = validarCabecalho();
    if (err) {
      alert(err);
      return;
    }
    const comInclusao = linhas.some((l) => l.incluir);
    if (!comInclusao) {
      alert('Marque ao menos uma linha para lançar.');
      return;
    }
    if (linhasSemProduto > 0) {
      alert(
        `Existem ${linhasSemProduto} linha(s) marcadas para lançar sem produto vinculado. Cadastre ou selecione o produto.`
      );
      return;
    }
    for (const l of linhas) {
      if (!l.incluir) continue;
      const p = produtos.find((x) => x.id === l.produtoId);
      if (produtoExigeValidade(p) && !l.dataValidade.trim()) {
        alert(`Informe a validade para: ${p?.nome || 'produto'}.`);
        return;
      }
      const q = Number.parseFloat(String(l.quantidade).replace(',', '.'));
      const c = Number.parseFloat(String(l.custoUnitario).replace(',', '.'));
      if (!Number.isFinite(q) || q <= 0) {
        alert(`Quantidade inválida na linha: ${l.descricaoOcr.slice(0, 40)}…`);
        return;
      }
      if (!Number.isFinite(c) || c < 0) {
        alert(`Custo inválido na linha: ${l.descricaoOcr.slice(0, 40)}…`);
        return;
      }
    }
    setEtapa('resumo');
  };

  const confirmarLancamento = async () => {
    if (!usuario) return;
    const err = validarCabecalho();
    if (err) {
      alert(err);
      return;
    }
    const n = linhas.filter((l) => l.incluir).length;
    if (n < 1) {
      alert('Nenhuma linha selecionada para lançar.');
      return;
    }
    if (
      !window.confirm(
        `Confirmar lançamento de ${n} lote(s) de compra neste armazém?\n` +
          `NF: ${semNota ? '(sem nota)' : notaFiscal.trim()}\nFornecedor: ${fornecedor.trim()}`
      )
    ) {
      return;
    }

    setSalvandoLotes(true);
    const erros: string[] = [];
    let ok = 0;
    try {
      for (const l of linhas) {
        if (!l.incluir) continue;
        const p = produtos.find((x) => x.id === l.produtoId);
        const qtd = Number.parseFloat(String(l.quantidade).replace(',', '.'));
        const custo = Number.parseFloat(String(l.custoUnitario).replace(',', '.'));
        try {
          await criarLoteCompra(
            {
              produto_id: l.produtoId,
              quantidade: Math.round(qtd),
              custo_unitario: custo,
              fornecedor: fornecedor.trim(),
              lote_fornecedor: '',
              nota_fiscal: semNota ? null : notaFiscal.trim().toUpperCase(),
              sem_nota_fiscal: semNota,
              motivo_sem_nota: semNota ? motivoSemNota.trim() : null,
              local_id: localId,
            },
            l.dataValidade.trim() || null,
            usuario.id
          );
          ok += 1;
        } catch (e: unknown) {
          erros.push(`${p?.nome || l.descricaoOcr}: ${errMessage(e, 'erro')}`);
        }
      }
      if (erros.length) {
        alert(`Lançados: ${ok}.\nFalhas:\n${erros.slice(0, 8).join('\n')}`);
      } else {
        alert(`Lançamento concluído: ${ok} lote(s).`);
      }
      resetFluxo();
    } finally {
      setSalvandoLotes(false);
    }
  };

  const resetFluxo = () => {
    fecharWebcam();
    setEtapa('foto');
    setArquivo(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setQualidadeOk(false);
    setQualidadeMsg(null);
    setLinhas([]);
    setNotaFiscal('');
    setFornecedor('');
    setSemNota(false);
    setMotivoSemNota('');
    setStoragePath(null);
    setModoOcr(null);
    setErroExtrair(null);
  };

  if (loadProd) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-violet-100 rounded-lg flex items-center justify-center shrink-0">
            <FileImage className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Foto da nota</h1>
            <p className="text-sm text-gray-600">
              Abre a câmera, tire a foto e confira se ficou legível. Depois toque em <strong>Usar esta foto</strong> para ler a
              nota.
            </p>
            <Link href="/entrada-compra" className="text-sm text-red-600 hover:underline mt-1 inline-block">
              Prefiro lançar na mão (sem foto)
            </Link>
          </div>
        </div>
      </div>

      {etapa === 'foto' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-6 space-y-4">
          <input
            ref={inputCameraRef}
            id="entrada-nota-capture"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            className="sr-only"
            onChange={onInputArquivoChange}
          />
          <input
            ref={inputGaleriaRef}
            id="entrada-nota-galeria"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={onInputArquivoChange}
          />

          {extraindo ? (
            <div className="flex flex-col items-center justify-center gap-4 py-10 px-2 text-center">
              <Loader2 className="h-14 w-14 text-violet-600 animate-spin shrink-0" aria-hidden />
              <div>
                <p className="text-lg font-semibold text-gray-900">Lendo a nota…</p>
                <p className="text-sm text-gray-500 mt-1">Aguarde uns segundos.</p>
              </div>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="max-h-36 rounded-lg border border-gray-200 opacity-90"
                />
              )}
            </div>
          ) : emRevisaoFoto ? (
            <div className="space-y-5">
              <p className="text-center text-base font-medium text-gray-800">Confira se a foto ficou boa</p>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt="Prévia da nota fiscal"
                  className="w-full max-h-[min(55vh,420px)] object-contain rounded-xl border border-gray-200 bg-gray-50 mx-auto"
                />
              )}
              {erroExtrair && (
                <div className="text-sm text-red-800 bg-red-50 rounded-lg p-3 border border-red-100">{erroExtrair}</div>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                <Button
                  type="button"
                  className="w-full sm:min-w-[200px] sm:w-auto min-h-[52px] text-base"
                  onClick={confirmarUsarFotoELer}
                >
                  {erroExtrair ? 'Tentar ler de novo' : 'Usar esta foto'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:min-w-[200px] sm:w-auto min-h-[52px] text-base"
                  onClick={descartarFotoETentarDeNovo}
                >
                  Tirar outra foto
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <label
                  htmlFor="entrada-nota-capture"
                  className="flex items-center justify-center gap-3 w-full min-h-[56px] rounded-xl bg-violet-600 text-white text-lg font-semibold shadow-md active:bg-violet-700 px-4 py-4 cursor-pointer touch-manipulation"
                >
                  <Camera className="w-8 h-8 shrink-0" aria-hidden />
                  Tirar foto
                </label>
                <button
                  type="button"
                  onClick={() => void abrirWebcam()}
                  className="flex items-center justify-center gap-2 w-full min-h-[48px] rounded-xl border border-violet-200 bg-white text-violet-900 text-base font-medium touch-manipulation"
                >
                  <Camera className="w-5 h-5 shrink-0" aria-hidden />
                  Usar webcam (Mac / PC)
                </button>
                <button
                  type="button"
                  onClick={() => inputGaleriaRef.current?.click()}
                  className="text-sm text-gray-500 underline w-full text-center py-2 touch-manipulation"
                >
                  Escolher arquivo na pasta (JPEG, PNG…)
                </button>
                <p className="text-xs text-gray-500 text-center leading-snug">
                  No Mac com Chrome/Safari, «Tirar foto» pode abrir o seletor de arquivos. Use{' '}
                  <strong>Usar webcam</strong> para filmar a nota com a câmera do computador.
                </p>
              </div>
              {qualidadeMsg && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="w-5 h-5 shrink-0" />
                  <span>{qualidadeMsg}</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {etapa === 'conferencia' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-gray-600">
                {modoOcr && (
                  <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs">OCR: {modoOcr}</span>
                )}
                {storagePath && (
                  <span className="text-xs text-gray-400 truncate max-w-[220px]" title={storagePath}>
                    Arquivo: {storagePath}
                  </span>
                )}
              </p>
              <Button variant="secondary" type="button" onClick={resetFluxo}>
                Nova foto
              </Button>
            </div>
            {linhasSemProduto > 0 && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <strong>{linhasSemProduto}</strong> linha(s) sem produto no cadastro. Use <strong>Cadastrar</strong> ou
                  selecione um produto existente antes do resumo.
                </div>
              </div>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              <Select
                label="Local de entrada"
                required
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                options={[
                  { value: '', label: 'Selecione…' },
                  ...warehousesPermitidos.map((w) => ({ value: w.id, label: w.nome })),
                ]}
              />
              <Input label="Fornecedor" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} required />
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                label="Nota fiscal"
                value={notaFiscal}
                onChange={(e) => setNotaFiscal(e.target.value.toUpperCase())}
                disabled={semNota}
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 mt-6 sm:mt-8">
                <input
                  type="checkbox"
                  checked={semNota}
                  onChange={(e) => setSemNota(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Sem nota fiscal
              </label>
            </div>
            {semNota && (
              <Input
                label="Motivo (sem NF)"
                value={motivoSemNota}
                onChange={(e) => setMotivoSemNota(e.target.value)}
              />
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="p-2 w-10">OK</th>
                  <th className="p-2 min-w-[140px]">Produto (cadastro)</th>
                  <th className="p-2 min-w-[160px]">Texto na nota</th>
                  <th className="p-2">EAN</th>
                  <th className="p-2 w-24">Qtd</th>
                  <th className="p-2 w-28">Custo un.</th>
                  <th className="p-2 w-36">Validade</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const p = produtos.find((x) => x.id === l.produtoId);
                  const exigeVal = produtoExigeValidade(p);
                  return (
                    <tr key={l.key} className="border-b border-gray-100 align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={l.incluir}
                          onChange={(e) => atualizarLinha(l.key, { incluir: e.target.checked })}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-2">
                        <div className="space-y-1">
                          <Select
                            options={[
                              { value: '', label: 'Selecione…' },
                              ...produtosOpcoesLinha.map((pr) => ({ value: pr.id, label: pr.nome })),
                            ]}
                            value={l.produtoId}
                            onChange={(e) => onProdutoLinhaChange(l.key, e.target.value)}
                          />
                          {!l.produtoId && l.incluir && (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full text-xs"
                              onClick={() => abrirCadastroRapido(l.key)}
                            >
                              <UserPlus className="w-3 h-3 mr-1" />
                              Cadastrar
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="p-2 text-gray-700 text-xs">{l.descricaoOcr}</td>
                      <td className="p-2 text-xs text-gray-500">{l.ean || '—'}</td>
                      <td className="p-2">
                        <Input
                          value={l.quantidade}
                          onChange={(e) => atualizarLinha(l.key, { quantidade: e.target.value })}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={l.custoUnitario}
                          onChange={(e) => atualizarLinha(l.key, { custoUnitario: e.target.value })}
                          inputMode="decimal"
                        />
                      </td>
                      <td className="p-2">
                        {exigeVal ? (
                          <Input
                            type="date"
                            value={l.dataValidade}
                            onChange={(e) => atualizarLinha(l.key, { dataValidade: e.target.value })}
                          />
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" type="button" onClick={() => setEtapa('foto')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Button>
            <Button type="button" onClick={irParaResumo} disabled={linhasSemProduto > 0}>
              Pré-visualizar lançamento
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {etapa === 'resumo' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">Confirmar lançamento</h2>
          <p className="text-sm text-gray-600">
            <strong>Local:</strong> {warehousesPermitidos.find((w) => w.id === localId)?.nome || '—'} ·{' '}
            <strong>Fornecedor:</strong> {fornecedor.trim()} ·{' '}
            <strong>NF:</strong> {semNota ? '(sem nota)' : notaFiscal.trim()}
          </p>
          <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
            {linhas
              .filter((l) => l.incluir)
              .map((l) => {
                const p = produtos.find((x) => x.id === l.produtoId);
                const q = Number.parseFloat(String(l.quantidade).replace(',', '.'));
                const c = Number.parseFloat(String(l.custoUnitario).replace(',', '.'));
                return (
                  <li key={l.key} className="p-3 text-sm flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-gray-900">{p?.nome || '—'}</span>
                    <span className="text-gray-600 tabular-nums">
                      {Number.isFinite(q) ? q : '—'} un. × R${' '}
                      {Number.isFinite(c) ? c.toFixed(2) : '—'}
                      {l.dataValidade ? ` · val. ${l.dataValidade}` : ''}
                    </span>
                  </li>
                );
              })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" type="button" onClick={() => setEtapa('conferencia')}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Ajustar
            </Button>
            <Button type="button" onClick={() => void confirmarLancamento()} disabled={salvandoLotes}>
              {salvandoLotes ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gravando…
                </>
              ) : (
                'Confirmar lançamento'
              )}
            </Button>
          </div>
        </div>
      )}

      <Modal
        isOpen={webcamAberta}
        onClose={fecharWebcam}
        title="Fotografar a nota"
        subtitle="Aponte a câmera para a nota e toque em Capturar foto."
        size="lg"
      >
        <div className="p-4 space-y-4">
          <video
            ref={videoWebcamRef}
            className="w-full max-h-[min(60vh,480px)] rounded-lg bg-black object-contain"
            playsInline
            muted
            autoPlay
          />
          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="secondary" type="button" onClick={fecharWebcam}>
              Cancelar
            </Button>
            <Button type="button" onClick={capturarFrameWebcam}>
              Capturar foto
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modalRapidoAberto}
        onClose={() => {
          setModalRapidoAberto(false);
          setLinhaCadastroKey(null);
        }}
        title="Cadastro rápido de produto"
        subtitle="O produto entra como compra; validade será informada na linha da nota."
      >
        <div className="p-6 space-y-3">
          <Input
            label="Nome"
            value={formRapido.nome}
            onChange={(e) => setFormRapido((f) => ({ ...f, nome: e.target.value }))}
            required
          />
          <Input
            label="Código de barras (EAN)"
            value={formRapido.codigo_barras}
            onChange={(e) => setFormRapido((f) => ({ ...f, codigo_barras: e.target.value }))}
          />
          <Select
            label="Unidade"
            value={formRapido.unidade_medida}
            onChange={(e) => setFormRapido((f) => ({ ...f, unidade_medida: e.target.value }))}
            options={[
              { value: 'un', label: 'Unidades' },
              { value: 'kg', label: 'kg' },
              { value: 'g', label: 'g' },
              { value: 'l', label: 'l' },
              { value: 'ml', label: 'ml' },
            ]}
          />
          <Select
            label={isUsuarioIndustria ? 'Família (obrigatória na indústria)' : 'Família'}
            value={formRapido.familia_id}
            onChange={(e) => setFormRapido((f) => ({ ...f, familia_id: e.target.value }))}
            options={[
              { value: '', label: 'Selecione…' },
              ...familiasLista.map((g) => ({ value: g.id, label: g.nome })),
            ]}
          />
          <Select
            label="Tipo de embalagem"
            value={formRapido.embalagem_grupo_id}
            onChange={(e) => setFormRapido((f) => ({ ...f, embalagem_grupo_id: e.target.value }))}
            options={[{ value: '', label: 'Opcional…' }, ...gruposEmbalagem.map((g) => ({ value: g.id, label: g.nome }))]}
          />
          <Input
            label="Estoque mínimo"
            type="number"
            min={0}
            value={formRapido.estoque_minimo}
            onChange={(e) => setFormRapido((f) => ({ ...f, estoque_minimo: e.target.value }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setModalRapidoAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void salvarCadastroRapido()} disabled={salvandoRapido}>
              {salvandoRapido ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar e vincular'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
