/**
 * Valida el schema Zod UpdateProfileBody del PATCH /users/me.
 * Foco: el avatarUrl ahora acepta el esquema centinela `hero:<presetId>`
 * además de URLs http(s) (ver apps/web/src/lib/heroAvatar.ts).
 */
import { describe, expect, it } from 'vitest';
import { UpdateProfileBody } from '../src/routes/user.routes.js';

describe('UpdateProfileBody — avatarUrl', () => {
  it('acepta el esquema hero:<presetId>', () => {
    const r = UpdateProfileBody.safeParse({ avatarUrl: 'hero:beast' });
    expect(r.success).toBe(true);
  });

  it('acepta hero ids con guiones y números', () => {
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'hero:dawn' }).success).toBe(true);
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'hero:nft-1' }).success).toBe(true);
  });

  it('sigue aceptando URLs http(s) normales (Google avatar)', () => {
    const ok = UpdateProfileBody.safeParse({
      avatarUrl: 'https://lh3.googleusercontent.com/a/abc123',
    });
    expect(ok.success).toBe(true);
  });

  it('rechaza basura (no URL, no hero:)', () => {
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'javascript:alert(1)' }).success).toBe(false);
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'hero:' }).success).toBe(false);
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'hero:Beast' }).success).toBe(false); // mayúsc no permitidas
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'ftp://x/y' }).success).toBe(false);
    expect(UpdateProfileBody.safeParse({ avatarUrl: 'just text' }).success).toBe(false);
  });

  it('respeta el límite de 500 chars', () => {
    const tooLong = 'https://x.com/' + 'a'.repeat(500);
    expect(UpdateProfileBody.safeParse({ avatarUrl: tooLong }).success).toBe(false);
  });

  it('avatarUrl es opcional', () => {
    expect(UpdateProfileBody.safeParse({ displayName: 'Anuar' }).success).toBe(true);
    expect(UpdateProfileBody.safeParse({}).success).toBe(true);
  });

  it('username/displayName siguen validando como antes', () => {
    expect(UpdateProfileBody.safeParse({ username: 'ab' }).success).toBe(false); // < 3
    expect(UpdateProfileBody.safeParse({ username: 'valid_1' }).success).toBe(true);
    expect(UpdateProfileBody.safeParse({ displayName: '' }).success).toBe(false); // < 1
  });
});
