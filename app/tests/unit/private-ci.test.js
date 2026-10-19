import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
describe('Salida privada de regresiones CI', () => {
  it.each([0, 1])('conserva código %s y conteos sin emitir registros ni errores sensibles', (status) => {
    const result = spawnSync(
      process.execPath,
      [
        path.resolve('scripts/private-ci-check.mjs'),
        'synthetic',
        'node',
        '-e',
        `console.log('PRODUCTOR SINTETICO PRIVADO');console.error('DETALLE PRIVADO');console.log('3/4 comprobaciones correctas');process.exit(${status})`,
      ],
      { encoding: 'utf8', env: { ...process.env, CASUR_CI_RESULTS: '' } },
    );
    expect(result.status).toBe(status);
    expect(result.stdout).toContain('3/4');
    expect(result.stdout + result.stderr).not.toContain('PRIVADO');
  });
});
