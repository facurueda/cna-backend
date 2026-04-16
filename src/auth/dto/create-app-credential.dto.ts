import { Transform } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { AppCredentialPlatform } from '@prisma/client';

const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

export class CreateAppCredentialDto {
  @IsEnum(AppCredentialPlatform)
  platform: AppCredentialPlatform;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  name: string;
}
