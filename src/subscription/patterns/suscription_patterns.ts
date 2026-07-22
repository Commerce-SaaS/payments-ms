export const SUBSCRIPTION_PATTERNS = {
  CREATE_SUBSCRIPTION_SESSION: 'payment.session.create.subscription',
  CREATE_ONBOARDING_SUBSCRIPTION_SESSION:
    'subscription.session.create.onboarding',
  GET_PLANS: 'subscription.get_plans',
  GET_BY_USER: 'subscription.get_by_user',
  GET_MY_HISTORY: 'subscription.get_my_history',
  GET_MY_BY_ID: 'subscription.get_my_by_id',
  CHANGE_PLAN: 'subscription.change_plan',
  CANCEL: 'subscription.cancel',
  RESUME: 'subscription.resume',
  // Event received from auth-ms when a customer has been anonymized
  CUSTOMER_ANONYMIZED: 'customer.anonymized',
} as const;
