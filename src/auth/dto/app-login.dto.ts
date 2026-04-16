import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AppCredentialPlatform } from '@prisma/client';
import { DeviceInfoDto } from './device-info.dto';

const trimString = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  return value.trim();
};

export class AppLoginDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @IsEnum(AppCredentialPlatform)
  platform: AppCredentialPlatform;

  @IsString()
  @IsNotEmpty()
  @Transform(trimString)
  name: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviceInfoDto)
  device?: DeviceInfoDto;
}
