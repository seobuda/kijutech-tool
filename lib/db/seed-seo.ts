import { readFileSync } from 'fs';
import path from 'path';
import { db } from './drizzle';
import { modules } from './schema';

async function seedSeo() {
  const manifestPath = path.join(process.cwd(), 'modules/seo/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  await db
    .insert(modules)
    .values({
      key: manifest.key,
      name: manifest.name,
      version: manifest.version,
      active: true
    })
    .onConflictDoNothing({ target: modules.key });

  console.log(`Módulo "${manifest.key}" registrado (o ya existía).`);
}

seedSeo()
  .catch((error) => {
    console.error('Seed SEO process failed:', error);
    process.exit(1);
  })
  .finally(() => {
    console.log('Seed SEO process finished. Exiting...');
    process.exit(0);
  });
