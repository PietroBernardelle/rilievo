import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('Sketch workspace', () => {
  it('renders the empty workspace without project data or browser APIs', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Drawing workspace"');
    expect(markup).toContain('aria-label="Drawing area"');
    expect(markup).toContain('No rooms');
    expect(markup).toContain('aria-label="Project inspector"');
    expect(markup).toContain('aria-label="Command line"');
    expect(markup).toContain('aria-label="Drawing status"');
    expect(markup).toContain('0/0 done');
  });

  it('enables sketch tools while later milestone tools stay disabled', () => {
    const markup = renderToStaticMarkup(<App />);
    const buttons = markup.match(/<button\b[^>]*>/g) ?? [];
    expect(
      buttons.find((button) => button.includes('Rectangle (R)')),
    ).not.toContain('disabled=""');
    expect(
      buttons.find((button) => button.includes('Polygon (P)')),
    ).not.toContain('disabled=""');
    expect(buttons.find((button) => button.includes('Door (D)'))).toContain(
      'disabled=""',
    );
  });
});
