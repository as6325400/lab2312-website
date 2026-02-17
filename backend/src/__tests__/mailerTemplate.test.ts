import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../utils/mailer';

// Note: renderTemplate is now exported from mailer.ts

describe('renderTemplate', () => {
  it('replaces single variable', () => {
    const template = { subject: 'Hello {{name}}', body: 'Welcome {{name}}!' };
    const result = renderTemplate(template, { name: 'Alice' });
    expect(result.subject).toBe('Hello Alice');
    expect(result.body).toBe('Welcome Alice!');
  });

  it('replaces multiple variables', () => {
    const template = {
      subject: 'Account: {{username}}',
      body: '{{name}}, your password is {{password}}, login at {{url}}',
    };
    const result = renderTemplate(template, {
      name: 'Bob',
      username: 'bob123',
      password: 'P@ss1234',
      url: 'https://lab.example.com',
    });
    expect(result.subject).toBe('Account: bob123');
    expect(result.body).toBe('Bob, your password is P@ss1234, login at https://lab.example.com');
  });

  it('replaces unknown variables with empty string', () => {
    const template = { subject: '{{known}} and {{unknown}}', body: '{{missing}}' };
    const result = renderTemplate(template, { known: 'yes' });
    expect(result.subject).toBe('yes and ');
    expect(result.body).toBe('');
  });

  it('returns unchanged text when no variables', () => {
    const template = { subject: 'Plain subject', body: 'Plain body' };
    const result = renderTemplate(template, { name: 'unused' });
    expect(result.subject).toBe('Plain subject');
    expect(result.body).toBe('Plain body');
  });

  it('handles template with same variable multiple times', () => {
    const template = { subject: '{{name}}', body: '{{name}} is {{name}}' };
    const result = renderTemplate(template, { name: 'test' });
    expect(result.body).toBe('test is test');
  });
});
