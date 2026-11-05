import type { ReactNode } from "react";
import { Card, Container, Section } from "@fastgo/ui";

/** The auth screens (W18 to W22): one card on the page background. */
export function AuthCard({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <Section tone="tint" compact>
      {/* Container has its own max width (cn does not merge classes), so the card width is set inside. */}
      <Container>
        <Card
          className={`mx-auto flex flex-col gap-4 p-6 sm:p-8 ${wide ? "max-w-[600px]" : "max-w-[480px]"}`}
        >
          {children}
        </Card>
      </Container>
    </Section>
  );
}
