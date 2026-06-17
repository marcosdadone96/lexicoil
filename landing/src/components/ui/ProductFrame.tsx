import Image from 'next/image';
import type { ReactNode } from 'react';

type ProductFrameProps = {
  caption?: string;
  url?: string;
  children?: ReactNode;
  imageSrc?: string;
  imageAlt?: string;
  priority?: boolean;
};

export function ProductFrame({
  caption,
  url = 'app.lexicoil.com',
  children,
  imageSrc,
  imageAlt = 'LexiCoil app screenshot',
  priority = false,
}: ProductFrameProps) {
  return (
    <div className="w-full">
      <div
        className="overflow-hidden rounded-[20px] border border-[var(--border)] bg-[var(--bg-surface)]"
        style={{ boxShadow: 'var(--shadow-hero)' }}
      >
        <div className="flex items-center gap-1.5 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3.5 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[var(--border-strong)]" />
          <span className="ml-2 text-xs font-semibold text-[var(--text-muted)]">{url}</span>
        </div>
        <div className="bg-[var(--bg-base)]">
          {imageSrc ? (
            <Image
              src={imageSrc}
              alt={imageAlt}
              width={1280}
              height={720}
              className="h-auto w-full"
              priority={priority}
              unoptimized
            />
          ) : (
            children
          )}
        </div>
      </div>
      {caption ? (
        <p className="mt-2 text-center text-xs font-semibold italic text-[var(--text-muted)]">{caption}</p>
      ) : null}
    </div>
  );
}
