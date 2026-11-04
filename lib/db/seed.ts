import { eq } from 'drizzle-orm';
import { db } from './drizzle';
import { users, teams, teamMembers, tenants } from './schema';
import { hashPassword } from '@/lib/auth/session';

async function seed() {
  // Sin credenciales por defecto: se piden por entorno (nunca se versionan).
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error('Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (mínimo 12 caracteres)');
  }
  const passwordHash = await hashPassword(password);

  const [existingTenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.slug, 'kijutech'))
    .limit(1);

  const tenant =
    existingTenant ??
    (
      await db
        .insert(tenants)
        .values({ name: 'Kijutech', slug: 'kijutech' })
        .returning()
    )[0];

  const [user] = await db
    .insert(users)
    .values([
      {
        tenantId: tenant.id,
        email: email,
        passwordHash: passwordHash,
        role: "owner",
      },
    ])
    .returning();

  console.log('Initial user created.');

  const [team] = await db
    .insert(teams)
    .values({
      name: 'Test Team',
    })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: user.id,
    role: 'owner',
  });

}

seed()
  .catch((error) => {
    console.error('Seed process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed process finished. Exiting...');
    process.exit(0);
  });
