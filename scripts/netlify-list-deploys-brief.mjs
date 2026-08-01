#!/usr/bin/env node
import { execSync } from 'node:child_process';

const siteId = 'a8cc77ba-9739-4a07-bea0-26fffd993a77';
const payload = JSON.stringify({ site_id: siteId, page: 1, per_page: 10 });
const out = execSync(`npx netlify api listSiteDeploys --data ${JSON.stringify(payload)}`, {
  encoding: 'utf8',
  maxBuffer: 8e6,
  shell: true,
});
const arr = JSON.parse(out);
for (const d of arr) {
  console.log(JSON.stringify({
    id: d.id,
    state: d.state,
    commit_ref: d.commit_ref,
    published_at: d.published_at,
    created_at: d.created_at,
    error_message: d.error_message,
    title: d.title,
    branch: d.branch,
    context: d.context,
  }));
}
