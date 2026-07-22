import { IsString, IsInt, IsOptional, IsEnum, IsIn } from 'class-validator';

export const INVOICE_STATUSES = [
  'draft',
  'open',
  'paid',
  'void',
  'uncollectible',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export class InvoiceHistoryItemDto {
  @IsString()
  id: string;

  @IsOptional()
  @IsString()
  number: string | null;

  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status: InvoiceStatus | null;

  @IsInt()
  amountPaid: number;

  @IsInt()
  amountDue: number;

  @IsString()
  currency: string;

  @IsInt()
  created: number;

  @IsInt()
  periodStart: number;

  @IsInt()
  periodEnd: number;

  @IsOptional()
  @IsString()
  hostedInvoiceUrl: string | null;

  @IsOptional()
  @IsString()
  invoicePdf: string | null;
}
