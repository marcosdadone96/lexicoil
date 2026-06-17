import { Header } from '@/components/layout/Header';
import { Footer } from '@/components/layout/Footer';
import { HeroSection } from '@/components/sections/HeroSection';
import { SocialProofSection } from '@/components/sections/SocialProofSection';
import { HowItWorksSection } from '@/components/sections/HowItWorksSection';
import { DemoSection } from '@/components/sections/DemoSection';
import { BenefitsSection } from '@/components/sections/BenefitsSection';
import { ComparisonSection } from '@/components/sections/ComparisonSection';
import { TestimonialsSection } from '@/components/sections/TestimonialsSection';
import { PricingSection } from '@/components/sections/PricingSection';
import { FAQSection } from '@/components/sections/FAQSection';
import { CTASection } from '@/components/sections/CTASection';
import { JsonLd } from '@/components/seo/JsonLd';
export default function HomePage() {
  return (
    <>
      <JsonLd />
      <Header />
      <main>
        <HeroSection />
        <SocialProofSection />
        <HowItWorksSection />
        <DemoSection />
        <BenefitsSection />
        <ComparisonSection />
        <TestimonialsSection />
        <PricingSection />
        <FAQSection />
        <CTASection />
      </main>
      <Footer />
    </>
  );
}
