export const SUBSCRIPTION_PATTERNS = {
  CREATE_SUBSCRIPTION_SESSION: 'payment.session.create.subscription',
  CREATE_TRIAL: 'subscription.create_trial',
  GET_BY_ORG: 'subscription.get_by_org',
  CHANGE_PLAN: 'subscription.change_plan',
  CANCEL: 'subscription.cancel',
} as const;
