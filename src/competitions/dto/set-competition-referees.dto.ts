import { ArrayUnique, IsArray, IsUUID } from "class-validator";

export class SetCompetitionRefereesDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID("4", { each: true })
  refereeIds!: string[];
}
