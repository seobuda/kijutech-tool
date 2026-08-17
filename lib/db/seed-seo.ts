import { readFileSync } from 'fs';
import path from 'path';
import { db } from './drizzle';
import { modules, seoSettings } from './schema';

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

  await db
    .insert(seoSettings)
    .values({
      key: 'tutor_url',
      value: 'https://claude.ai',
      label: 'URL del Tutor Claude',
      description:
        'Enlace que se abre al pulsar el botón "Abrir Tutor Claude" en las knowledge cards. Cámbialo por la URL de tu proyecto de Claude cuando lo tengas configurado.'
    })
    .onConflictDoNothing({ target: seoSettings.key });

  console.log('Setting "tutor_url" sembrado (o ya existía).');
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
