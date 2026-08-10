import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ClipStatus, ClipVisibility, Prisma, Role } from '@prisma/client';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { R2Service } from '../storage/r2.service';
import { UserStatsService } from '../users/user-stats.service';
import { CreateClipDto } from './dto/create-clip.dto';
import { ListClipsQueryDto } from './dto/list-clips.query.dto';
import { MarkUploadedDto } from './dto/mark-uploaded.dto';
import { UpdateClipDto } from './dto/update-clip.dto';

type AuthUser = { id: string; role: Role };

const clipInclude = {
  collection: {
    select: { id: true, name: true, description: true },
  },
  category: {
    select: { id: true, name: true },
  },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, role: true },
  },
} as const;

/** Lo que un no-admin puede ver: publicado y ya procesado. */
const VISIBLE_TO_MEMBERS = {
  visibility: ClipVisibility.PUBLIC,
  status: ClipStatus.READY,
} as const;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
};

const THUMBNAIL_CONTENT_TYPE = 'image/jpeg';

/**
 * Las miniaturas se firman por mas tiempo que el video: una grilla puede quedar
 * abierta un rato largo y no hay forma de renovar la URL de un `background-image`
 * sin recargar. Son livianas y de bajo riesgo, el video sigue con TTL corto.
 */
const THUMBNAIL_URL_TTL_SECONDS = 6 * 3600;

