/**
 * Woher die App im Store-Build das Paket-Repo nimmt (28.10.2026).
 *
 * `expo-constants` exportiert seine Daten nur als `default`. Der Test bildet
 * das Modul genau so nach; vorher las `loadPackConfig` an `default` vorbei,
 * fiel still auf `OWNER/REPO` zurück, und auf dem iPhone scheiterte jeder
 * Paket-Download.
 */
import appJson from '../../../app.json';

import { DEFAULT_PACK_REPO, loadPackConfig } from './config';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { pack: { repo: 'beispiel/repo', baseUrlOverride: null } } } },
}));

describe('loadPackConfig', () => {
  it('liest das Repo aus dem default-Export von expo-constants', () => {
    expect(loadPackConfig()).toEqual({ repo: 'beispiel/repo', baseUrlOverride: null });
  });

  it('app.json trägt ein echtes Paket-Repo, keinen Platzhalter', () => {
    const repo = appJson.expo.extra.pack.repo;
    expect(repo).not.toBe(DEFAULT_PACK_REPO);
    expect(repo).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(loadPackConfig(appJson.expo.extra)).toEqual({ repo, baseUrlOverride: null });
  });
});
