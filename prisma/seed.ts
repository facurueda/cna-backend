import 'dotenv/config';
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!, // clave: connectionString
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const project = await prisma.project.upsert({
    where: { slug: process.env.DEFAULT_PROJECT_SLUG?.trim() || 'cna' },
    update: {},
    create: {
      slug: process.env.DEFAULT_PROJECT_SLUG?.trim() || 'cna',
      name: process.env.DEFAULT_PROJECT_NAME?.trim() || 'CNA',
    },
  });

  const clipCategories = [
    '7 metros',
    'Faltas tecnicas',
    'Tiro Libre',
    'Amarilla',
    '2 minutos',
    'Roja',
    'Roja + Azul',
    'Juego Pasivo',
    'Especiales',
  ];

  await prisma.clipCategory.createMany({
    data: clipCategories.map((name) => ({ name, projectId: project.id })),
    skipDuplicates: true,
  });

  const clipCollection = await prisma.clipCollection.upsert({
    where: { projectId_name: { projectId: project.id, name: 'Oficial' } },
    update: {
      description: 'Colección principal de clips formativos.',
    },
    create: {
      projectId: project.id,
      name: 'Oficial',
      description: 'Colección principal de clips formativos.',
    },
  });

  const firstCategory = await prisma.clipCategory.findFirst({
    where: { projectId: project.id },
    orderBy: { name: 'asc' },
    select: { id: true },
  });

  const adminPassword = await bcrypt.hash('Admin123!', 10);
  const userPassword = await bcrypt.hash('User123!', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@vyro.com' },
    update: {},
    create: {
      firstName: 'Admin',
      lastName: 'Vyro',
      email: 'admin@vyro.com',
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: 'facu@vyro.com' },
    update: {},
    create: {
      firstName: 'Facu',
      lastName: 'Rueda',
      email: 'facu@vyro.com',
      password: userPassword,
      role: Role.GENERAL,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: 'marcos@vyro.com' },
    update: {},
    create: {
      firstName: 'Marcos',
      lastName: 'Ref',
      email: 'marcos@vyro.com',
      password: userPassword,
      role: Role.GENERAL,
    },
  });

  const competition = await prisma.competition.create({
    data: {
      name: 'SCA Adulto Masculino',
    },
  });

  const match = await prisma.match.create({
    data: {
      competitionId: competition.id,
      teamA: 'Argentina',
      teamB: 'Chile',
      category: 'Adulto Masculino',
      date: new Date(),
      status: 'OPEN' as any,
      referees: {
        create: [{ userId: user1.id }, { userId: user2.id }],
      },
    },
  });

  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: admin.id, role: Role.ADMIN },
      { projectId: project.id, userId: user1.id, role: Role.GENERAL },
      { projectId: project.id, userId: user2.id, role: Role.GENERAL },
    ],
    skipDuplicates: true,
  });

  await prisma.clip.create({
    data: {
      projectId: project.id,
      collectionId: clipCollection.id,
      categoryId: firstCategory!.id,
      title: 'Contacto en suspensión - 2 minutos',
      description:
        'Decisión final: sanción progresiva por contacto peligroso en zona alta.',
      videoKey: `${project.id}/clips/seed/video.mp4`,
      status: 'READY' as any,
      visibility: 'PUBLIC' as any,
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });

  console.log('✅ Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
