import { describe, expect, it } from 'vitest';
import { normalizeText } from '../../src/engine/normalize';

describe('normalizeText', () => {
  it('elimina el carácter de reemplazo U+FFFD, tildes y espacios repetidos', () => {
    expect(normalizeText('a�b')).toBe('AB');
    expect(normalizeText(' Preparácion   riego� ')).toBe('PREPARACION RIEGO');
    expect(normalizeText('Caña')).toBe('CANA');
  });
});
