// PROD MIGRATION NOTE: two new values are added to an existing Postgres enum.
// Do NOT use synchronize in production. Run instead:
//   ALTER TYPE payment_failurereason_enum ADD VALUE IF NOT EXISTS 'ORDER_CANCELLED';
//   ALTER TYPE payment_failurereason_enum ADD VALUE IF NOT EXISTS 'STAFF_CANCEL';
// (ALTER TYPE ADD VALUE cannot run inside a transaction block in Postgres <12.)

export enum PaymentCancellationReason {
  // ── Stripe / provider reasons (set by webhook handlers) ─────────────────
  CHECKOUT_SESSION_EXPIRED = 'CHECKOUT_SESSION_EXPIRED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_CANCELED = 'PAYMENT_CANCELED',

  // ── Staff / manual reasons (set via PATCH /payments/{id}/cancel) ─────────
  WRONG_AMOUNT = 'WRONG_AMOUNT',
  WRONG_PAYMENT_METHOD = 'WRONG_PAYMENT_METHOD',
  CUSTOMER_CANCELLED = 'CUSTOMER_CANCELLED',
  DUPLICATE_PAYMENT = 'DUPLICATE_PAYMENT',
  STAFF_CANCEL = 'STAFF_CANCEL',

  // ── System / order lifecycle reasons ─────────────────────────────────────
  ORDER_CANCELLED = 'ORDER_CANCELLED',
}
