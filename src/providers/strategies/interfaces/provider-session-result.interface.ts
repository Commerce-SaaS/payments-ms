export interface ProviderSessionResult {
  externalPaymentId?: string;
  externalSessionId?: string;
  checkoutUrl: string;
  raw?: any;
}