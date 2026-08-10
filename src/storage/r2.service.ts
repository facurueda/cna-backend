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
 * Layout de keys:
 *   {entorno}/{projectId}/clips/{clipId}/source.{ext}
 *   {entorno}/{projectId}/clips/{clipId}/video.mp4
 *   {entorno}/{projectId}/clips/{clipId}/thumbnail.jpg
 *
 * El entorno va primero para que staging no ensucie ni pise datos productivos aun
 * si por un error de configuracion ambos apuntan al mismo bucket. Hace falta
 * porque el id del proyecto por defecto lo fija la migracion y es identico en
 * todas las bases: sin este segmento, las keys de staging y de produccion
 * coincidirian exactamente.
 */
@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private client?: S3Client;
  private keyPrefix?: string;

  constructor(private readonly config: ConfigService) {}

  /** Segmento de entorno: `R2_KEY_PREFIX`, o `NODE_ENV` si no esta definido. */
  getKeyPrefix() {
    if (this.keyPrefix) return this.keyPrefix;

    const configured =
      this.config.get<string>('R2_KEY_PREFIX')?.trim() ||
      this.config.get<string>('NODE_ENV')?.trim() ||
      'development';

    this.keyPrefix = configured
      .toLowerCase()
      .replace(/^\/+|\/+$/g, '')
      .replace(/[^a-z0-9._-]+/g, '-');

    return this.keyPrefix;
  }

  /** Prefijo comun de todo lo que pertenece a un proyecto en este entorno. */
  buildProjectPrefix(projectId: string) {
    return `${this.getKeyPrefix()}/${projectId}`;
  }

  buildSourceKey(projectId: string, clipId: string, extension: string) {
    const ext = extension.startsWith('.') ? extension : `.${extension}`;
    return `${this.buildProjectPrefix(projectId)}/clips/${clipId}/source${ext}`;
  }

  buildVideoKey(projectId: string, clipId: string) {
    return `${this.buildProjectPrefix(projectId)}/clips/${clipId}/video.mp4`;
  }

  buildThumbnailKey(projectId: string, clipId: string) {
    return `${this.buildProjectPrefix(projectId)}/clips/${clipId}/thumbnail.jpg`;
  }

  /**
   * Verifica que la key pertenezca al proyecto Y al entorno actual. Ultima linea
   * de defensa: cubre que un proyecto lea objetos de otro, y tambien que una base
   * restaurada de produccion en staging (donde los clipId coinciden) termine
   * sirviendo archivos que no le corresponden.
   */
  assertKeyBelongsToProject(key: string, projectId: string) {
    if (!key.startsWith(`${this.buildProjectPrefix(projectId)}/`)) {
      throw new BadRequestException(
        'La key no pertenece al proyecto activo en este entorno',
      );
    }
  }

  async createUploadUrl(
    key: string,
    contentType: string,
    options: { bucket?: string | null; expiresIn?: number } = {},
  ) {
    const expiresIn = options.expiresIn ?? 3600;
    const command = new PutObjectCommand({
      Bucket: this.resolveBucket(options.bucket),
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(this.getClient(), command, {
      expiresIn,
    });

    return { uploadUrl, key, expiresIn };
  }

  async createReadUrl(
    key: string,
    options: { bucket?: string | null; expiresIn?: number } = {},
  ) {
    const expiresIn = options.expiresIn ?? 3600;
    const command = new GetObjectCommand({
      Bucket: this.resolveBucket(options.bucket),
      Key: key,
    });

    const readUrl = await getSignedUrl(this.getClient(), command, {
      expiresIn,
    });

    return { readUrl, key, expiresIn };
  }

  async putObject(
    key: string,
    body: Uint8Array,
    contentType: string,
    bucket?: string | null,
  ) {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: this.resolveBucket(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );

    return key;
  }

  /** Borrado best-effort: no debe tumbar el flujo que lo invoca. */
  async deleteObject(key: string, bucket?: string | null) {
    try {
      await this.getClient().send(
        new DeleteObjectCommand({
          Bucket: this.resolveBucket(bucket),
          Key: key,
        }),
      );
    } catch (error) {
      this.logger.warn(`No se pudo borrar ${key}: ${String(error)}`);
    }
  }

  /**
   * Bucket a usar: el propio del proyecto si lo tiene, o el default del entorno.
   *
   * Cada proyecto puede tener su bucket para que un cliente quede aislado de los
   * demas (credenciales, costos, y un "borra todo lo mio" que no toca a nadie mas).
   * Los que no lo definen caen al default, asi sumar un proyecto con bucket propio
   * no obliga a migrar los objetos de los que ya existen.
   */
  resolveBucket(projectBucket?: string | null) {
    const bucket = projectBucket?.trim() || this.getDefaultBucket();
    if (!bucket) throw new BadRequestException('Missing R2_BUCKET_VIDEOS');
    return bucket;
  }

  getDefaultBucket() {
    return (
      this.config.get<string>('R2_BUCKET_VIDEOS')?.trim() ||
      this.config.get<string>('R2_BUCKET')?.trim() ||
      ''
    );
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
