import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class ExpenseItemDto {
  @IsString()
  accountId!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @Min(0.01)
  amountNgn!: number;
}

export class CreateExpenseDto {
  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsDateString()
  expenseDate!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsOptional()
  @Min(0)
  vatRate?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ExpenseItemDto)
  items!: ExpenseItemDto[];
}
