import { IsIn } from "class-validator";

export class SubmitFilingDto {
  @IsIn(["MANUAL", "APPROVAL_REQUIRED", "AUTOMATIC"])
  mode!: "MANUAL" | "APPROVAL_REQUIRED" | "AUTOMATIC";
}
