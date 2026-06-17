import Link from 'next/link';
import Image from 'next/image';
import { EXAM_SEO_PAGES } from '@/lib/constants';
import { Container } from '@/components/ui/Container';

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] bg-[var(--text-primary)] text-[var(--bg-elevated)]">
      <Container className="section-pad">
        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="mb-4 flex items-center gap-2.5">
              <Image
                src="/assets/brand/icon-white.svg"
                alt="LexiCoil"
                width={36}
                height={36}
                className="shrink-0"
              />
              <span className="font-display text-lg text-white">
                Lexi<span className="font-bold">Coil</span>
              </span>
            </div>
            <p className="max-w-sm text-sm leading-relaxed opacity-70">
              Adaptive exam preparation for Goethe and Cambridge. Every mistake becomes your next lesson.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-[var(--bg-base)]">Exams</h4>
            <ul className="space-y-2.5 text-sm opacity-80">
              {EXAM_SEO_PAGES.slice(0, 4).map((p) => (
                <li key={p.slug}>
                  <Link href={`/exams/${p.slug}`} className="hover:text-[var(--bg-base)]">
                    {p.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-[var(--bg-base)]">Resources</h4>
            <ul className="space-y-2.5 text-sm opacity-80">
              <li>
                <a href="#how-it-works" className="hover:text-[var(--bg-base)]">
                  How it works
                </a>
              </li>
              <li>
                <a href="#pricing" className="hover:text-[var(--bg-base)]">
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-sm font-semibold text-[var(--bg-base)]">Company</h4>
            <ul className="space-y-2.5 text-sm opacity-80">
              <li>
                <a href="mailto:contact@lexicoil.com" className="hover:text-[var(--bg-base)]">
                  Contact
                </a>
              </li>
              <li>
                <a href="/privacy.html" className="hover:text-[var(--bg-base)]">
                  Privacy
                </a>
              </li>
              <li>
                <a href="/terms.html" className="hover:text-[var(--bg-base)]">
                  Terms
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 text-xs opacity-50 md:flex-row">
          <p>&copy; {new Date().getFullYear()} LexiCoil. All rights reserved.</p>
          <p>Goethe and Cambridge are trademarks of their respective owners. LexiCoil is not affiliated.</p>
        </div>
      </Container>
    </footer>
  );
}
