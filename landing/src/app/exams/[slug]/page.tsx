import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { APP_URL, EXAM_SEO_PAGES } from '@/lib/constants';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return EXAM_SEO_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = EXAM_SEO_PAGES.find((p) => p.slug === slug);
  if (!page) return {};

  const title = `${page.title} Practice Test - Adaptive Exam Prep`;
  const description = `Prepare for ${page.cert} with personalized Goethe/Cambridge practice tests. Save vocabulary you miss and generate new exams focused on your weaknesses.`;

  return {
    title,
    description,
    openGraph: { title, description },
    alternates: { canonical: `https://lexicoil.com/exams/${slug}` },
  };
}

export default async function ExamLandingPage({ params }: Props) {
  const { slug } = await params;
  const page = EXAM_SEO_PAGES.find((p) => p.slug === slug);
  if (!page) notFound();

  const langLabel = page.lang === 'de' ? 'German' : 'English';
  const appLink = `${APP_URL}?lang=${page.lang}&level=${page.level}`;

  return (
    <>
      <Header />
      <main>
        <section
          className="py-16 md:py-24"
          style={{
            background:
              'radial-gradient(ellipse 80% 60% at 50% -10%, var(--brand-light), transparent), var(--bg-base)',
          }}
        >
          <Container>
            <Link href="/" className="text-sm font-semibold text-[var(--brand)] hover:underline">
              Back to home
            </Link>
            <p className="lc-badge mt-6">{page.cert}</p>
            <h1 className="font-display mt-3 max-w-3xl text-4xl tracking-tight text-[var(--text-primary)] md:text-5xl">
              {page.title} practice tests that adapt to your mistakes
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold text-[var(--text-secondary)]">
              Take realistic {langLabel} mock exams at {page.level} level. Save difficult vocabulary
              from real questions and generate personalized tests - so you only study what you still
              do not know.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href={appLink}>Start {page.level} practice free</Button>
              <Button href="/#how-it-works" variant="secondary">
                How it works
              </Button>
            </div>
          </Container>
        </section>

        <section className="section-pad">
          <Container>
            <div className="grid gap-8 md:grid-cols-3">
              {[
                {
                  title: 'Official format',
                  desc: `Reading, listening, writing and speaking structured like ${page.cert}.`,
                },
                {
                  title: 'Personal vocabulary',
                  desc: 'Every word you miss becomes part of your next mock exam.',
                },
                {
                  title: 'Track progress',
                  desc: 'History, scores, and flashcard review in one place.',
                },
              ].map((item) => (
                <div key={item.title} className="surface-card p-6">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">{item.title}</h2>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-secondary)]">{item.desc}</p>
                </div>
              ))}
            </div>
          </Container>
        </section>
      </main>
      <Footer />
    </>
  );
}
