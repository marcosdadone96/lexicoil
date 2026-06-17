import Link from 'next/link';
import { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
};

export function Button({
  href,
  children,
  variant = 'primary',
  className = '',
  onClick,
}: {
  href?: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  onClick?: () => void;
}) {
  const base = 'inline-flex items-center justify-center gap-2 text-[15px]';

  if (href) {
    const external = href.startsWith('http');
    const staticHtml = href.endsWith('.html');
    if (external || staticHtml || href.startsWith('#')) {
      return (
        <a href={href} className={`${base} ${styles[variant]} ${className}`}>
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={`${base} ${styles[variant]} ${className}`}>
        {children}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
