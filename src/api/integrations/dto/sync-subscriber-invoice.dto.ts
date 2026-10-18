import { IsIn, IsISO8601, IsNumber, IsOptional, IsPositive, IsString, MaxLength, MinLength } from "class-validator";

export const SUBSCRIBER_INVOICE_EVENT_TYPES = ["PAYMENT_CAPTURED", "REFUND_ISSUED"] as const;
export type SubscriberInvoiceEventType = (typeof SUBSCRIBER_INVOICE_EVENT_TYPES)[number];

export class SyncSubscriberInvoiceDto {
  // The connected system's own opaque ID for this subscriber (never Netwave Books' own
  // Customer.id) — the idempotency key for matching repeat orders from the same person.
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  externalCustomerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  customerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerEmail?: string;

  // The connected system's own invoice/order reference — becomes this Invoice's
  // invoiceNumber, and is the idempotency key for the invoice itself (re-sending the same
  // orderReference is a no-op, not a duplicate invoice).
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  orderReference!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @IsNumber()
  @IsPositive()
  amountNgn!: number;

  @IsISO8601()
  paidAt!: string;

  @IsIn(SUBSCRIBER_INVOICE_EVENT_TYPES)
  eventType!: SubscriberInvoiceEventType;
}
