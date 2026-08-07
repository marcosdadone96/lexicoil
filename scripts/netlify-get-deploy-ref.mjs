#!/usr/bin/env node
import { execSync } from 'node:child_process';

const siteId = process.argv[2] || 'a8cc77ba-9739-4a07-bea0-26fffd993a77';
const deployId = process.argv[3];
if (deployId) {
  const payload = JSON.stringify({ site_id: siteId, deploy_id: deployId });
  const out = execSync(`npx netlify api getSiteDeploy --data ${JSON.stringify(payload)}`, {
    encoding: 'utf8',
    maxBuffer: 5e6,
    shell: true,
  });
  console.log(out);
  process.exit(0);
}
const listPayload = JSON.stringify({ site_id: siteId, page: 1, per_page: 8 });
const listOut = execSync(`npx netlify api listSiteDeploys --data ${JSON.stringify(listPayload)}`, {
  encoding: 'utf8',
  maxBuffer: 5e6,
  shell: true,
});
const arr = JSON.parse(listOut);
for (const d of arr) {
  console.log(
    [d.id?.slice(0, 12), d.state, d.commit_ref?.slice(0, 7) || 'null', d.published_at?.slice(0, 19) || ''].join(
      ' | ',
    ),
  );
}
