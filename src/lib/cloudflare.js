import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getBindings() {
  try {
    const { env, ctx } = await getCloudflareContext({ async: true });
    return { env, ctx };
  } catch {
    return { env: null, ctx: null };
  }
}
