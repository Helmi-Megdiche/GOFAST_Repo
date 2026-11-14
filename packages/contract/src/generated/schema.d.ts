/**
 * Generated from packages/contract/openapi.yaml by `pnpm --filter @fastgo/contract generate`.
 * Do not edit: change the YAML, then regenerate.
 */

export interface paths {
    "/v1/accounts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign up
         * @description Addition to the cahier. Creates the account and signs it in. The phone must have been verified for the purpose `signUp` (`phone_check_id`). A phone or e-mail that already has an account gives 422 RULE_REFUSED (R101).
         */
        post: operations["createAccount"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The process is up
         * @description Liveness of the process. It reads no database and needs no session. Its answer is an addition to the cahier (decision of 14 Nov 2026).
         */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The signed-in person and their account
         * @description Addition to the cahier (ESP-02).
         */
        get: operations["getMe"];
        put?: never;
        post?: never;
        /**
         * Close the account
         * @description Addition to the cahier. R105: the identity is erased and the accounting records stay. After it every writer scoped by the account refuses it, and the session ends.
         */
        delete: operations["closeMe"];
        options?: never;
        head?: never;
        /**
         * Change name, language or notifications
         * @description Addition to the cahier. R902: the language is saved for the person, not the account, and changes neither orders nor settings. The phone cannot be changed in L1.
         */
        patch: operations["updateMe"];
        trace?: never;
    };
    "/v1/me/addresses": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the saved addresses
         * @description Addition to the cahier (CMD-02, C08). Only the account's own, with no limit on their number.
         */
        get: operations["listAddresses"];
        put?: never;
        /**
         * Save an address
         * @description Addition to the cahier. Only the text is kept, never a zone, the address is checked again when it is used (R201).
         */
        post: operations["createAddress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/me/addresses/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a saved address
         * @description Addition to the cahier. Another account's address answers 404.
         */
        delete: operations["deleteAddress"];
        options?: never;
        head?: never;
        /**
         * Change a saved address
         * @description Addition to the cahier. Another account's address answers 404.
         */
        patch: operations["updateAddress"];
        trace?: never;
    };
    "/v1/me/recipients": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List the saved recipients
         * @description Addition to the cahier (CMD-02, C08). Only the account's own, with no limit on their number.
         */
        get: operations["listRecipients"];
        put?: never;
        /**
         * Save a recipient
         * @description Addition to the cahier. Only the text is kept, never a zone, the address is checked again when it is used (R201).
         */
        post: operations["createRecipient"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/me/recipients/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * Delete a saved recipient
         * @description Addition to the cahier. Another account's recipient answers 404.
         */
        delete: operations["deleteRecipient"];
        options?: never;
        head?: never;
        /**
         * Change a saved recipient
         * @description Addition to the cahier. Another account's recipient answers 404.
         */
        patch: operations["updateRecipient"];
        trace?: never;
    };
    "/v1/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List orders
         * @description A customer or merchant sees their own account's orders. Staff see all of them (Agent, Opérations, Admin; read only for Logistique and Service client). Newest first, cursor pagination.
         */
        get: operations["listOrders"];
        put?: never;
        /**
         * Place an order
         * @description Idempotent (R202). The server refuses a quote that expired (410 QUOTE_EXPIRED), a total that is not the quote's (RV-05), a phone that is not verified, a payment on account without a validated contract (R104) and more parcels than the settings allow. Writes the order, its parcels and the tracking SMS in the outbox in one transaction. The cahier's role list for the route family also names staff; creating an order on behalf of a customer is not in this version.
         */
        post: operations["createOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read one order
         * @description An order of another account answers 404, not 403 (regles.md:153).
         */
        get: operations["getOrder"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/orders/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Cancel an order
         * @description R212. Free before the driver arrived, with a fee after, and after the pickup a claim instead. Replay by state: an order that is already canceled answers 200 again with no new event. Refusals, all with nothing written: 422 RULE_REFUSED `feeRequired` when `accepted_fee` is not the fee that applies now; 409 STATE_CONFLICT with the field `status` and the reason `claimOnly` (after the pickup) or `notCancellable` (a final state).
         */
        post: operations["cancelOrder"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/password-resets": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Set a new password after a verified phone
         * @description Addition to the cahier. The phone must have been verified for the purpose `reset`. The answer is the same whether or not the phone has an account (decision 16).
         */
        post: operations["createPasswordReset"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/phone-checks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Send a verification code by SMS
         * @description R102. The same answer for a known and an unknown phone. The SMS goes through the outbox. Attempts are limited (`TOO_MANY_ATTEMPTS` with `Retry-After`, both for a resend that comes too soon and for too many sends).
         */
        post: operations["createPhoneCheck"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/phone-checks/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Verify the code received by SMS
         * @description A wrong code gives 422 RULE_REFUSED with the field `code`, the reason `wrong`, `expired` or `noCode`, and `details.attempts_left`. Too many wrong codes lock the phone: 429 TOO_MANY_ATTEMPTS with `Retry-After`.
         */
        post: operations["verifyPhoneCheck"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Check the zone and price a delivery
         * @description R201: an address outside the zone is refused before any price is calculated, and so is an address the server cannot confirm. Both answer 422 RULE_REFUSED with `fields` holding one entry per address, `name` `departure` or `arrival`, and `reason` `outOfZone` or `addressUnconfirmed`. This replaces a zone check route (`/v1/zones` is staff only). R204: every price line is kept. R205: the quote is valid for the time in the settings (15 min).
         */
        post: operations["createQuote"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/quotes/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Read a quote
         * @description After its validity the answer is 410 QUOTE_EXPIRED and the customer revalidates a new price (R205).
         */
        get: operations["getQuote"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/services": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * The offers, parcel types and extras
         * @description Addition to the cahier. Read from the settings and price lists; a value GOFAST has not set is null.
         */
        get: operations["listServices"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in with a phone or an e-mail and a password
         * @description Sets the session cookie and answers with the signed-in person. A wrong password and an unknown account give the same 401 (decision 16). Attempts are limited per account and per IP.
         */
        post: operations["createSession"];
        /** Sign out */
        delete: operations["deleteSession"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sessions/google": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in with Google
         * @description For customers and merchants only (R103). A new Google account needs a verified phone (`phone_check_id`); without it the answer is 422 RULE_REFUSED with the field `phone_check_id` and the reason `phoneRequired`. An e-mail that already has an account joins it after a code (R103): the shape of that step is not in the cahier, see the open questions in the PR.
         */
        post: operations["createGoogleSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/tracking/{number}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Follow an order by its tracking number
         * @description Public, with limited attempts. Returns only the allowed fields (R405). An unknown number answers 404; a number that does not have the FG-XXXX-XXXX shape answers 400.
         */
        get: operations["getTracking"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** @description An address as the customer typed or picked it. The server resolves the zone itself (R201); the client never sends one. */
        AddressInput: {
            /** @default  */
            landmark: string;
            pin?: components["schemas"]["Pin"] | null;
            text: string;
        };
        /**
         * @description R212. `none` before the driver arrived; `applies` after (fee from the settings); `backOfficeDecides` after a failed pickup (R505).
         * @enum {string}
         */
        CancelFee: "none" | "applies" | "backOfficeDecides";
        CancelRequest: {
            /** @description The fee the customer saw before cancelling (RV-05). The server compares it with the fee that applies now; a different one gives RULE_REFUSED `feeRequired` with nothing written. */
            accepted_fee: components["schemas"]["CancelFee"];
        };
        /** @description Replay by state (R212). Cancelling an order that is already canceled answers the same, with no new event. */
        CancelResult: {
            fee: components["schemas"]["CancelFee"];
            /** @enum {string} */
            status: "canceled";
        };
        ErrorBody: {
            error: {
                code: components["schemas"]["ErrorCode"];
                fields: components["schemas"]["FieldError"][];
                /** @description In the language of Accept-Language (fr, ar, en; fr when missing or unsupported). */
                message: string;
                /**
                 * @description The request id written in the server logs.
                 * @example 01J9Z6K2M4
                 */
                trace_id: string;
            };
        };
        /**
         * @description The code never changes; the message follows Accept-Language. The first eleven are the cahier's table. INTERNAL_ERROR (500) is an addition, accepted on 14 Nov 2026.
         * @enum {string}
         */
        ErrorCode: "VALIDATION_FAILED" | "AUTH_REQUIRED" | "ACCESS_DENIED" | "SAME_ACTOR" | "NOT_FOUND" | "STATE_CONFLICT" | "KEY_REUSED" | "QUOTE_EXPIRED" | "RULE_REFUSED" | "TOO_MANY_ATTEMPTS" | "PROVIDER_UNAVAILABLE" | "INTERNAL_ERROR";
        FieldError: {
            /** @description Numbers the client may show, for example `attempts_left`. */
            details?: {
                [key: string]: number;
            };
            /**
             * @description Dotted path of the field, for example `sender.phone`.
             * @example departure
             */
            name: string;
            /**
             * @description A short camelCase reason the client maps to its own text, for example `outOfZone`.
             * @example outOfZone
             */
            reason: string;
        };
        /** @enum {string} */
        FreightPayer: "sender" | "recipient";
        GoogleSignInRequest: {
            /** @description The Google ID token. */
            credential: string;
            /** @description Required for a new Google account, whose phone is verified once (R103). */
            phone_check_id?: components["schemas"]["PhoneCheckId"] | null;
        };
        /**
         * @description R901. French is the default.
         * @enum {string}
         */
        Locale: "fr" | "ar" | "en";
        /** @description The signed-in person and their account. Also the answer of every sign-in route. */
        Me: {
            account_id: components["schemas"]["ResourceId"];
            /**
             * @description Merchant contract state (R104). Null for a customer.
             * @enum {string|null}
             */
            contract: "validated" | "pending" | null;
            /** Format: email */
            email: string | null;
            /** @description True while a Google account is linked (R103). */
            google: boolean;
            /** @enum {string} */
            kind: "customer" | "merchant" | "staff";
            locale: components["schemas"]["Locale"];
            name: string | null;
            notifications: components["schemas"]["NotificationPrefs"];
            phone: components["schemas"]["PhoneE164"] | null;
            phone_verified: boolean;
            /** @description Staff or team role (an `x-roles` slug); null for a customer. The cahier does not detail the roles inside a company (regles.md:168), so a merchant gets `admin` or `user`. */
            role: string | null;
            /** @description The person signed in. The account itself for a customer, a team member for a merchant. */
            user_id: components["schemas"]["ResourceId"];
        };
        /** @description R902. Only the fields sent change. The phone is read-only in L1. */
        MeChange: {
            locale?: components["schemas"]["Locale"];
            name?: string;
            notifications?: components["schemas"]["NotificationPrefs"];
        };
        /**
         * @description An amount in millimes (48500 = 48,500 TND). Never a float.
         * @example 48500
         */
        Money: number;
        NotificationPrefs: {
            email: boolean;
            offers: boolean;
            sms: boolean;
        };
        Order: {
            cancel: components["schemas"]["OrderCancelRecord"] | null;
            created_at: components["schemas"]["UtcTimestamp"];
            eta_at: components["schemas"]["UtcTimestamp"] | null;
            freight_payer: components["schemas"]["FreightPayer"];
            id: components["schemas"]["ResourceId"];
            lines: components["schemas"]["PriceLine"][];
            /** @description True whenever a counted parcel is lost. */
            loss_reported: boolean;
            parcels: components["schemas"]["OrderParcel"][];
            payment_mode: components["schemas"]["PaymentMode"];
            recipient: components["schemas"]["OrderParty"];
            sender: components["schemas"]["OrderParty"];
            service: components["schemas"]["ServiceCode"];
            status: components["schemas"]["OrderStatus"];
            total_millimes: components["schemas"]["Money"];
            tracking_number: components["schemas"]["TrackingNumber"];
        };
        OrderCancelRecord: {
            at: components["schemas"]["UtcTimestamp"];
            fee: components["schemas"]["CancelFee"];
        };
        /** @description What "Valider la commande" sends. The server recomputes everything from the quote and the settings (RV-05): `accepted_total_millimes` must equal the total the customer saw, or the answer is QUOTE_EXPIRED (410) or RULE_REFUSED `quoteChanged`. */
        OrderCreate: {
            accepted_total_millimes: components["schemas"]["Money"];
            /**
             * @description R607. True only when the sender accepts the freight-due terms (payment `cashDelivery`).
             * @default false
             */
            freight_payer_accepted: boolean;
            parcel: {
                content: string;
                /** @description The maximum comes from the settings (provisional 10); more gives RULE_REFUSED `tooManyParcels`. */
                count: number;
                declared_value_millimes?: components["schemas"]["Money"] | null;
                /** @default false */
                fragile: boolean;
                type: components["schemas"]["ParcelTypeCode"];
                weight_g: number;
            };
            payment_mode: components["schemas"]["PaymentMode"];
            quote_id: components["schemas"]["ResourceId"];
            recipient: components["schemas"]["OrderRecipientInput"];
            sender: components["schemas"]["OrderSenderInput"];
            service: {
                code: components["schemas"]["ServiceCode"];
                /** @description Delivery window of a scheduled order (no price yet, [PRIX]). */
                slot?: components["schemas"]["TimeWindow"] | null;
            };
            /** @constant */
            terms_accepted: true;
        };
        OrderList: {
            items: components["schemas"]["Order"][];
            /** @description Pass it as `cursor` for the next page. Null on the last page. */
            next_cursor: string | null;
        };
        OrderParcel: {
            attempts: number;
            barcode: string;
            id: components["schemas"]["ResourceId"];
            index: number;
            status: components["schemas"]["ParcelStatus"];
            type: components["schemas"]["ParcelTypeCode"];
            weight_declared_g: number;
        };
        OrderParty: {
            address: string;
            city: string | null;
            name: string;
            /** @description Null for a closed account (R105). */
            phone: components["schemas"]["PhoneE164"] | null;
        };
        OrderRecipientInput: {
            address: components["schemas"]["AddressInput"];
            /** @default  */
            instructions: string;
            name: string;
            phone: components["schemas"]["PhoneE164"];
            /**
             * @description Keep this recipient in the address book once the order exists (CMD-02).
             * @default false
             */
            save: boolean;
            /** @description R903. The language of the SMS sent to the recipient. */
            sms_locale?: components["schemas"]["Locale"];
        };
        /** @description The pickup. `slot` is the window the driver comes in. */
        OrderSenderInput: {
            address: components["schemas"]["AddressInput"];
            name: string;
            phone: components["schemas"]["PhoneE164"];
            slot: components["schemas"]["TimeWindow"];
        };
        /**
         * @description States of the order (docs/spec/regles.md, "États d'une commande").
         * @enum {string}
         */
        OrderStatus: "received" | "confirmed" | "assigned" | "pickup_failed" | "picked_up" | "in_transit" | "delivered" | "partially_delivered" | "returned" | "lost" | "canceled";
        /**
         * @description States of a parcel (docs/spec/regles.md, "États d'un colis").
         * @enum {string}
         */
        ParcelStatus: "to_collect" | "taken" | "at_depot" | "in_transit" | "delivery_failed" | "returning" | "handed_over" | "returned" | "lost" | "canceled";
        /** @enum {string} */
        ParcelTypeCode: "document" | "small" | "medium" | "large";
        PasswordResetRequest: {
            /** Format: password */
            new_password: string;
            phone: components["schemas"]["PhoneE164"];
            phone_check_id: components["schemas"]["PhoneCheckId"];
        };
        /**
         * @description Payment is cash or merchant account (online payment is L3). `account` needs a validated contract (R104).
         * @enum {string}
         */
        PaymentMode: "cashPickup" | "cashDelivery" | "account";
        /**
         * Format: uuid
         * @description Proof that a code was verified for a phone and a purpose. Valid for a short time and used once.
         */
        PhoneCheckId: string;
        /** @enum {string} */
        PhoneCheckPurpose: "order" | "signUp" | "reset" | "googlePhone";
        PhoneCheckRequest: {
            phone: components["schemas"]["PhoneE164"];
            purpose: components["schemas"]["PhoneCheckPurpose"];
        };
        /** @description The answer is the same for a known and an unknown phone (R102, decision 16). */
        PhoneCheckSent: {
            expires_at: components["schemas"]["UtcTimestamp"];
            resend_at: components["schemas"]["UtcTimestamp"];
        };
        PhoneCheckVerified: {
            phone_check_id: components["schemas"]["PhoneCheckId"];
            valid_until: components["schemas"]["UtcTimestamp"];
        };
        PhoneCheckVerifyRequest: {
            /** @description The digits of the SMS code. Their number comes from the settings. */
            code: string;
            phone: components["schemas"]["PhoneE164"];
            purpose: components["schemas"]["PhoneCheckPurpose"];
        };
        /**
         * @description Tunisian phone number in E.164 form.
         * @example +21620123456
         */
        PhoneE164: string;
        /** @description A point on the map, WGS84. `x` is the longitude and `y` the latitude, as in the web mock. */
        Pin: {
            x: number;
            y: number;
        };
        PriceLine: {
            kind: components["schemas"]["PriceLineKind"];
            /** @description Null while GOFAST has not confirmed the line (vat and stamp, see reponses-gofast.md). */
            millimes: components["schemas"]["Money"] | null;
        };
        /**
         * @description R204. Every kind is always present in a quote, even at 0.
         * @enum {string}
         */
        PriceLineKind: "base" | "distance" | "weight" | "options" | "surcharge" | "discount" | "vat" | "stamp";
        /** @description R405. The allowlist of what anyone holding the number may see: no name, phone, address, driver, position or handover code. */
        PublicTracking: {
            eta_at: components["schemas"]["UtcTimestamp"] | null;
            from_city: string | null;
            /** @description The order's own events, oldest first. */
            history: {
                at: components["schemas"]["UtcTimestamp"];
                status: components["schemas"]["OrderStatus"];
            }[];
            /** @description Counted parcels; canceled ones are left out. */
            parcel_count: number;
            parcel_outcomes: components["schemas"]["ParcelStatus"][];
            status: components["schemas"]["OrderStatus"];
            to_city: string | null;
        };
        /** @description R204 and R205. Valid for the time in the settings (15 min), then recalculated and revalidated. */
        Quote: {
            expires_at: components["schemas"]["UtcTimestamp"];
            fragile: boolean;
            id: components["schemas"]["ResourceId"];
            /** @description One entry per PriceLineKind, in the order of R204. */
            lines: components["schemas"]["PriceLine"][];
            parcel_type: components["schemas"]["ParcelTypeCode"];
            quoted_at: components["schemas"]["UtcTimestamp"];
            service: components["schemas"]["ServiceCode"];
            surcharge: null | {
                ceiling_millimes: components["schemas"]["Money"] | null;
                /** @enum {string} */
                code: "rain";
            };
            /** @description Sum of the lines that have a value. Whether it includes vat and stamp is open (TTC or HT). */
            total_millimes: components["schemas"]["Money"];
            weight_g: number;
        };
        QuoteRequest: {
            arrival: components["schemas"]["AddressInput"];
            declared_value_millimes?: components["schemas"]["Money"] | null;
            departure: components["schemas"]["AddressInput"];
            /** @default false */
            fragile: boolean;
            parcel_type: components["schemas"]["ParcelTypeCode"];
            service: components["schemas"]["ServiceCode"];
            /** @description Declared weight of one parcel, in grams. */
            weight_g: number;
        };
        /** Format: uuid */
        ResourceId: string;
        SavedAddress: {
            id: components["schemas"]["ResourceId"];
            label: string;
            landmark: string;
            text: string;
        };
        SavedAddressInput: {
            label: string;
            /** @default  */
            landmark: string;
            text: string;
        };
        SavedRecipient: {
            address: string;
            id: components["schemas"]["ResourceId"];
            landmark: string;
            /** @description R903. The language of the SMS and the link this recipient gets. */
            locale: components["schemas"]["Locale"];
            name: string;
            phone: components["schemas"]["PhoneE164"];
        };
        SavedRecipientInput: {
            address: string;
            /** @default  */
            landmark: string;
            locale?: components["schemas"]["Locale"];
            name: string;
            phone: components["schemas"]["PhoneE164"];
        };
        /** @description Prices, cut-off times, limits and fees are null until GOFAST sets them; the pages then show the placeholder ([PRIX], [HEURE], [LIMITE], [TARIF]). Nothing is invented. */
        ServiceCatalog: {
            extras: {
                /** @enum {string} */
                code: "fragile" | "declaredValue" | "retry" | "return";
                fee_millimes: components["schemas"]["Money"] | null;
            }[];
            offers: {
                code: components["schemas"]["ServiceCode"];
                /** @description Local time of day, HH:MM, Africa/Tunis. */
                cutoff_time: string | null;
                from_price_millimes: components["schemas"]["Money"] | null;
            }[];
            parcel_types: {
                code: components["schemas"]["ParcelTypeCode"];
                limit: string | null;
            }[];
        };
        /** @enum {string} */
        ServiceCode: "express" | "standard" | "scheduled";
        SignInRequest: {
            /** @description A phone number or an e-mail address. */
            identifier: string;
            /** Format: password */
            password: string;
        };
        SignUpRequest: {
            /** Format: email */
            email?: string | null;
            /** @enum {string} */
            kind: "customer" | "merchant";
            locale: components["schemas"]["Locale"];
            name: string;
            /**
             * Format: password
             * @description The minimum length is checked from the settings; a short one gives RULE_REFUSED `passwordTooShort`.
             */
            password: string;
            phone: components["schemas"]["PhoneE164"];
            phone_check_id: components["schemas"]["PhoneCheckId"];
            /** @constant */
            terms_accepted: true;
        };
        /** @description A pickup window, as two UTC instants (R503 lists the windows GOFAST offers). */
        TimeWindow: {
            end_at: components["schemas"]["UtcTimestamp"];
            start_at: components["schemas"]["UtcTimestamp"];
        };
        /**
         * @description R203. The cahier gives the FG-XXXX-XXXX shape and no alphabet; letters and digits are an assumption shared with apps/web.
         * @example FG-7K4M-2QXP
         */
        TrackingNumber: string;
        /**
         * Format: date-time
         * @description An instant in UTC. The client shows it in Africa/Tunis.
         * @example 2026-11-20T09:30:00Z
         */
        UtcTimestamp: string;
    };
    responses: {
        /** @description 403 ACCESS_DENIED. The role lacks the right. */
        AccessDenied: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 401 AUTH_REQUIRED. The session is missing or expired, or the sign-in credentials are wrong. */
        AuthRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 500 INTERNAL_ERROR. Nothing else is said (addition, accepted 14 Nov 2026). */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 409 KEY_REUSED. The Idempotency-Key was already used with other content. */
        KeyReused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 404 NOT_FOUND. The resource is missing or belongs to someone else (regles.md:153). */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 503 PROVIDER_UNAVAILABLE. An outside service is down; retry. */
        ProviderUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 410 QUOTE_EXPIRED. The price is to be revalidated (R205). */
        QuoteExpired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 422 RULE_REFUSED. A business rule is not met; `fields` gives the reason. */
        RuleRefused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 409 STATE_CONFLICT. The state change is not allowed. */
        StateConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 429 TOO_MANY_ATTEMPTS. The attempt limit is reached. */
        TooManyAttempts: {
            headers: {
                /** @description Seconds before the next attempt. */
                "Retry-After"?: number;
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
        /** @description 400 VALIDATION_FAILED. A field is missing or invalid; `fields` says which. */
        ValidationFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorBody"];
            };
        };
    };
    parameters: {
        AddressId: string;
        /** @description The `next_cursor` of the previous page. */
        Cursor: string;
        /** @description A UUID chosen by the client for one attempt. Kept 24 h with a fingerprint of the request. Same key and same content returns the first answer and does nothing again (R202). Same key and other content gives 409 KEY_REUSED. A second call that arrives while the first is running waits for it and gets the same answer. */
        IdempotencyKey: string;
        /** @description Page size. Default 20, maximum 100 (provisional, from the settings). */
        Limit: number;
        OrderId: string;
        QuoteId: string;
        RecipientId: string;
        TrackingNumberPath: components["schemas"]["TrackingNumber"];
    };
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    createAccount: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignUpRequest"];
            };
        };
        responses: {
            /** @description The account exists and is signed in. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            422: components["responses"]["RuleRefused"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The process is up. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ok";
                    };
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    getMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The profile. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            401: components["responses"]["AuthRequired"];
            500: components["responses"]["InternalError"];
        };
    };
    closeMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The account is closed. Closing it again answers 204. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    updateMe: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["MeChange"];
            };
        };
        responses: {
            /** @description The profile after the change. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    listAddresses: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The saved addresses. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedAddress"][];
                };
            };
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    createAddress: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedAddressInput"];
            };
        };
        responses: {
            /** @description Saved. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedAddress"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteAddress: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["AddressId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Deleted. Deleting it again answers 204. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    updateAddress: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["AddressId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedAddressInput"];
            };
        };
        responses: {
            /** @description Saved. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedAddress"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    listRecipients: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The saved recipients. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedRecipient"][];
                };
            };
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    createRecipient: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedRecipientInput"];
            };
        };
        responses: {
            /** @description Saved. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedRecipient"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteRecipient: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["RecipientId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Deleted. Deleting it again answers 204. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    updateRecipient: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["RecipientId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SavedRecipientInput"];
            };
        };
        responses: {
            /** @description Saved. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SavedRecipient"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    listOrders: {
        parameters: {
            query?: {
                /** @description The `next_cursor` of the previous page. */
                cursor?: components["parameters"]["Cursor"];
                /** @description First creation date to keep, a UTC date. */
                from?: string;
                /** @description Page size. Default 20, maximum 100 (provisional, from the settings). */
                limit?: components["parameters"]["Limit"];
                /** @description Repeatable. Keeps the orders in any of these states. */
                status?: components["schemas"]["OrderStatus"][];
                /** @description Last creation date to keep, a UTC date. */
                to?: string;
                /** @description Exact tracking number. */
                tracking?: components["schemas"]["TrackingNumber"];
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description One page. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["OrderList"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            500: components["responses"]["InternalError"];
        };
    };
    createOrder: {
        parameters: {
            query?: never;
            header: {
                /** @description A UUID chosen by the client for one attempt. Kept 24 h with a fingerprint of the request. Same key and same content returns the first answer and does nothing again (R202). Same key and other content gives 409 KEY_REUSED. A second call that arrives while the first is running waits for it and gets the same answer. */
                "Idempotency-Key": components["parameters"]["IdempotencyKey"];
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["OrderCreate"];
            };
        };
        responses: {
            /** @description The order exists. A replay with the same key and content answers 201 with the same body. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            409: components["responses"]["KeyReused"];
            410: components["responses"]["QuoteExpired"];
            422: components["responses"]["RuleRefused"];
            500: components["responses"]["InternalError"];
        };
    };
    getOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["OrderId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The order. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Order"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            404: components["responses"]["NotFound"];
            500: components["responses"]["InternalError"];
        };
    };
    cancelOrder: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["OrderId"];
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["CancelRequest"];
            };
        };
        responses: {
            /** @description The order is canceled. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CancelResult"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            403: components["responses"]["AccessDenied"];
            404: components["responses"]["NotFound"];
            409: components["responses"]["StateConflict"];
            422: components["responses"]["RuleRefused"];
            500: components["responses"]["InternalError"];
        };
    };
    createPasswordReset: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PasswordResetRequest"];
            };
        };
        responses: {
            /** @description Done. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            400: components["responses"]["ValidationFailed"];
            422: components["responses"]["RuleRefused"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
    createPhoneCheck: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PhoneCheckRequest"];
            };
        };
        responses: {
            /** @description A code was sent. */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhoneCheckSent"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ProviderUnavailable"];
        };
    };
    verifyPhoneCheck: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PhoneCheckVerifyRequest"];
            };
        };
        responses: {
            /** @description The code is right. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PhoneCheckVerified"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            422: components["responses"]["RuleRefused"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
    createQuote: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["QuoteRequest"];
            };
        };
        responses: {
            /** @description The price. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Quote"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            422: components["responses"]["RuleRefused"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
    getQuote: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: components["parameters"]["QuoteId"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The quote. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Quote"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            404: components["responses"]["NotFound"];
            410: components["responses"]["QuoteExpired"];
            500: components["responses"]["InternalError"];
        };
    };
    listServices: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The catalog. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ServiceCatalog"];
                };
            };
            500: components["responses"]["InternalError"];
        };
    };
    createSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SignInRequest"];
            };
        };
        responses: {
            /** @description Signed in. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
    deleteSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Signed out. The session is removed from Redis. */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            401: components["responses"]["AuthRequired"];
            500: components["responses"]["InternalError"];
        };
    };
    createGoogleSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GoogleSignInRequest"];
            };
        };
        responses: {
            /** @description Signed in. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Me"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            401: components["responses"]["AuthRequired"];
            422: components["responses"]["RuleRefused"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ProviderUnavailable"];
        };
    };
    getTracking: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                number: components["parameters"]["TrackingNumberPath"];
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description The public tracking. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PublicTracking"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            404: components["responses"]["NotFound"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
}
