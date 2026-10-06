import { IsInt, IsOptional, IsString } from "class-validator";

export class ColumnMappingDto {
  @IsInt()
  date!: number | null;

  @IsOptional()
  narration!: number | null;

  @IsOptional()
  reference!: number | null;

  @IsOptional()
  debit!: number | null;

  @IsOptional()
  credit!: number | null;

  @IsOptional()
  balance!: number | null;

  @IsOptional()
  amount!: number | null;
}

export class ConfirmMappingDto {
  mapping!: ColumnMappingDto;
}
