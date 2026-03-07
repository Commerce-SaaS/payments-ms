export type InvoiceMetadata =
  | {
      subscriptionId?: string;
      type?: string;
      organizationId?: string;
      paymentId?: string;
    }
  | null
  | undefined;
