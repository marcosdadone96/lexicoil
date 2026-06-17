#!/usr/bin/env node
/**
 * HttpOnly cookie auth helpers — getBearer reads cookie; CORS credentials gated.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const http = require(path.join(ROOT, 'netlify/functions/lib/http.js'));

let passed = 0;
let failed = 0;

function check(label, cond) {
  if (cond) {
    console.log('  OK:', label);
    passed++;
  } else {
    console.error('FAIL:', label);
    failed++;
  }
}

console.log('\n[a] parseCookies + getBearer');
{
  const event = {
    headers: {
      cookie: 'lc_token=abc123; other=x',
      authorization: 'Bearer header-token',
    },
  };
  check('Bearer header preferred', http.getBearer(event) === 'header-token');
  const cookieOnly = { headers: { Cookie: 'lc_token=cookie-token' } };
  check('cookie fallback', http.getBearer(cookieOnly) === 'cookie-token');
}

console.log('\n[b] auth cookie serialization');
{
  const localEvent = { headers: { host: 'localhost:8888' } };
  const prodEvent = { headers: { host: 'www.lexicoil.com', 'x-forwarded-proto': 'https' } };
  const localCookie = http.serializeAuthCookie('jwt.here', localEvent);
  const prodCookie = http.serializeAuthCookie('jwt.here', prodEvent);
  check('local cookie HttpOnly no Secure', /HttpOnly/.test(localCookie) && !/Secure/.test(localCookie));
  check('prod cookie Secure', /Secure/.test(prodCookie));
  check('Max-Age 30d', localCookie.includes(`Max-Age=${http.AUTH_COOKIE_MAX_AGE}`));
  check('clear cookie Max-Age=0', http.serializeClearAuthCookie(prodEvent).includes('Max-Age=0'));
}

console.log('\n[c] CORS credentials only for allowed origins');
{
  const allowed = http.corsHeaders({ headers: { origin: 'https://www.lexicoil.com' } });
  const denied = http.corsHeaders({ headers: { origin: 'https://evil.example' } });
  check('allowed origin gets ACAO + credentials', allowed['Access-Control-Allow-Origin'] === 'https://www.lexicoil.com' && allowed['Access-Control-Allow-Credentials'] === 'true');
  check('unknown origin omits ACAO', !denied['Access-Control-Allow-Origin']);
  check('unknown origin omits credentials', !denied['Access-Control-Allow-Credentials']);
}

console.log('\n[d] authSessionResponse includes token in JSON body');
{
  const event = { headers: { host: 'localhost:8888' } };
  const cors = http.corsHeaders(event);
  const resp = http.authSessionResponse(200, cors, { user: { email: 'a@b.c' } }, 'jwt.here', event);
  const body = JSON.parse(resp.body);
  check('token in body', body.token === 'jwt.here');
  check('Set-Cookie present', resp.headers['Set-Cookie']?.includes('lc_token=jwt.here'));
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
