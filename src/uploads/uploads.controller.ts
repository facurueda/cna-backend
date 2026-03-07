import { Body, Controller, Post } from "@nestjs/common";
import { UploadsService } from "./uploads.service";
import { PresignDto } from "./dto/presign.dto";
import { ReadDto } from "./dto/read.dto";

@Controller("uploads")
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post("presign")
  presign(@Body() dto: PresignDto) {
    return this.uploads.presign(dto);
  }

  @Post("read")
  presignRead(@Body() dto: ReadDto) {
    return this.uploads.presignRead(dto);
  }
}
