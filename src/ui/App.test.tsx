import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('M0 workspace', () => {
  it('renders the empty workspace without project data or browser APIs', () => {
    const markup = renderToStaticMarkup(<App />);

    expect(markup).toContain('aria-label="Drawing workspace"');
    expect(markup).toContain('<svg class="drawing-canvas"');
    expect(markup).toContain('No rooms have been drawn.');
    expect(markup).toContain('aria-label="Project inspector"');
    expect(markup).toContain('aria-label="Command line"');
    expect(markup).toContain('aria-label="Drawing status"');
    expect(markup).toContain('0/0 done');
  });

  it('keeps unfinished actions disabled', () => {
    const markup = renderToStaticMarkup(<App />);
    const controls = markup.match(/<(?:button|input)\b[^>]*>/g);

    expect(controls).not.toBeNull();
    for (const control of controls ?? []) {
      expect(control).toContain('disabled=""');
    }
  });
});
