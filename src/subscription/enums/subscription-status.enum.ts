export enum SubscriptionStatus {
  PROCESSING = 'PROCESSING',
  ACTIVE = 'ACTIVE',
  PAST_DUE = 'PAST_DUE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
  // Stripe statuses not covered above — adding new values here requires a DB migration
  // (ALTER TYPE ... ADD VALUE) in production; synchronize:true handles it in dev.
  INCOMPLETE = 'INCOMPLETE', // Stripe incomplete: awaiting first payment
  PAUSED = 'PAUSED',         // Stripe paused: collection temporarily stopped
}
