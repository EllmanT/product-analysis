import { HeroSection } from "@/components/shop/HeroSection";
import { HomepageDataProvider } from "@/components/shop/homepage-data-provider";
import { HomepageSections } from "@/components/shop/HomepageSections";

export default function ShopHomePage() {
  return (
    <HomepageDataProvider>
      <HeroSection />
      <HomepageSections />
    </HomepageDataProvider>
  );
}
