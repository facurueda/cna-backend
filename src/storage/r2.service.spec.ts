import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { R2Service } from './r2.service';

const PROJECT = 'prj_default_0000000000000000';

function buildService(env: Record<string, string | undefined>) {
  const config = {
    get: (key: string) => env[key],
  } as unknown as ConfigService;

  return new R2Service(config);
}

describe('R2Service — aislamiento por entorno', () => {
  it('prefija las keys con el entorno', () => {
    const service = buildService({ R2_KEY_PREFIX: 'staging' });

    expect(service.buildSourceKey(PROJECT, 'clip-1', '.mp4')).toBe(
      `staging/${PROJECT}/clips/clip-1/source.mp4`,
    );
    expect(service.buildVideoKey(PROJECT, 'clip-1')).toBe(
      `staging/${PROJECT}/clips/clip-1/video.mp4`,
    );
    expect(service.buildThumbnailKey(PROJECT, 'clip-1')).toBe(
      `staging/${PROJECT}/clips/clip-1/thumbnail.jpg`,
    );
  });

  it('cae a NODE_ENV cuando no hay R2_KEY_PREFIX', () => {
    const service = buildService({ NODE_ENV: 'production' });

    expect(service.buildSourceKey(PROJECT, 'clip-1', '.mp4')).toBe(
      `production/${PROJECT}/clips/clip-1/source.mp4`,
    );
  });

  it('staging y produccion nunca generan la misma key', () => {
    // El projectId es identico en ambas bases (lo fija la migracion), asi que el
    // unico separador real es el prefijo de entorno.
    const staging = buildService({ R2_KEY_PREFIX: 'staging' });
    const prod = buildService({ R2_KEY_PREFIX: 'production' });

    expect(staging.buildSourceKey(PROJECT, 'mismo-clip', '.mp4')).not.toBe(
      prod.buildSourceKey(PROJECT, 'mismo-clip', '.mp4'),
    );
  });

  it('rechaza una key de otro entorno', () => {
    const staging = buildService({ R2_KEY_PREFIX: 'staging' });
    const prodKey = `production/${PROJECT}/clips/clip-1/video.mp4`;

    expect(() => staging.assertKeyBelongsToProject(prodKey, PROJECT)).toThrow(
      BadRequestException,
    );
  });

  it('rechaza una key de otro proyecto', () => {
    const service = buildService({ R2_KEY_PREFIX: 'staging' });
    const otherKey = `staging/otro-proyecto/clips/clip-1/video.mp4`;

    expect(() => service.assertKeyBelongsToProject(otherKey, PROJECT)).toThrow(
      BadRequestException,
    );
  });

  it('acepta una key del proyecto y entorno correctos', () => {
    const service = buildService({ R2_KEY_PREFIX: 'staging' });
    const key = service.buildVideoKey(PROJECT, 'clip-1');

    expect(() => service.assertKeyBelongsToProject(key, PROJECT)).not.toThrow();
  });

  it('normaliza el prefijo (barras, mayusculas, espacios)', () => {
    const service = buildService({ R2_KEY_PREFIX: '/Staging Env/' });

    expect(service.getKeyPrefix()).toBe('staging-env');
  });
});
