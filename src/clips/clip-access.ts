import { ClipStatus, ClipVisibility, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Lo que un no-admin puede ver: publicado y ya procesado. */
export const VISIBLE_TO_MEMBERS = {
  visibility: ClipVisibility.PUBLIC,
  status: ClipStatus.READY,
} as const;

/**
 * Grupos del usuario. Se resuelven en una query aparte y despues se filtra por
 * `groupId in (...)`: anidar `collection.groups.some.group.members.some.userId`
 * dentro del where de Clip son tres niveles de relacion y el plan que genera
 * Prisma es bastante peor, para algo que corre en cada listado.
 */
export async function getUserGroupIds(prisma: PrismaService, userId: string) {
  const rows = await prisma.userGroup.findMany({
    where: { userId },
    select: { groupId: true },
  });

  return rows.map((row) => row.groupId);
}

/**
 * Restriccion por grupo, vista desde el clip. Un clip es alcanzable si:
 *   - no tiene coleccion, o
 *   - su coleccion no tiene grupos (sin restriccion), o
 *   - el usuario pertenece a alguno de los grupos de su coleccion.
 *
 * La restriccion se configura en la coleccion pero se aplica al clip: el listado
 * de videos no pasa por la coleccion, asi que filtrar solo las colecciones
 * escondería la carpeta y dejaría los clips a la vista de todos.
 */
export function collectionGroupFilter(
  groupIds: string[],
): Prisma.ClipWhereInput {
  const reachable: Prisma.ClipWhereInput[] = [
    { collectionId: null },
    { collection: { groups: { none: {} } } },
  ];

  if (groupIds.length) {
    reachable.push({
      collection: { groups: { some: { groupId: { in: groupIds } } } },
    });
  }

  return { OR: reachable };
}

/**
 * Where completo de lo que ve un no-admin. El `OR` va al tope junto al resto de
 * las condiciones (Prisma las combina con AND), asi que quien lo componga no
 * debe agregar otro `OR` al mismo nivel.
 */
export function memberClipWhere(groupIds: string[]): Prisma.ClipWhereInput {
  return { ...VISIBLE_TO_MEMBERS, ...collectionGroupFilter(groupIds) };
}

/** Idem, pero vista desde la coleccion. */
export function collectionGroupWhere(
  groupIds: string[],
): Prisma.ClipCollectionWhereInput {
  const reachable: Prisma.ClipCollectionWhereInput[] = [
    { groups: { none: {} } },
  ];

  if (groupIds.length) {
    reachable.push({ groups: { some: { groupId: { in: groupIds } } } });
  }

  return { OR: reachable };
}

/** `true` si el usuario alcanza una coleccion con estos grupos asignados. */
export function canReachCollection(
  collectionGroupIds: string[],
  userGroupIds: string[],
) {
  if (!collectionGroupIds.length) return true;
  return collectionGroupIds.some((groupId) => userGroupIds.includes(groupId));
}
