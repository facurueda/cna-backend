import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * Acceso a R2. Todo el modulo de clips trabaja con keys; las URLs firmadas se
 * generan al momento de servir y nunca se persisten (expiran).
 *
 * Layout de keys, con el proyecto como primer segmento para que el aislamiento
 * entre clientes sea legible en el bucket:
 *   {projectId}/clips/{clipId}/source.{ext}
 *   {projectId}/clips/{clipId}/video.mp4
 *   {projectId}/clips/{clipId}/thumbnail.jpg
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private client?: S3Client;

  constructor(private readonly config: ConfigService) {}

  buildSourceKey(projectId: string, clipId: string, extension: string) {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `${projectId}/clips/${clipId}/source${ext}`;
  }

  buildVideoKey(projectId: string, clipId: string) {
    return `${projectId}/clips/${clipId}/video.mp4`;
  }

  buildThumbnailKey(projectId: string, clipId: string) {
    return `${projectId}/clips/${clipId}/thumbnail.jpg`;
  }

  /**
   * Verifica que la key pertenezca al proyecto. Ultima linea de defensa contra
   * que un projectId de una sesion termine leyendo un objeto de otro proyecto.
   */
  assertKeyBelongsToProject(key: string, projectId: string) {
    if (!key.startsWith(`${projectId}/`)) {
      throw new BadRequestException('La key no pertenece al proyecto activo');
    }
  }

  async createUploadUrl(key: string, contentType: string, expiresIn = 3600) {
    const command = new PutObjectCommand({
      Bucket: this.getBucket(),
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.getClient(), command, {
      expiresIn,
    });

    return { uploadUrl, key, expiresIn };
  }

  async createReadUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
      Bucket: this.getBucket(),
      Key: key,
    });

    const readUrl = await getSignedUrl(this.getClient(), command, {
      expiresIn,
    });

    return { readUrl, key, expiresIn };
  }

  async putObject(key: string, body: Uint8Array, contentType: string) {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.getBucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return key;
  }

  /** Borrado best-effort: no debe tumbar el flujo que lo invoca. */
  async deleteObject(key: string) {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({ Bucket: this.getBucket(), Key: key }),
      );
    } catch (error) {
      this.logger.warn(`No se pudo borrar ${key}: ${String(error)}`);
    }
  }

  getBucket() {
    const bucket =
      this.config.get<string>('R2_BUCKET_VIDEOS')?.trim() ||
      this.config.get<string>('R2_BUCKET')?.trim();

    if (!bucket) throw new BadRequestException('Missing R2_BUCKET_VIDEOS');
    return bucket;
  }

  private getRequiredEnv(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) throw new BadRequestException(`Missing ${name}`);
    return value;
  }

  private getClient() {
    if (this.client) return this.client;

    const accountId = this.getRequiredEnv('R2_ACCOUNT_ID');

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.getRequiredEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: this.getRequiredEnv('R2_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: true,
    });

    return this.client;
  }
}
