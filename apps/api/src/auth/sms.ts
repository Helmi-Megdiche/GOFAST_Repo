import { Logger } from "@nestjs/common";
import { maskPhone } from "@fastgo/domain";
import ar from "@fastgo/i18n/messages/ar.json" with { type: "json" };
import en from "@fastgo/i18n/messages/en.json" with { type: "json" };
import fr from "@fastgo/i18n/messages/fr.json" with { type: "json" };

export abstract class SmsSender {
  abstract send(phone: string, text: string): Promise<void>;
}

/** Sends nothing. Logs a masked phone, never the text (it holds a code). Refused in production by config. */
export class FakeSmsSender extends SmsSender {
  private readonly log = new Logger("FakeSms");
  override async send(phone: string): Promise<void> {
    this.log.log(`sms to ${maskPhone(phone)}`);
  }
}

const templates = { fr: fr.apiSms.code, ar: ar.apiSms.code, en: en.apiSms.code } as const;

export function codeText(locale: string, code: string, minutes: number): string {
  const t = templates[locale as keyof typeof templates] ?? templates.fr;
  return t.replace("{code}", code).replace("{minutes}", String(minutes));
}