@Injectable()
export class ClipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userStatsService: UserStatsService,
    private readonly r2: R2Service,
  ) {}

  async list(projectId: string, query: ListClipsQueryDto, user: AuthUser) {
    const where = this.buildListWhere(projectId, query, user);
    const take = query.limit ?? this.normalizeTake(query.take);
    const page = query.page ?? 1;
    const skip =
      query.page != null ? (page - 1) * take : this.normalizeSkip(query.skip);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.clip.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
        include: clipInclude,
      }),
      this.prisma.clip.count({ where }),
    ]);

    return {
      data: await this.withThumbnailUrls(projectId, data),
      meta: {
        total,
        page,
        limit: take,
        totalPages: Math.ceil(total / take),
      },
    };
  }

  /**
   * Crea el clip en estado UPLOADING y devuelve la URL firmada para que el browser
   * suba el archivo directo a R2. El server nunca recibe el video.
   */
  async create(projectId: string, dto: CreateClipDto, user: AuthUser) {
    await this.assertCategoryExists(projectId, dto.categoryId);
    if (dto.collectionId) {
      await this.assertCollectionExists(projectId, dto.collectionId);
    }

    const extension =
      extname(dto.fileName).toLowerCase() ||
      EXTENSION_BY_CONTENT_TYPE[dto.contentType.toLowerCase()] ||
      '.mp4';

    const clip = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clip.create({
        data: {
          projectId,
          collectionId: dto.collectionId ?? null,
          categoryId: dto.categoryId,
          title: dto.title.trim(),
          description: dto.description?.trim() ?? '',
          status: ClipStatus.UPLOADING,
          sizeBytes: dto.size,
          duration: dto.duration,
          createdById: user.id,
        },
        include: clipInclude,
      });

      await this.userStatsService.incrementClips(user.id, 1, tx);
      return created;
    });

    const sourceKey = this.r2.buildSourceKey(projectId, clip.id, extension);
    await this.prisma.clip.update({
      where: { id: clip.id },
      data: { sourceKey },
    });

    const bucket = await this.resolveProjectBucket(projectId);
    const upload = await this.r2.createUploadUrl(sourceKey, dto.contentType, {
      bucket,
    });

    // La miniatura la genera el browser junto con la compresion, asi que se firma
    // ahora y viaja en la misma respuesta: evita un roundtrip extra por clip.
    // La key queda reservada aunque no se use; `thumbnailKey` recien se persiste
    // cuando el browser confirma que la subio.
    const thumbnail = await this.r2.createUploadUrl(
      this.r2.buildThumbnailKey(projectId, clip.id),
      THUMBNAIL_CONTENT_TYPE,
      { bucket },
    );

    return {
      clip: { ...clip, sourceKey },
      upload: {
        ...upload,
        thumbnailUploadUrl: thumbnail.uploadUrl,
        thumbnailKey: thumbnail.key,
        thumbnailContentType: THUMBNAIL_CONTENT_TYPE,
      },
    };
  }

  /**
   * El browser avisa que termino el PUT a R2.
   *
   * Pasa directo a READY: la compresion ocurre en el browser ANTES de subir, asi que
   * el archivo que llego ya es el servible. No hay paso de transcodificacion del lado
   * del servidor. (`PROCESSING` queda para que la UI muestre "comprimiendo".)
   */
  async markUploaded(
    projectId: string,
    id: string,
    dto: MarkUploadedDto,
    user: AuthUser,
  ) {
    const clip = await this.assertClipExists(projectId, id);

    if (!clip.sourceKey) {
      throw new ForbiddenException('El clip no tiene un archivo asociado');
    }

    const updated = await this.prisma.clip.update({
      where: { id: clip.id },
      data: {
        status: ClipStatus.READY,
        statusError: null,
        // El archivo subido es el definitivo: no hay una version derivada aparte.
        videoKey: clip.sourceKey,
        // Solo se persiste si el browser confirmo el PUT de la miniatura: si
        // guardaramos la key sin el objeto detras, la grilla pediria una URL
        // firmada que devuelve 404 en vez de caer al degradado.
        thumbnailKey: dto.hasThumbnail
          ? this.r2.buildThumbnailKey(projectId, clip.id)
          : undefined,
      },
      include: clipInclude,
    });

    return this.withThumbnailUrl(projectId, updated);
  }

  async getById(projectId: string, id: string, user: AuthUser) {
    const clip = await this.findAccessibleClip(projectId, id, user);
    return this.withThumbnailUrl(projectId, clip);
  }

  /**
   * URL firmada de reproduccion. Se genera al vuelo y expira: nunca se persiste.
   */
  async getPlaybackUrl(projectId: string, id: string, user: AuthUser) {
    const clip = await this.findAccessibleClip(projectId, id, user);
    const key = clip.videoKey ?? clip.sourceKey;

    if (!key) {
      if (clip.legacyVideoUrl) {
        return { url: clip.legacyVideoUrl, expiresIn: null };
      }
      throw new NotFoundException('El clip todavía no tiene video disponible');
    }

    this.r2.assertKeyBelongsToProject(key, projectId);
    const { readUrl, expiresIn } = await this.r2.createReadUrl(key, {
      bucket: await this.resolveProjectBucket(projectId),
    });

    return { url: readUrl, expiresIn };
  }

  async update(
    projectId: string,
    id: string,
    dto: UpdateClipDto,
    user: AuthUser,
  ) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede editar clips');
    }

    await this.assertClipExists(projectId, id);

    if (dto.collectionId) {
      await this.assertCollectionExists(projectId, dto.collectionId);
    }

    if (dto.categoryId) {
      await this.assertCategoryExists(projectId, dto.categoryId);
    }

    return this.prisma.clip.update({
      where: { id },
      data: {
        collectionId: dto.collectionId,
        categoryId: dto.categoryId,
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        duration: dto.duration,
      },
      include: clipInclude,
    });
  }

  async remove(projectId: string, id: string, user: AuthUser) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede borrar clips');
    }

    const clip = await this.assertClipExists(projectId, id);
    const bucket = await this.resolveProjectBucket(projectId);

    await this.prisma.clip.delete({ where: { id } });

    // Los objetos se borran despues de la fila: si falla, quedan huerfanos en R2
    // pero la operacion del usuario no se rompe.
    for (const key of [clip.sourceKey, clip.videoKey, clip.thumbnailKey]) {
      if (key) await this.r2.deleteObject(key, bucket);
    }

    return { ok: true };
  }

  async setVisibility(
    projectId: string,
    id: string,
    visibility: ClipVisibility,
    user: AuthUser,
  ) {
    if (user.role !== Role.ADMIN) {
      throw new ForbiddenException('Solo admin puede cambiar visibilidad');
    }

    await this.assertClipExists(projectId, id);

    return this.prisma.clip.update({
      where: { id },
      data: {
        visibility,
        publishedAt: visibility === ClipVisibility.PUBLIC ? new Date() : null,
      },
      include: clipInclude,
    });
  }

  private buildListWhere(
    projectId: string,
    query: ListClipsQueryDto,
    user: AuthUser,
  ): Prisma.ClipWhereInput {
    // projectId va siempre primero y no es sobreescribible por la query.
    const where: Prisma.ClipWhereInput = { projectId };

    if (query.collectionId?.trim()) {
      where.collectionId = query.collectionId.trim();
    }

    if (query.categoryId?.trim()) {
      where.categoryId = query.categoryId.trim();
    }

    if (query.search?.trim()) {
      where.title = {
        contains: query.search.trim(),
        mode: 'insensitive',
      };
    }

    if (user.role === Role.ADMIN) {
      if (query.visibility) {
        where.visibility = query.visibility;
      }
      if (query.status) {
        where.status = query.status;
      }
      return where;
    }

    return { ...where, ...VISIBLE_TO_MEMBERS };
  }

  private normalizeSkip(value?: number) {
    if (value == null || !Number.isFinite(value)) return 0;
    return Math.max(0, Math.trunc(value));
  }

  private normalizeTake(value?: number) {
    if (value == null || !Number.isFinite(value)) return 20;
    return Math.min(100, Math.max(1, Math.trunc(value)));
  }

  private assertCanAccessClip(
    clip: { visibility: ClipVisibility; status: ClipStatus },
    user: AuthUser,
  ) {
    if (user.role === Role.ADMIN) return;
    if (
      clip.visibility === ClipVisibility.PUBLIC &&
      clip.status === ClipStatus.READY
    ) {
      return;
    }
    throw new ForbiddenException('No tenés acceso a este clip');
  }

  private async findAccessibleClip(
    projectId: string,
    id: string,
    user: AuthUser,
  ) {
    const clip = await this.prisma.clip.findFirst({
      where: { id, projectId },
      include: clipInclude,
    });

    if (!clip) throw new NotFoundException('Clip no encontrado');
    this.assertCanAccessClip(clip, user);

    return clip;
  }

  /**
   * Agrega la URL firmada de la miniatura. Va resuelta en el listado y no en un
   * endpoint aparte: una grilla de 20 clips serian 20 requests extra, y firmar
   * es solo un HMAC local (no pega contra R2).
   */
  private async withThumbnailUrls<T extends { thumbnailKey: string | null }>(
    projectId: string,
    clips: T[],
  ) {
    if (!clips.some((clip) => clip.thumbnailKey)) {
      return clips.map((clip) => ({ ...clip, thumbnailUrl: null }));
    }

    const bucket = await this.resolveProjectBucket(projectId);

    return Promise.all(
      clips.map((clip) => this.signThumbnail(projectId, clip, bucket)),
    );
  }

  private async withThumbnailUrl<T extends { thumbnailKey: string | null }>(
    projectId: string,
    clip: T,
  ) {
    if (!clip.thumbnailKey) return { ...clip, thumbnailUrl: null };
    return this.signThumbnail(
      projectId,
      clip,
      await this.resolveProjectBucket(projectId),
    );
  }

  private async signThumbnail<T extends { thumbnailKey: string | null }>(
    projectId: string,
    clip: T,
    bucket: string | null,
  ) {
    if (!clip.thumbnailKey) return { ...clip, thumbnailUrl: null };

    this.r2.assertKeyBelongsToProject(clip.thumbnailKey, projectId);
    const { readUrl } = await this.r2.createReadUrl(clip.thumbnailKey, {
      bucket,
      expiresIn: THUMBNAIL_URL_TTL_SECONDS,
    });

    return { ...clip, thumbnailUrl: readUrl };
  }

  /**
   * Bucket del proyecto activo. `null` significa "usar el default del entorno":
   * es lo que permite que los proyectos ya existentes no tengan que migrar.
   */
  private async resolveProjectBucket(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { storageBucket: true },
    });

    return project?.storageBucket ?? null;
  }

  private async assertClipExists(projectId: string, id: string) {
    const clip = await this.prisma.clip.findFirst({
      where: { id, projectId },
      select: {
        id: true,
        sourceKey: true,
        videoKey: true,
        thumbnailKey: true,
      },
    });

    if (!clip) throw new NotFoundException('Clip no encontrado');
    return clip;
  }

  private async assertCollectionExists(projectId: string, collectionId: string) {
    const collection = await this.prisma.clipCollection.findFirst({
      where: { id: collectionId, projectId },
      select: { id: true },
    });

    if (!collection) throw new NotFoundException('Colección no encontrada');
  }

  private async assertCategoryExists(projectId: string, categoryId: string) {
    const category = await this.prisma.clipCategory.findFirst({
      where: { id: categoryId, projectId },
      select: { id: true },
    });

    if (!category) throw new NotFoundException('Categoría no encontrada');
  }
}
