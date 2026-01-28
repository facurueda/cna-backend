import { Injectable } from "@nestjs/common";
import { PresignDto } from "./dto/presign.dto";

@Injectable()
export class UploadsService {
  presign(dto: PresignDto) {
    // MOCK: devolvemos un MP4 público fijo (para que el front lo use YA)
    // Podés cambiarlo por cualquier mp4 público que te guste.
    const fileUrl =
      "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

    return {
      provider: "mock",
      key: `mock/${Date.now()}_${dto.fileName}`,
      uploadUrl: null, // en S3 sería un PUT URL
      fileUrl, // esto es lo que guardás en Clip.videoUrl
      expiresIn: 0,
      contentType: dto.contentType ?? "video/mp4",
    };
  }
}