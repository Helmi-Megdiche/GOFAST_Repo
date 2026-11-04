"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Container, Icon } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { HeaderNav } from "./header-nav";
import { LocaleSwitcher } from "./locale-switcher";

/**
 * Below 900 px the header keeps the logo and one button. The panel holds the links, the language
 * choice and the two account buttons. Escape closes it and returns the focus to the button.
 */
export function MobileMenu() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div className="ms-auto min-[1100px]:hidden">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? t("closeMenu") : t("openMenu")}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-11 items-center justify-center rounded-md border border-white/40 text-white"
      >
        <Icon name={open ? "x" : "menu"} />
      </button>

      {open ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-40 border-t border-inverse-line bg-inverse shadow-card"
        >
          <Container className="flex flex-col gap-4 py-4">
            <HeaderNav linkClassName="px-3 py-3 text-md" onNavigate={close} />
            <div>
              <LocaleSwitcher variant="on-dark" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Button as={Link} href="/connexion" variant="inverse" onClick={close}>
                {t("signIn")}
              </Button>
              <Button as={Link} href="/commander" onClick={close}>
                {t("order")}
              </Button>
            </div>
          </Container>
        </div>
      ) : null}
    </div>
  );
}
