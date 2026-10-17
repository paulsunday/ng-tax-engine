import { IsString, Length } from "class-validator";

export class CreateConnectionDto {
  @IsString()
  @Length(1, 100)
  label!: string;
}
