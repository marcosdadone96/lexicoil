import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import {
  DEMO_URL,
  EXAM_SEO_PAGES,
  LAUNCH_APP_URL,
  appUrlForExam,
  isExamLiveAtLaunch,
} from '@/lib/constants';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return EXAM_SEO_PAGES.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = EXAM_SEO_PAGES.find((p) => p.slug === slug);
  if (!page) return {};

  const live = isExamLiveAtLaunch(page.lang, page.level);
  const title = `${page.title} Practice Test - Adaptive Exam Prep`;
  const description = live
    ? `Prepare for ${page.cert} with personalized Goethe practice tests. Save vocabulary you miss and generate new exams focused on your weaknesses.`
    : `${page.cert} prep is coming soon on LexiCoil. Try the free Goethe B1 demo now or start Goethe B1 practice while we finish this level.`;

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

  const live = isExamLiveAtLaunch(page.lang, page.level);
  const langLabel = page.lang === 'de' ? 'German' : page.lang === 'en' ? 'English' : 'Spanish';
  const appLink = appUrlForExam(page.lang, page.level);

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
            {!live && (
              <p className="lc-badge mt-3 w-fit border border-[var(--border)] !bg-[var(--bg-elevated)] !text-[var(--text-secondary)]">
                Coming soon
              </p>
            )}
            <h1 className="font-display mt-3 max-w-3xl text-4xl tracking-tight text-[var(--text-primary)] md:text-5xl">
              {page.title} practice tests that adapt to your mistakes
            </h1>
            <p className="mt-5 max-w-2xl text-lg font-semibold text-[var(--text-secondary)]">
              {live ? (
                <>
                  Take realistic {langLabel} mock exams at {page.level} level. Save difficult vocabulary
                  from real questions and generate personalized tests - so you only study what you still
                  do not know.
                </>
              ) : (
                <>
                  We are building {page.title} on LexiCoil. Try the free 5-minute Goethe B1 demo without an
                  account, or start Goethe B1 practice today while this certification is in development.
                </>
              )}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {live ? (
                <>
                  <Button href={appLink}>Start {page.level} practice free</Button>
                  <Button href={DEMO_URL} variant="secondary">
                    Try sample exam
                  </Button>
                </>
              ) : (
                <>
                  <Button href={DEMO_URL}>Try 5-minute demo</Button>
                  <Button href={LAUNCH_APP_URL} variant="secondary">
                    Start Goethe B1 free
                  </Button>
                </>
              )}
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
