import { IsString, MinLength } from "class-validator";

export class RecordReceiptDto {
  @IsString()
  @MinLength(1)
  receiptReference!: string;

  @IsString()
  @MinLength(1)
  submissionReference!: string;
}
