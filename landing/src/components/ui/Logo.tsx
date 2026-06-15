import Image from 'next/image';
import Link from 'next/link';

type Props = {
  href?: string;
  showWordmark?: boolean;
  size?: number;
  className?: string;
  variant?: 'default' | 'white';
};

export function Logo({
  href = '/',
  showWordmark = true,
  size = 36,
  className = '',
  variant = 'default',
}: Props) {
  const iconSrc = variant === 'white' ? '/assets/brand/icon-white.svg' : '/assets/brand/icon.png';

  const inner = (
    <>
      <Image
        src={iconSrc}
        alt="LexiCoil"
        width={size}
        height={size}
        className="shrink-0"
        priority
      />
      {showWordmark && (
        <span className="font-display text-lg tracking-tight text-[var(--text-primary)] md:text-xl">
          Lexi<span className="font-bold">Coil</span>
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`flex items-center gap-2.5 ${className}`}>
        {inner}
      </Link>
    );
  }

  return <div className={`flex items-center gap-2.5 ${className}`}>{inner}</div>;
}
