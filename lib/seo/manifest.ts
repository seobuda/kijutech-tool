import { readFileSync } from 'fs';
import path from 'path';

export type SeoManifestStage = {
  order: number;
  key: string;
  name: string;
  path?: string;
};

export type SeoManifest = {
  key: string;
  name: string;
  version: string;
  tables_prefix: string;
  roles_extends: string[];
  stages: SeoManifestStage[];
};

export function getSeoManifest(): SeoManifest {
  const manifestPath = path.join(process.cwd(), 'modules/seo/manifest.json');
  return JSON.parse(readFileSync(manifestPath, 'utf-8'));
}
