import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignDto } from './dto/presign.dto';
import { ReadDto } from './dto/read.dto';

@Injectable()
export class UploadsService {
  private s3?: S3Client;
  private videosBucket?: string;
  private thumbnailsBucket?: string;
  private videosPublicBaseUrl?: string;
  private thumbnailsPublicBaseUrl?: string;
  private presignExpiresIn = 3600;
  private configLoaded = false;

  constructor(private readonly config: ConfigService) {}

  async presign(dto: PresignDto) {
    const assetType = dto.assetType ?? 'video';
    const contentType = dto.contentType.trim().toLowerCase();
    this.assertValidAssetType(assetType, contentType);

    const extension = this.resolveExtension(dto.fileName, contentType);
    const key =
      assetType === 'image'
        ? `collections/${dto.collectionId}/thumbnails/${randomUUID()}${extension}`
        : `collections/${dto.collectionId}/${randomUUID()}${extension}`;

    const client = this.getClient();
    const bucket =
      assetType === 'image'
        ? this.getThumbnailsBucket()
        : this.getVideosBucket();
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: this.presignExpiresIn,
    });

    return {
      uploadUrl,
      key,
      readUrl:
        assetType === 'image'
          ? this.buildThumbnailReadUrl(key)
          : this.buildVideoReadUrl(key),
      contentType,
      assetType,
      expiresIn: this.presignExpiresIn,
    };
  }

  async presignRead(dto: ReadDto) {
    const key = dto.key.trim();
    if (!key) {
      throw new BadRequestException('key is required');
    }

    if (this.isThumbnailKey(key)) {
      return {
        key,
        readUrl: this.buildThumbnailReadUrl(key),
        expiresIn: this.presignExpiresIn,
      };
    }

    const client = this.getClient();
    const command = new GetObjectCommand({
      Bucket: this.getVideosBucket(),
      Key: key,
    });

    const readUrl = await getSignedUrl(client, command, {
      expiresIn: this.presignExpiresIn,
    });

    return { key, readUrl, expiresIn: this.presignExpiresIn };
  }

  private getRequiredEnv(name: string): string {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new BadRequestException(`Missing ${name}`);
    return value;
  }

  private normalizeBaseUrl(value?: string) {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  }

  private ensureConfigLoaded() {
    if (this.configLoaded) return;

    this.videosBucket =
      this.config.get<string>('R2_BUCKET_VIDEOS')?.trim() ||
      this.config.get<string>('R2_BUCKET')?.trim();
    if (!this.videosBucket) {
      throw new BadRequestException('Missing R2_BUCKET_VIDEOS');
    }

    this.thumbnailsBucket = this.config
      .get<string>('R2_BUCKET_THUMBNAILS')
      ?.trim();
    if (!this.thumbnailsBucket) {
      throw new BadRequestException('Missing R2_BUCKET_THUMBNAILS');
    }

    this.videosPublicBaseUrl = this.normalizeBaseUrl(
      this.config.get<string>('PUBLIC_BASE_URL'),
    );
    this.thumbnailsPublicBaseUrl = this.normalizeBaseUrl(
      this.config.get<string>('R2_THUMBNAILS_PUBLIC_BASE_URL'),
    );

    const expiresInRaw = this.config.get<string>('R2_PRESIGN_EXPIRES_IN');
    const parsedExpires = expiresInRaw ? Number(expiresInRaw) : NaN;
    this.presignExpiresIn = Number.isFinite(parsedExpires)
      ? parsedExpires
      : 3600;

    this.configLoaded = true;
  }

  private getVideosBucket() {
    this.ensureConfigLoaded();
    return this.videosBucket as string;
  }

  private getThumbnailsBucket() {
    this.ensureConfigLoaded();
    return this.thumbnailsBucket as string;
  }

  private buildVideoReadUrl(key: string) {
    this.ensureConfigLoaded();
    return this.videosPublicBaseUrl
      ? `${this.videosPublicBaseUrl}/${key}`
      : undefined;
  }

  private buildThumbnailReadUrl(key: string) {
    this.ensureConfigLoaded();
    if (!this.thumbnailsPublicBaseUrl) {
      throw new BadRequestException('Missing R2_THUMBNAILS_PUBLIC_BASE_URL');
    }

    return `${this.thumbnailsPublicBaseUrl}/${key}`;
  }

  private isThumbnailKey(key: string) {
    return key.includes('/thumbnails/');
  }

  private assertValidAssetType(
    assetType: 'video' | 'image',
    contentType: string,
  ) {
    const expectedPrefix = `${assetType}/`;
    if (!contentType.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        `contentType must be ${expectedPrefix}* for assetType=${assetType}`,
      );
    }
  }

  private resolveExtension(fileName: string, contentType: string) {
    const fromFileName = extname(fileName).trim().toLowerCase();
    if (fromFileName) return fromFileName;

    const byContentType: Record<string, string> = {
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
    };

    return byContentType[contentType] ?? '.bin';
  }

  private getClient() {
    if (this.s3) return this.s3;

    this.ensureConfigLoaded();

    const accountId = this.getRequiredEnv('R2_ACCOUNT_ID');
    const accessKeyId = this.getRequiredEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = this.getRequiredEnv('R2_SECRET_ACCESS_KEY');

    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    });

    return this.s3;
  }
}
