import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('publish catalog workflow', () => {
  it('generates, verifies, builds, and deploys the catalog with least privilege', () => {
    const workflow = readFileSync('.github/workflows/publish-catalog.yml', 'utf8');
    for (const required of [
      'workflow_dispatch:',
      "cron: '0 */6 * * *'",
      'contents: read',
      'pages: write',
      'id-token: write',
      'actions/setup-node@v4',
      'node-version: 22.22.2',
      'npm ci',
      'npm run test:run',
      'npm run catalog:generate',
      'npm run catalog:check -- --input catalog/generated',
      'npm run build',
      'actions/upload-pages-artifact@v3',
      'actions/deploy-pages@v4',
      'environment:',
      'github-pages',
    ]) {
      expect(workflow, `missing workflow contract: ${required}`).toContain(required);
    }
  });

  it('keeps CI dependencies on the public npm registry', () => {
    expect(existsSync('.npmrc')).toBe(true);
    if (!existsSync('.npmrc')) return;
    expect(readFileSync('.npmrc', 'utf8')).toContain('registry=https://registry.npmjs.org/');
    expect(readFileSync('package-lock.json', 'utf8')).not.toContain('public.repo.ddns.e-lead.cn');
  });
});
