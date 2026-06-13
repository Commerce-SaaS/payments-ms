export const PAYMENT_PATTERNS = {
  CREATE_PAYMENT_SESSION: 'payment.session.create.payment',

  CREATE: 'payment.create.payment',
  GET_BY_ID: 'payment.get_by_id',
  FIND_ALL: 'payment.find_all',
  FIND_MY: 'payment.find_my',
  FIND_MY_BY_ID: 'payment.find_my_by_id',
  CANCEL: 'payment.cancel',

  
  WEB_HOOK_STRIPE: 'payment.webhook.stripe',
  WEB_HOOK_PAYPAL: 'payment.webhook.paypal',
  CONFIRM: 'payment.confirm',
  FAIL: 'payment.fail',
  REFUND: 'payment.refund',
} as const;
