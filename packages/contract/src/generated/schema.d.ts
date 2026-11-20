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
         * @description Addition to the cahier. Creates the account and signs it in. The phone must have been verified for the purpose `signUp` (`phone_check_id`), which is checked first. A phone or e-mail that already has an account gives 422 RULE_REFUSED with the field `phone` or `email` and the reason `phoneTaken` or `emailTaken` (R101). A refused sign-up uses up its `phone_check_id`, and sign-up attempts are limited (429 TOO_MANY_ATTEMPTS, provisional value), so one verified phone cannot probe e-mails.
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
         * @description Addition to the cahier. R105: the identity is erased (name, phone, e-mail, the saved addresses and the saved recipients, and the name and address on the orders, which then read null) and the accounting records stay. The stored response of an idempotent call is purged with it (RV-18). After it every writer scoped by the account refuses it, and the session ends.
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
         * @description Idempotent (R202). The server refuses a quote that expired (410 QUOTE_EXPIRED), a total that is not the quote's (RV-05), a phone that is not verified, a payment on account without a validated contract (R104) and more parcels than the settings allow. An unknown `quote_id` answers 404 NOT_FOUND; an unverified phone answers 422 RULE_REFUSED `phoneRequired` (field `phone_check_id`). The 422 reasons are `quoteChanged` (the grid or `accepted_total_millimes` moved, RV-05), `phoneRequired`, `contractRequired` (payment `account`, until contracts exist), `addressMismatch` (an address is not the quoted one), `tooManyParcels`, `freightPayerRequired` (`cashDelivery` without the R607 acceptance) and `slotInvalid` (field `service.slot` or `sender.slot`: `scheduled` with no slot, a slot for another service, a window that ends before it starts, a pickup window already over; checked before the phone proof is spent), and `invalid` on `phone_check_id` for a spent or wrong proof. A proof for `sender.phone` lets the order through; the account is marked verified only when that phone is the account's phone. Writes the order, its parcels and the tracking SMS in the outbox in one transaction. The cahier's role list for the route family also names staff; creating an order on behalf of a customer is not in this version.
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
    "/v1/orders/{id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Confirm an order that waits for an agent
         * @description R209, D8. The system confirms an order by itself only for a verified customer under the amount set in the settings; an agent confirms the others. Replay by state: an order that is already confirmed answers 200 again with no new event. An order that is not waiting for confirmation (for example canceled) answers 409 STATE_CONFLICT with the field `status` and the reason `notWaitingForConfirmation`.
         */
        post: operations["confirmOrder"];
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
         * @description Addition to the cahier. The phone must have been verified for the purpose `reset`. The answer is the same whether or not the phone has an account (so it does not tell whether one exists; a choice of this contract, not a rule of the cahier).
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
         * @description R201: an address outside the zone is refused before any price is calculated, and so is an address the server cannot confirm (no pin and no picked `zone_id`). Both answer 422 RULE_REFUSED with `fields` holding one entry per address, `name` `departure` or `arrival`, and `reason` `outOfZone` or `addressUnconfirmed`. `POST /v1/zone-checks` answers the same question without a price (`/v1/zones` is staff only). R204: every price line is kept. R205: the quote is valid for the time in the settings (15 min).
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
         * @description Sets the session cookie and answers with the signed-in person. A wrong password and an unknown account give the same 401 AUTH_REQUIRED with `fields: [{ name: identifier, reason: invalidCredentials }]`, so the answer does not tell whether an account exists (a choice of this contract, not a rule of the cahier). Attempts are limited per account and per IP. A staff account (any role of the back-office) is refused here, whatever its password: it signs in with a second factor on `POST /v1/staff/sessions` and gets the same 401 `invalidCredentials` here (T60).
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
         * @description R103. Public, because the caller has no session yet; the handler refuses a driver or an internal account (403 ACCESS_DENIED), as the cahier lists Particulier and Commerçant only. A new Google account needs a verified phone (`phone_check_id`); without it the answer is 422 RULE_REFUSED with the field `phone_check_id` and the reason `phoneRequired`. A Google e-mail that already has an account joins it after a code sent by SMS to the phone stored on that account. The first call answers 422 RULE_REFUSED with `fields: [{ name: credential, reason: linkCodeRequired }]` and sends the code. The client calls again with the same `credential` and the `link_code`. A wrong code answers 422 RULE_REFUSED with `fields: [{ name: link_code, reason: wrong, details: { attempts_left } }]`; when no attempt is left, 429 TOO_MANY_ATTEMPTS.
         */
        post: operations["createGoogleSession"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/staff/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Sign in to the back-office with a second factor
         * @description T60, cahier p.54: the internal teams sign in with a second factor. Sets the session cookie (12 hours, not sliding) and answers with the signed-in person. A wrong password, an unknown account, a customer or a merchant, an account with no second factor enrolled, a closed account, a wrong code, a code outside the window and a code already used all give the same 401 AUTH_REQUIRED with `fields: [{ name: identifier, reason: invalidCredentials }]`, so the answer tells nothing more than a wrong password does. Attempts are limited per account and per IP (429 with `Retry-After`).
         */
        post: operations["createStaffSession"];
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
         * @description Public, with limited attempts. Returns only the allowed fields (R405). An unknown number answers 404; a number that does not have the FG-XXXX-XXXX shape answers 400. Both count as a miss, and every call counts in the 120 a minute of the IP (T11). `from_city` and `to_city` are the names of the délégations in the language of the `Accept-Language` header (fr when missing).
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
    "/v1/zone-checks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Is this point or délégation served?
         * @description Addition to the cahier. R201: answers from a pin or from a picked délégation, never both. The answer never carries a polygon. Out of zone is a normal answer (200 `out_of_zone`, `reason` `outOfZone`), not an error. Attempts are limited per IP (`TOO_MANY_ATTEMPTS`).
         */
        post: operations["createZoneCheck"];
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
        /** @description The body of a ACCESS_DENIED answer. The code is fixed by the status. */
        AccessDeniedBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "ACCESS_DENIED";
            };
        };
        /** @description An address as the customer typed or picked it. The server resolves the zone itself (R201). The client may send the délégation it picked from the list (`zone_id`); if a pin is sent too, the pin decides the zone. */
        AddressInput: {
            /** @default  */
            landmark: string;
            pin?: components["schemas"]["Pin"] | null;
            text: string;
            /** @description The délégation picked from the list (`zones` of the catalog). Optional. */
            zone_id?: components["schemas"]["ResourceId"];
        };
        /** @description One line of the price. `millimes` is `unit_millimes` times `count`, except for `weight` when the parcels differ: `unit_millimes` is then null and `millimes` is the sum of each parcel's own price. `millimes` is null while GOFAST has not confirmed the line (vat and stamp, see reponses-gofast.md). `base`, `weight` and `options` are per parcel (`count` is the number of parcels; `unit_millimes` is null for `weight` when the parcels differ). `distance`, `surcharge` and `stamp` are once per order (`count` is 1). `vat` is unchanged: null until the accountant confirms. */
        AmountLine: {
            /** @description The number of parcels for a per-parcel line; 1 for a once-per-order line. */
            count: number;
            /** @enum {string} */
            kind: "base" | "distance" | "weight" | "options" | "packaging" | "surcharge" | "vat" | "stamp";
            millimes: components["schemas"]["Money"] | null;
            /** @description Price of one unit: one parcel for `base`, `weight` and `options`, the whole line for `distance`, `surcharge`, `vat` and `stamp` (`count` is 1). Null when the parcels differ (`weight`) or while the line is not confirmed. */
            unit_millimes: components["schemas"]["Money"] | null;
        };
        /** @description The body of a AUTH_REQUIRED answer. The code is fixed by the status. */
        AuthRequiredBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "AUTH_REQUIRED";
            };
        };
        /**
         * @description R212. `none` before the driver arrived; `applies` after (fee from the settings); `backOfficeDecides` after a failed pickup (R505).
         * @enum {string}
         */
        CancelFee: "none" | "applies" | "backOfficeDecides";
        CancelRequest: {
            /** @description The fee the customer saw before cancelling (RV-05). The server compares it with the fee that applies now; a different one gives RULE_REFUSED `feeRequired` with nothing written. For staff (agent, operations, logistics, admin) it is the fee they choose to record: `none` (the default, free) or the fee that applies now; any other value gives `feeRequired`. The choice is recorded with the staff member's id. */
            accepted_fee: components["schemas"]["CancelFee"];
        };
        /** @description Replay by state (R212). Cancelling an order that is already canceled answers the same, with no new event. */
        CancelResult: {
            fee: components["schemas"]["CancelFee"];
            /** @enum {string} */
            status: "canceled";
        };
        /** @description A discount line. Its amounts are negative or zero, the only ones that may be. */
        DiscountLine: {
            count: number;
            /** @constant */
            kind: "discount";
            millimes: components["schemas"]["DiscountMillimes"];
            unit_millimes: components["schemas"]["DiscountMillimes"];
        };
        /**
         * @description A discount in millimes. It is negative or zero, as in the web mock. It is the only amount that may be negative, and only on a line of kind `discount`.
         * @example -1500
         */
        DiscountMillimes: number;
        /**
         * @description The code never changes; the message follows Accept-Language. The first eleven are the cahier's table. INTERNAL_ERROR (500) is an addition, accepted on 14 Nov 2026.
         * @enum {string}
         */
        ErrorCode: "VALIDATION_FAILED" | "AUTH_REQUIRED" | "ACCESS_DENIED" | "SAME_ACTOR" | "NOT_FOUND" | "STATE_CONFLICT" | "KEY_REUSED" | "QUOTE_EXPIRED" | "RULE_REFUSED" | "TOO_MANY_ATTEMPTS" | "PROVIDER_UNAVAILABLE" | "INTERNAL_ERROR";
        /** @description The content of every error. Each response pins its own code (see the *Body schemas). */
        ErrorInfo: {
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
            /** @description The code sent by SMS to the stored phone when the Google e-mail already has an account (R103). Absent on the first call. */
            link_code?: string | null;
            /** @description Required for a new Google account, whose phone is verified once (R103). */
            phone_check_id?: components["schemas"]["PhoneCheckId"] | null;
        };
        /** @description The body of a INTERNAL_ERROR answer. The code is fixed by the status. */
        InternalErrorBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "INTERNAL_ERROR";
            };
        };
        /** @description The body of a KEY_REUSED answer. The code is fixed by the status. */
        KeyReusedBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "KEY_REUSED";
            };
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
        /** @description The body of a NOT_FOUND answer. The code is fixed by the status. */
        NotFoundBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "NOT_FOUND";
            };
        };
        NotificationPrefs: {
            email: boolean;
            offers: boolean;
            sms: boolean;
        };
        Order: {
            /** @description True when an address of the quote had no pin (R201). The order stays `received` until an agent checks it, and is never confirmed automatically. */
            address_unconfirmed: boolean;
            /** @description The délégation of the delivery address, copied from the quote. */
            arrival: components["schemas"]["QuoteZone"];
            cancel: components["schemas"]["OrderCancelRecord"] | null;
            created_at: components["schemas"]["UtcTimestamp"];
            /** @description The délégation of the pickup address, copied from the quote. */
            departure: components["schemas"]["QuoteZone"];
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
                declared_value_millimes?: components["schemas"]["Money"] | null;
                /** @default false */
                fragile: boolean;
                /**
                 * @description GOFAST packaging, as in the quote.
                 * @default false
                 */
                packaging: boolean;
                /** @description Must be the `parcels` of the quote (same number, same weights). The maximum number comes from the settings (provisional 10); more gives RULE_REFUSED `tooManyParcels`. */
                parcels: components["schemas"]["QuoteParcels"];
                type: components["schemas"]["ParcelTypeCode"];
            };
            payment_mode: components["schemas"]["PaymentMode"];
            /** @description Proof that the sender's phone was verified for the purpose `order` (R102). Needed only while that phone is not verified on the account; without it the answer is 422 RULE_REFUSED with the field `phone_check_id` and the reason `phoneRequired`. Used once. */
            phone_check_id?: components["schemas"]["PhoneCheckId"] | null;
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
            /** @description Null once the account is closed (R105). */
            address: string | null;
            city: string | null;
            /** @description Null once the account is closed (R105). */
            name: string | null;
            /** @description Null once the account is closed (R105). */
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
        /** @description The answer is the same for a known and an unknown phone (R102), so it does not tell whether the phone has an account (a choice of this contract, not a rule of the cahier). */
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
        /** @description Only a `discount` line may be negative. */
        PriceLine: components["schemas"]["AmountLine"] | components["schemas"]["DiscountLine"];
        /** @description The body of a PROVIDER_UNAVAILABLE answer. The code is fixed by the status. */
        ProviderUnavailableBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "PROVIDER_UNAVAILABLE";
            };
        };
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
            /** @description Null while the tax basis or the VAT is unknown. */
            amount_ht_millimes: components["schemas"]["Money"] | null;
            /** @description Null while the tax basis or the VAT is unknown. */
            amount_ttc_millimes: components["schemas"]["Money"] | null;
            /** @description R204 (offre et zone), the délégation of the arrival address. The price is read for THIS zone: a price list of the zone beats the default. */
            arrival: components["schemas"]["QuoteZone"];
            /** @description True when the arrival address came with a pin. */
            arrival_pinned: boolean;
            /** @description R204 (offre et zone), the délégation of the departure address. */
            departure: components["schemas"]["QuoteZone"];
            /** @description True when the departure address came with a pin. Without one the order stays "à confirmer" (#22). */
            departure_pinned: boolean;
            expires_at: components["schemas"]["UtcTimestamp"];
            fragile: boolean;
            id: components["schemas"]["ResourceId"];
            /** @description R204. One entry for each of base, distance, weight, options, packaging, surcharge, discount, vat and stamp, in that order, even at 0. */
            lines: components["schemas"]["PriceLine"][];
            packaging: boolean;
            parcel_type: components["schemas"]["ParcelTypeCode"];
            parcels: components["schemas"]["QuoteParcels"];
            quoted_at: components["schemas"]["UtcTimestamp"];
            service: components["schemas"]["ServiceCode"];
            surcharge: null | {
                ceiling_millimes: components["schemas"]["Money"] | null;
                /** @enum {string} */
                code: "rain";
            };
            /** @description Whether the prices are TTC or HT. Null while the admin has not set it (the current state). */
            tax_basis: ("ttc" | "ht") | null;
            /** @description Sum (all parcels) of the lines that have a value. Whether it includes vat and stamp is open (TTC or HT). */
            total_millimes: components["schemas"]["Money"];
        };
        /** @description The body of a QUOTE_EXPIRED answer. The code is fixed by the status. */
        QuoteExpiredBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "QUOTE_EXPIRED";
            };
        };
        QuoteParcels: {
            /** @description Declared weight of this parcel, in grams. */
            weight_g: number;
        }[];
        QuoteRequest: {
            arrival: components["schemas"]["AddressInput"];
            declared_value_millimes?: components["schemas"]["Money"] | null;
            departure: components["schemas"]["AddressInput"];
            /** @default false */
            fragile: boolean;
            /**
             * @description GOFAST packaging (reponses-gofast.md), for every parcel. Its price is in the `packaging` line.
             * @default false
             */
            packaging: boolean;
            parcel_type: components["schemas"]["ParcelTypeCode"];
            /** @description One entry for each parcel, with its own weight (2 kg are included in the base price of each parcel). The maximum number (provisional 10) comes from the settings; more gives RULE_REFUSED `tooManyParcels` (so the schema sets no upper bound). */
            parcels: components["schemas"]["QuoteParcels"];
            service: components["schemas"]["ServiceCode"];
        };
        /** @description The délégation of an address of a quote. Only the id is stored; the name (French) is read from the zone. */
        QuoteZone: {
            zone_id: components["schemas"]["ResourceId"];
            zone_name: string;
        };
        /** Format: uuid */
        ResourceId: string;
        /** @description The body of a RULE_REFUSED answer. The code is fixed by the status. */
        RuleRefusedBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "RULE_REFUSED";
            };
        };
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
                /** @description Added per parcel when the customer asks for GOFAST packaging. Null while not set. */
                packaging_price_millimes: components["schemas"]["Money"] | null;
            }[];
            parcel_types: {
                code: components["schemas"]["ParcelTypeCode"];
                limit: string | null;
            }[];
            /** @description The active délégations, for the picker. Never a polygon. */
            zones: {
                governorate: string;
                id: components["schemas"]["ResourceId"];
                /** @description The name in French, the one a zone check and a quote return. */
                name: string;
                /** @description The name in Arabic (OpenStreetMap name:ar). */
                name_ar: string;
                /** @description The name in English (OpenStreetMap name:en, else the French name). */
                name_en: string;
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
        /** @description The back-office sign-in (T60): the e-mail or phone, the password and the 6 digits of the authenticator app. */
        StaffSignInRequest: {
            /** @description The 6 digits of the authenticator app (TOTP, 30 s). */
            code: string;
            /** @description The staff member's e-mail address or phone number. */
            identifier: string;
            /** Format: password */
            password: string;
        };
        /** @description The body of a STATE_CONFLICT answer. The code is fixed by the status. */
        StateConflictBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "STATE_CONFLICT";
            };
        };
        /** @description A pickup window, as two UTC instants (R503 lists the windows GOFAST offers). */
        TimeWindow: {
            end_at: components["schemas"]["UtcTimestamp"];
            start_at: components["schemas"]["UtcTimestamp"];
        };
        /** @description The body of a TOO_MANY_ATTEMPTS answer. The code is fixed by the status. */
        TooManyAttemptsBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "TOO_MANY_ATTEMPTS";
            };
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
        /** @description The body of a VALIDATION_FAILED answer. The code is fixed by the status. */
        ValidationFailedBody: {
            error: components["schemas"]["ErrorInfo"] & {
                /** @constant */
                code?: "VALIDATION_FAILED";
            };
        };
        /** @description R201. `zone_id` and `zone_name` are null when out of zone, and then `services` is empty and `reason` is `outOfZone` (an `apiErrors` key in fr, ar and en). */
        ZoneCheck: {
            reason: "outOfZone" | null;
            services: components["schemas"]["ServiceCode"][];
            /** @enum {string} */
            status: "in_zone" | "out_of_zone";
            zone_id: components["schemas"]["ResourceId"] | null;
            zone_name: string | null;
        };
        /** @description Exactly one of `pin` or `zone_id`. */
        ZoneCheckRequest: {
            pin: components["schemas"]["Pin"];
        } | {
            zone_id: components["schemas"]["ResourceId"];
        };
    };
    responses: {
        /** @description 403 ACCESS_DENIED. The role lacks the right. */
        AccessDenied: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AccessDeniedBody"];
            };
        };
        /** @description 401 AUTH_REQUIRED. The session is missing or expired, or the sign-in credentials are wrong. */
        AuthRequired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["AuthRequiredBody"];
            };
        };
        /** @description 500 INTERNAL_ERROR. Nothing else is said (addition, accepted 14 Nov 2026). */
        InternalError: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["InternalErrorBody"];
            };
        };
        /** @description 409 KEY_REUSED. The Idempotency-Key was already used with other content. */
        KeyReused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["KeyReusedBody"];
            };
        };
        /** @description 404 NOT_FOUND. The resource is missing or belongs to someone else (regles.md:153). */
        NotFound: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["NotFoundBody"];
            };
        };
        /** @description 503 PROVIDER_UNAVAILABLE. An outside service is down; retry. */
        ProviderUnavailable: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ProviderUnavailableBody"];
            };
        };
        /** @description 410 QUOTE_EXPIRED. The price is to be revalidated (R205). */
        QuoteExpired: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["QuoteExpiredBody"];
            };
        };
        /** @description 422 RULE_REFUSED. A business rule is not met; `fields` gives the reason. */
        RuleRefused: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["RuleRefusedBody"];
            };
        };
        /** @description 409 STATE_CONFLICT. The state change is not allowed. */
        StateConflict: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["StateConflictBody"];
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
                "application/json": components["schemas"]["TooManyAttemptsBody"];
            };
        };
        /** @description 400 VALIDATION_FAILED. A field is missing or invalid; `fields` says which. */
        ValidationFailed: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ValidationFailedBody"];
            };
        };
    };
    parameters: {
        AddressId: string;
        /** @description The `next_cursor` of the previous page. */
        Cursor: string;
        /** @description A UUID chosen by the client for one attempt. Kept 24 h with a fingerprint of the request. Same key and same content returns the first answer and does nothing again (R202). Same key and other content gives 409 KEY_REUSED. A second call that arrives while the first is running waits for it and gets the same answer. */
        IdempotencyKey: string;
        /** @description Page size. Default 20, maximum 100. Both are provisional values of the settings; the schema keeps the provisional maximum. */
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
            403: components["responses"]["AccessDenied"];
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
                /** @description Page size. Default 20, maximum 100. Both are provisional values of the settings; the schema keeps the provisional maximum. */
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
            404: components["responses"]["NotFound"];
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
    confirmOrder: {
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
            /** @description The order is confirmed. */
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
            409: components["responses"]["StateConflict"];
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
            403: components["responses"]["AccessDenied"];
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
            403: components["responses"]["AccessDenied"];
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
            403: components["responses"]["AccessDenied"];
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
            403: components["responses"]["AccessDenied"];
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
            403: components["responses"]["AccessDenied"];
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
            403: components["responses"]["AccessDenied"];
            422: components["responses"]["RuleRefused"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
            503: components["responses"]["ProviderUnavailable"];
        };
    };
    createStaffSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["StaffSignInRequest"];
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
    createZoneCheck: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ZoneCheckRequest"];
            };
        };
        responses: {
            /** @description The zone and the services offered there. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ZoneCheck"];
                };
            };
            400: components["responses"]["ValidationFailed"];
            429: components["responses"]["TooManyAttempts"];
            500: components["responses"]["InternalError"];
        };
    };
}
