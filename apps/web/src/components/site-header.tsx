import { Logo } from "@fastgo/ui";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";

/** Navy header with the logo and the language switcher. Page navigation arrives with the public site. */
export function SiteHeader() {
  return (
    <header data-inverse className="bg-inverse text-on-inverse">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-2 md:px-6 md:py-3.5">
        <Link href="/" className="rounded-sm">
          <Logo variant="on-dark" className="h-[30px] md:h-[42px]" />
        </Link>
        <LocaleSwitcher variant="on-dark" />
      </div>
    </header>
  );
}
