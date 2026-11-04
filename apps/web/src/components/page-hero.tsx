import type { ReactNode } from "react";
import { Container, Section, cn } from "@fastgo/ui";

/** Dark band that opens an inner page: optional eyebrow, the h1, an optional lead and extra content. */
export function PageHero({
  eyebrow,
  title,
  lead,
  size = "d2",
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  size?: "d1" | "d2";
  children?: ReactNode;
}) {
  return (
    <Section tone="dark" compact>
      <Container className="flex flex-col gap-4">
        {eyebrow ? <p className="text-eyebrow text-accent-on-inverse!">{eyebrow}</p> : null}
        <h1 className={cn("max-w-[720px]", size === "d1" ? "text-d1-md" : "text-d2")}>{title}</h1>
        {lead ? <p className="text-lead text-on-inverse-muted!">{lead}</p> : null}
        {children}
      </Container>
    </Section>
  );
}
