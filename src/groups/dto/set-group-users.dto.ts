import { ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class SetGroupUsersDto {
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds!: string[];
}
