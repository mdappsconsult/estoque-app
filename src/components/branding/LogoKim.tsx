'use client';

import Image from 'next/image';

const LOGO_SRC = '/branding/acai-do-kim-logo.png';

/** Logotipo Açaí do Kim (arquivo com fundo preto). */
export function LogoKim({
  className = '',
  priority = false,
}: {
  /** Ex.: `max-h-8 w-auto`, `max-h-36 w-auto mx-auto` */
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={LOGO_SRC}
      alt="Açaí do Kim"
      width={360}
      height={440}
      sizes="(max-width: 768px) 180px, 220px"
      className={className}
      priority={priority}
    />
  );
}
