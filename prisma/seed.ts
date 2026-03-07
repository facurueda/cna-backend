import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!, // clave: connectionString
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const clipCategories = [
    "7 metros",
    "Faltas tecnicas",
    "Tiro Libre",
    "Amarilla",
    "2 minutos",
    "Roja",
    "Roja + Azul",
    "Juego Pasivo",
    "Especiales",
  ];

  await prisma.clipCategory.createMany({
    data: clipCategories.map((name) => ({ name })),
    skipDuplicates: true,
  });

  const adminPassword = await bcrypt.hash("Admin123!", 10);
  const userPassword = await bcrypt.hash("User123!", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@vyro.com" },
    update: {},
    create: {
      firstName: "Admin",
      lastName: "Vyro",
      email: "admin@vyro.com",
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  const user1 = await prisma.user.upsert({
    where: { email: "facu@vyro.com" },
    update: {},
    create: {
      firstName: "Facu",
      lastName: "Rueda",
      email: "facu@vyro.com",
      password: userPassword,
      role: Role.GENERAL,
    },
  });

  const user2 = await prisma.user.upsert({
    where: { email: "marcos@vyro.com" },
    update: {},
    create: {
      firstName: "Marcos",
      lastName: "Ref",
      email: "marcos@vyro.com",
      password: userPassword,
      role: Role.GENERAL,
    },
  });

  const competition = await prisma.competition.create({
    data: {
      name: "SCA Adulto Masculino",
    },
  });

  const match = await prisma.match.create({
    data: {
      competitionId: competition.id,
      teamA: "Argentina",
      teamB: "Chile",
      category: "Adulto Masculino",
      date: new Date(),
      status: "OPEN" as any,
      referees: {
        create: [{ userId: user1.id }, { userId: user2.id }],
      },
    },
  });

  const clip = await prisma.clip.create({
    data: {
      matchId: match.id,
      title: "Contacto en suspensión - 2 minutos",
      videoUrl: "https://example.com/dummy.mp4",
      status: "OPEN" as any,
      createdById: user1.id,
      referees: {
        create: [{ userId: user1.id }, { userId: user2.id }],
      },
    },
  });

  const comment1 = await prisma.comment.create({
    data: {
      clipId: clip.id,
      userId: user2.id,
      content: "Para mí es 2 minutos por impacto en la cara, sin intención pero peligroso.",
    },
  });

  const finalComment = await prisma.comment.create({
    data: {
      clipId: clip.id,
      userId: admin.id,
      content:
        "Decisión final: 2 minutos al defensor. Contacto en zona alta con riesgo, corresponde sanción progresiva.",
      isFinalDecision: true,
    },
  });

  await prisma.clip.update({
    where: { id: clip.id },
    data: {
      status: "CLOSED" as any,
      finalDecisionCommentId: finalComment.id,
    },
  });

  console.log("✅ Seed completado.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
