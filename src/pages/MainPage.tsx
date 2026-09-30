import { Footer } from '../components/common/Footer'
import { Header } from '../components/common/Header'
import { FeatureSummary } from '../components/main/FeatureSummary'
import { FinalCta } from '../components/main/FinalCta'
import { HeroSection } from '../components/main/HeroSection'
import { IssueSection } from '../components/main/IssueSection'
import { ProcessSection } from '../components/main/ProcessSection'
import { RoleEntrySection } from '../components/main/RoleEntrySection'

export function MainPage() {
  return (
    <div className="page">
      <Header />
      <main>
        <HeroSection />
        <RoleEntrySection />
        <FeatureSummary />
        <IssueSection />
        <ProcessSection />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
