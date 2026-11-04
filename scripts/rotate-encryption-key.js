#!/usr/bin/env node
/**
 * Rota AI_ENCRYPTION_KEY: descifra con la clave VIEJA todas las claves guardadas (IA, ClickUp,
 * Telegram) y las vuelve a cifrar con la NUEVA. Pensado para ejecutarse al migrar a producción,
 * porque la clave de desarrollo estuvo en el historial de Git.
 *
 * Uso (dentro del contenedor, nunca en el host Windows):
 *
 *   # 1) Backup de la base de datos (obligatorio):
 *   docker exec kijutech_db pg_dump -U kijutech -d kijutech_db > backups/backup_pre_rotacion_YYYYMMDD.sql
 *
 *   # 2) Genera la clave nueva (64 caracteres hex):
 *   openssl rand -hex 32
 *
 *   # 3) Prueba en seco (no escribe nada; comprueba que TODO se puede descifrar y recifrar):
 *   docker exec -e OLD_AI_ENCRYPTION_KEY=<vieja> -e NEW_AI_ENCRYPTION_KEY=<nueva> kijutech_app \
 *     node scripts/rotate-encryption-key.js
 *
 *   # 4) Aplicar (todo en una transacción: o se rotan todas o ninguna):
 *   docker exec -e OLD_AI_ENCRYPTION_KEY=<vieja> -e NEW_AI_ENCRYPTION_KEY=<nueva> kijutech_app \
 *     node scripts/rotate-encryption-key.js --apply
 *
 *   # 5) Pon la clave nueva en .env (AI_ENCRYPTION_KEY) y reinicia la app:  docker compose up -d
 *
 * Variables: POSTGRES_URL (ya está en el contenedor), OLD_AI_ENCRYPTION_KEY, NEW_AI_ENCRYPTION_KEY.
 * Formato (igual que lib/ai/encryption.ts): AES-256-GCM; `encrypted` = hex(cifrado || etiqueta de
 * 16 bytes) e `iv` = hex(16 bytes).
 */
const crypto = require('crypto');
const postgres = require('postgres');

const ALGORITHM = 'aes-256-gcm';

// Cada entrada: tabla, columna cifrada y columna del IV. Todas tienen clave primaria `id`.
const TARGETS = [
  { table: 'ai_provider_settings', enc: 'api_key_encrypted', iv: 'api_key_iv' },
  { table: 'ai_provider_settings', enc: 'embedding_api_key_encrypted', iv: 'embedding_api_key_iv' },
  { table: 'ops_clickup_connections', enc: 'api_key_encrypted', iv: 'api_key_iv' },
  { table: 'ops_telegram_config', enc: 'bot_token_encrypted', iv: 'bot_token_iv' }
];

function loadKey(name) {
  const hex = process.env[name];
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    console.error(`${name} debe ser una clave de 64 caracteres hexadecimales.`);
    process.exit(1);
  }
  return Buffer.from(hex, 'hex');
}

function decrypt(key, encrypted, iv) {
  const buf = Buffer.from(encrypted, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  return Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]).toString('utf8');
}

function encrypt(key, text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return { encrypted: Buffer.concat([ct, cipher.getAuthTag()]).toString('hex'), iv: iv.toString('hex') };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const oldKey = loadKey('OLD_AI_ENCRYPTION_KEY');
  const newKey = loadKey('NEW_AI_ENCRYPTION_KEY');
  if (oldKey.equals(newKey)) {
    console.error('La clave nueva es igual a la vieja: no hay nada que rotar.');
    process.exit(1);
  }
  if (!process.env.POSTGRES_URL) {
    console.error('Falta POSTGRES_URL.');
    process.exit(1);
  }

  const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
  let total = 0;
  try {
    await sql.begin(async (tx) => {
      for (const { table, enc, iv } of TARGETS) {
        // Los nombres de tabla y columna vienen de la lista de arriba, no de entrada externa.
        const rows = await tx.unsafe(`SELECT id, ${enc} AS enc, ${iv} AS iv FROM ${table} WHERE ${enc} IS NOT NULL FOR UPDATE`);
        for (const row of rows) {
          let plain;
          try {
            plain = decrypt(oldKey, row.enc, row.iv);
          } catch {
            throw new Error(`No se pudo descifrar ${table}.${enc} (id ${row.id}) con la clave vieja. No se ha cambiado nada.`);
          }
          const next = encrypt(newKey, plain);
          if (decrypt(newKey, next.encrypted, next.iv) !== plain) {
            throw new Error(`La comprobación de ida y vuelta falló en ${table}.${enc} (id ${row.id}).`);
          }
          if (apply) {
            await tx.unsafe(`UPDATE ${table} SET ${enc} = $1, ${iv} = $2 WHERE id = $3`, [next.encrypted, next.iv, row.id]);
          }
          total++;
        }
        console.log(`${table}.${enc}: ${rows.length} valor(es)`);
      }
    });
    console.log(
      apply
        ? `\nListo: ${total} valor(es) recifrados con la clave nueva.\nAhora pon NEW_AI_ENCRYPTION_KEY como AI_ENCRYPTION_KEY en .env y reinicia la app (docker compose up -d).`
        : `\nPrueba en seco OK: ${total} valor(es) se pueden rotar. No se ha escrito nada; repite con --apply.`
    );
  } catch (e) {
    console.error(`\nERROR: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main();
