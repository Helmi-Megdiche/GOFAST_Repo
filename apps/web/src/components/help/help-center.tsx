"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Accordion,
  Button,
  Card,
  Chip,
  ChipNav,
  Container,
  Icon,
  Input,
  Section,
} from "@fastgo/ui";
import { PageHero } from "@/components/page-hero";
import { Link } from "@/i18n/navigation";
import type { Faq, FaqQuestionCode, FaqTopic } from "@/lib/data/faq";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Help (FE-05, W06-Aide): search box, topics, questions. Answers not written yet show [RÉPONSE]. */
export function HelpCenter({ faq }: { faq: Faq }) {
  const t = useTranslations("help");
  const p = useTranslations("placeholders");
  const searchId = useId();
  const [topic, setTopic] = useState<FaqTopic>(faq.topics[0]!);
  const [query, setQuery] = useState("");

  const questionOf = (code: FaqQuestionCode) => t(`questions.${code}.q`);
  const answerOf = (code: FaqQuestionCode, answered: boolean) => {
    const key = `questions.${code}.a`;
    return answered && t.has(key as "questions.price.a")
      ? t(key as "questions.price.a")
      : p("answer");
  };

  const search = normalize(query.trim());
  const visible = faq.questions.filter((question) =>
    search
      ? normalize(
          `${questionOf(question.code)} ${answerOf(question.code, question.answered)}`,
        ).includes(search)
      : question.topic === topic,
  );

  return (
    <>
      <PageHero title={t("title")}>
        <div className="relative max-w-[560px]">
          <label htmlFor={searchId} className="sr-only">
            {t("searchLabel")}
          </label>
          <Icon
            name="search"
            className="pointer-events-none absolute inset-y-0 start-3 my-auto text-muted"
          />
          <Input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchLabel")}
            className="ps-10"
          />
        </div>
      </PageHero>

      <Section compact>
        <Container className="flex flex-col gap-8 md:flex-row">
          <ChipNav label={t("topicsLabel")} className="md:w-60 md:shrink-0">
            {faq.topics.map((code) => (
              <Chip
                key={code}
                aria-pressed={!search && code === topic}
                onClick={() => {
                  setQuery("");
                  setTopic(code);
                }}
              >
                {t(`topics.${code}`)}
              </Chip>
            ))}
          </ChipNav>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {visible.length === 0 ? (
              <p role="status" className="text-muted">
                {t("noResult")}
              </p>
            ) : (
              visible.map((question, index) => (
                <Accordion
                  key={question.code}
                  summary={questionOf(question.code)}
                  open={index === 0 && !search ? true : undefined}
                >
                  {answerOf(question.code, question.answered)}
                </Accordion>
              ))
            )}
            <Card tone="flat" className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="font-semibold">{t("notFound.title")}</span>
              <Button as={Link} href="/contact" variant="secondary" size="sm" className="text-sm">
                {t("notFound.cta")}
              </Button>
            </Card>
          </div>
        </Container>
      </Section>
    </>
  );
}
