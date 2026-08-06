import Delta from '@quill-next/delta-es';
import { describe, test, expect } from 'vitest';
import { createRegistry, createQuill } from '../__helpers__/factory.js';
import { Styles } from '../../../src/formats/styles.js';
import { AlignStyle } from '../../../src/formats/align.js';

const OPTIONS = {
  modules: { table: true },
  registry: createRegistry([Styles, AlignStyle]),
  containerFormats: true,
};

describe('Styles', () => {
  test('add', () => {
    let quill = createQuill('<p>0123</p>', OPTIONS);
    quill.formatText(4, 1, {
      styles: {
        textAlign: 'center',
        maxWidth: '100px',
      },
    });
    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px'} }),
    );
    expect(quill.scroll.domNode).toEqualHTML(
      '<p style="text-align: center; max-width: 100px;">0123</p>',
    );

    quill = createQuill('<p>0123</p>', OPTIONS);
    quill.formatText(4, 1, {
      align: 'center',
      styles: {
        maxWidth: '100px',
      },
    });
    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px' } }),
    );
    expect(quill.scroll.domNode).toEqualHTML(
      '<p style="text-align: center; max-width: 100px;">0123</p>',
    );
  });

  test('remove', () => {
    const quill = createQuill(
      '<p style="text-align: center; max-width: 100px;">0123</p>',
      OPTIONS,
    );
    quill.formatText(4, 1, { align: false });
    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { styles: { maxWidth: '100px' } }),
    );
    expect(quill.scroll.domNode).toEqualHTML(
      '<p style="max-width: 100px;">0123</p>',
    );

    quill.formatText(4, 1, { align: 'center' });
    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px' } }),
    );
    expect(quill.scroll.domNode).toEqualHTML(
      '<p style="max-width: 100px; text-align: center;">0123</p>',
    );

    quill.formatText(4, 1, { styles: { maxWidth: false } });
    expect(quill.getContents()).toEqual(
      new Delta().insert('0123').insert('\n', { align: 'center' }),
    );
    expect(quill.scroll.domNode).toEqualHTML(
      '<p style="text-align: center;">0123</p>',
    );

    quill.formatText(4, 1, { styles: false });
    expect(quill.getContents()).toEqual(new Delta().insert('0123\n'));
    expect(quill.scroll.domNode).toEqualHTML('<p>0123</p>');
  });

  test('DOM mount', () => {
    const html = '<p style="text-align: center; max-width: 100px;">0123</p>';
    const quill = createQuill(html, OPTIONS);
    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px' } }),
    );
    expect(quill.root).toEqualHTML(
      '<p style="max-width: 100px; text-align: center;">0123</p>',
    );
    const contents = quill.clipboard.convert({
      html: `${html}<p><br></p>`,
      text: '\n',
    });

    quill.setContents(contents);
    expect(quill.root).toEqualHTML(
      '<p style="max-width: 100px; text-align: center;">0123</p>',
    );
  });
});
