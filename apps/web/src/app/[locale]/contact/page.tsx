import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Container, Icon, Section, type IconName } from "@fastgo/ui";
import { ContactForm } from "@/components/contact/contact-form";
import { localizedMetadata, resolveLocale, type PageParams } from "@/lib/page";

export const generateMetadata = ({ params }: PageParams) =>
  localizedMetadata(params, "/contact", "contact");

/** Contact (FE-06, W07-Contact). Details stay as placeholders until FastGo sends them. */
export default async function ContactPage({ params }: PageParams) {
  await resolveLocale(params);
  const t = await getTranslations("contact");
  const p = await getTranslations("placeholders");

  const details: { icon: IconName; text: string }[] = [
    { icon: "phone", text: p("phone") },
    { icon: "msg", text: p("email") },
    { icon: "pin", text: p("address") },
    { icon: "clock", text: p("supportHours") },
  ];

  return (
    <Section compact>
      <Container className="flex flex-col gap-8 md:flex-row md:gap-12">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <p className="text-eyebrow">{t("eyebrow")}</p>
          <h1 className="text-d2">{t("title")}</h1>
          <p className="text-lead">{t("lead")}</p>
          <ul className="mt-2 flex flex-col gap-4">
            {details.map((detail) => (
              <li key={detail.icon} className="flex items-center gap-2.5">
                <Icon name={detail.icon} className="text-orange-dark" />
                {detail.text}
              </li>
            ))}
          </ul>
        </div>
        <Suspense>
          <ContactForm />
        </Suspense>
      </Container>
    </Section>
  );
}
