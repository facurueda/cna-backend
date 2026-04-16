import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class DeviceInfoDto {
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @IsString()
  @IsOptional()
  brand?: string;

  @IsString()
  @IsOptional()
  model?: string;

  @IsString()
  @IsOptional()
  os?: string;

  @IsString()
  @IsOptional()
  osVersion?: string;

  @IsString()
  @IsOptional()
  appVersion?: string;

  @IsString()
  @IsOptional()
  buildVersion?: string;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  locale?: string;

  @IsBoolean()
  @IsOptional()
  isPhysicalDevice?: boolean;
}
