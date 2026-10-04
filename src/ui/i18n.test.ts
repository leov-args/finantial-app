import { describe, expect, it } from 'vitest';
import { t, setLocale } from './i18n';
import { esES } from './i18n/es-ES';

describe('i18n', () => {
  it('returns translation for key', () => {
    expect(t('common.save')).toBe('Guardar');
  });

  it('interpolates params', () => {
    const res = t('errors.cannotClearIncomeWithAssignedParts', {
      name: 'Ana',
      lines: 'Alquiler',
    });
    expect(res).toContain('Ana');
    expect(res).toContain('Alquiler');
  });

  it('changes locale', () => {
    setLocale('es-ES', esES);
    expect(t('common.cancel')).toBe('Cancelar');
  });
});
