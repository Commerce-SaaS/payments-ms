export const PAYMENT_PATTERNS = {
  CREATE_PAYMENT_SESSION: 'payment.session.create.payment',
  GET_BY_ID: 'payment.get_by_id',
  WEB_HOOK_STRIPE: 'payment.webhook.stripe',
  WEB_HOOK_PAYPAL: 'payment.webhook.paypal',
  CONFIRM: 'payment.confirm',
  FAIL: 'payment.fail',
  REFUND: 'payment.refund',
} as const;