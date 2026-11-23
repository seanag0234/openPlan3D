import { accessRefusal } from './_access';
import { status, type Context } from './_shared';

export async function onRequest({ request, env, next }: Context) {
  const refusal = await accessRefusal(request.headers.get('Cf-Access-Jwt-Assertion'), env);
  return refusal ? status(403, refusal) : next();
}
