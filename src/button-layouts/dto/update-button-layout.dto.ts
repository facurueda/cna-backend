import { PartialType } from '@nestjs/mapped-types';
import { CreateButtonLayoutDto } from './create-button-layout.dto';

export class UpdateButtonLayoutDto extends PartialType(CreateButtonLayoutDto) {}
