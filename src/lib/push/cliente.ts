'use client';

import { getSenhaOperacionalSession } from '@/lib/auth';

/**
 * Helpers de Web Push no cliente. Cuidam de: detectar suporte do navegador,
 * registrar/obter o service worker, pedir permissão, criar/cancelar a `PushSubscription`
 * e sincronizar com o backend (`/api/push/inscrever` / `/api/push/cancelar`).
 *
 * `useNotificacoesPush` (hook) encapsula o estado para a UI.
 */

const SW_PATH = '/sw.js';

export type EstadoPush =
  | { tipo: 'nao-suportado'; motivo: string }
  | { tipo: 'precisa-instalar-pwa-ios' }
  | { tipo: 'permitido'; inscrito: boolean }
  | { tipo: 'pendente' }
  | { tipo: 'negado' };

export function ehIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS recente reporta "Mac" como plataforma; checamos touch para distinguir.
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)
  );
}

export function ehStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const ios = 'standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone;
  return Boolean(mq || ios);
}

export function suportePushNavegador(): { ok: true } | { ok: false; motivo: string } {
  if (typeof window === 'undefined') {
    return { ok: false, motivo: 'Janela não disponível.' };
  }
  if (!('serviceWorker' in navigator)) {
    return { ok: false, motivo: 'Este navegador não tem Service Worker.' };
  }
  if (!('PushManager' in window)) {
    return { ok: false, motivo: 'Este navegador não tem PushManager.' };
  }
  if (!('Notification' in window)) {
    return { ok: false, motivo: 'Este navegador não tem Notification API.' };
  }
  if (ehIos() && !ehStandalonePwa()) {
    // Safari iOS só envia push em PWA instalada na Tela de Início.
    return { ok: false, motivo: 'No iPhone, é preciso instalar o app na Tela de Início.' };
  }
  return { ok: true };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  // ArrayBuffer explícito (não SharedArrayBuffer) — exigência do tipo BufferSource
  // do `pushManager.subscribe` nas libs do TS 5.7+.
  const buffer = new ArrayBuffer(rawData.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) out[i] = rawData.charCodeAt(i);
  return out;
}

async function obterRegistration(): Promise<ServiceWorkerRegistration> {
  const existente = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (existente) {
    // Força revalidação do sw.js no servidor — iOS PWA costuma manter o SW
    // antigo em cache durante dias. Sem isso, atualizações no `push` listener
    // (texto da notificação, parse do payload) demoram a aparecer.
    try {
      await existente.update();
    } catch {
      // update() pode falhar offline; tudo bem, segue com o registro existente
    }
    return existente;
  }
  return navigator.serviceWorker.register(SW_PATH);
}

export async function jaEstaInscrito(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return false;
  const sub = await reg.pushManager.getSubscription();
  return !!sub;
}

export interface InscreverOpts {
  loginOperacional: string;
}

export async function inscreverPush(opts: InscreverOpts): Promise<{ ok: true } | { ok: false; erro: string }> {
  const suporte = suportePushNavegador();
  if (!suporte.ok) return { ok: false, erro: suporte.motivo };

  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return {
      ok: false,
      erro: 'Servidor sem NEXT_PUBLIC_VAPID_PUBLIC_KEY — peça ao administrador para gerar a chave.',
    };
  }

  const senha = getSenhaOperacionalSession();
  if (!senha) {
    return { ok: false, erro: 'Sessão expirada. Saia e entre de novo no sistema.' };
  }

  let permissao = Notification.permission;
  if (permissao === 'default') {
    permissao = await Notification.requestPermission();
  }
  if (permissao !== 'granted') {
    return { ok: false, erro: 'Você precisa permitir notificações no navegador.' };
  }

  const reg = await obterRegistration();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }

  const json = sub.toJSON();
  const payload = {
    login: opts.loginOperacional,
    senha,
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  const r = await fetch('/api/push/inscrever', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string };
    return { ok: false, erro: body.error || 'Falha ao registrar no servidor.' };
  }
  return { ok: true };
}

export async function cancelarPush(opts: { loginOperacional: string }): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration(SW_PATH);
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  try {
    const senha = getSenhaOperacionalSession();
    await fetch('/api/push/cancelar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        login: opts.loginOperacional,
        senha,
        endpoint: sub.endpoint,
      }),
    });
  } catch {
    // Mesmo se o servidor falhar, cancelamos localmente.
  }
  await sub.unsubscribe();
}
