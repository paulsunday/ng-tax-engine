import { IsDateString, IsIn } from "class-validator";

export class GenerateScenarioDto {
  @IsIn(["NORMAL", "PROFIT_SCENARIO", "LOSS_SCENARIO"])
  scenarioType!: "NORMAL" | "PROFIT_SCENARIO" | "LOSS_SCENARIO";

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;
}
