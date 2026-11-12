// Prepara /opt/kijutech/watchdog.env (permisos 600) para el vigilante externo: el token del bot y el chat del
// dueño, para poder avisar por Telegram aunque la app esté caída. Se ejecuta DENTRO del contenedor de la app
// (tiene POSTGRES_URL y AI_ENCRYPTION_KEY) y su salida se redirige a un archivo del servidor: el token
// nunca se muestra en pantalla ni sale del servidor.
//   docker exec kijutech_app node scripts/watchdog-env.mjs > /opt/kijutech/watchdog.env && chmod 600 /opt/kijutech/watchdog.env
import crypto from 'node:crypto';
import postgres from 'postgres';

const sql = postgres(process.env.POSTGRES_URL, { max: 1 });
try {
  const [cfg] = await sql`select tenant_id, bot_token_encrypted, bot_token_iv from ops_telegram_config limit 1`;
  if (!cfg) throw new Error('No hay bot de Telegram configurado');
  const key = Buffer.from(process.env.AI_ENCRYPTION_KEY, 'hex');
  const buf = Buffer.from(cfg.bot_token_encrypted, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(cfg.bot_token_iv, 'hex'));
  decipher.setAuthTag(buf.subarray(buf.length - 16));
  const token = Buffer.concat([decipher.update(buf.subarray(0, buf.length - 16)), decipher.final()]).toString('utf8');
  const [owner] = await sql`
    select m.telegram_chat_id from ops_telegram_members m
    join ops_clickup_connections c on c.tenant_id = m.tenant_id and c.me_clickup_id = m.clickup_user_id
    where m.tenant_id = ${cfg.tenant_id} and m.telegram_chat_id is not null limit 1`;
  if (!owner) throw new Error('El dueño no tiene el chat de Telegram vinculado');
  process.stdout.write(`TG_TOKEN=${token}\nTG_CHAT=${owner.telegram_chat_id}\n`);
} catch (e) {
  process.stderr.write(`watchdog-env: ${e.message}\n`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
