import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class InvoiceItemDto {
  @IsOptional()
  @IsString()
  description?: string;

  @Min(0.0001)
  quantity!: number;

  @Min(0)
  unitPriceNgn!: number;

  @Min(0)
  vatRate!: number;
}

export class CreateInvoiceDto {
  @IsString()
  customerId!: string;

  @IsString()
  @MinLength(1)
  invoiceNumber!: string;

  @IsDateString()
  issueDate!: string;

  @IsDateString()
  dueDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  items!: InvoiceItemDto[];
}
