import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Card, Container, Section } from "@fastgo/ui";

/**
 * The auth screens (W18 to W22): one card on the page background. The forms need JavaScript:
 * without it the card says so (the h1 and the form markup are still in the server HTML).
 */
export function AuthCard({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const t = useTranslations("auth");
  return (
    <Section tone="tint" compact>
      {/* Container has its own max width (cn does not merge classes), so the card width is set inside. */}
      <Container>
        <Card
          className={`mx-auto flex flex-col gap-4 p-6 sm:p-8 ${wide ? "max-w-[600px]" : "max-w-[480px]"}`}
        >
          <noscript>
            <p className="rounded-lg bg-warning-light px-3.5 py-3 text-sm text-alert-warning">
              {t("noJs")}
            </p>
          </noscript>
          {children}
        </Card>
      </Container>
    </Section>
  );
}
