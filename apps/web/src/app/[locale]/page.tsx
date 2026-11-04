import { HomeHero } from "@/components/home/home-hero";
import {
  CoverageBand,
  MerchantsBand,
  OffersSection,
  PromiseStrip,
  StepsSection,
} from "@/components/home/home-sections";
import { getServiceOffers } from "@/lib/data/services";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) => localizedMetadata(params, "", "home");

/** Home (FE-01). References: Main, Main-AR, Main-EN. */
export default async function HomePage({ params }: PageParams) {
  await resolveLocale(params);
  const { offers } = await getServiceOffers();

  return (
    <>
      <HomeHero />
      <PromiseStrip />
      <OffersSection offers={offers} />
      <StepsSection />
      <MerchantsBand />
      <CoverageBand />
    </>
  );
}
