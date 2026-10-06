import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, Min, MinLength, ValidateNested } from "class-validator";
import { JournalEntrySource } from "@prisma/client";

export class JournalLineDto {
  @IsString()
  accountId!: string;

  @Min(0)
  debitNgn!: number;

  @Min(0)
  creditNgn!: number;

  @IsOptional()
  @IsString()
  description?: string;
}

export class PostJournalEntryDto {
  @IsDateString()
  entryDate!: string;

  @IsString()
  @MinLength(1)
  description!: string;

  @IsEnum(JournalEntrySource)
  source!: JournalEntrySource;

  @IsOptional()
  @IsString()
  sourceId?: string;

  @IsOptional()
  @IsString()
  documentReference?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineDto)
  lines!: JournalLineDto[];
}
