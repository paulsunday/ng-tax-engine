import { IsInt, Max, Min } from "class-validator";

export class PostDepreciationDto {
  @IsInt()
  @Min(2000)
  periodYear!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  periodMonth!: number;
}
