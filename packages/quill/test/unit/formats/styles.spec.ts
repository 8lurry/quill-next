import Delta from '@quill-next/delta-es';
import Quill from '../../../src/core.js';
import Editor from '../../../src/core/editor.js';
import { describe, test, expect } from 'vitest';
import {
  createRegistry,
  createScroll as baseCreateScroll,
} from '../__helpers__/factory.js';
import { Styles } from '../../../src/formats/styles.js';
import { AlignStyle } from '../../../src/formats/align.js';
import { normalizeHTML } from '../__helpers__/utils.js';

const createScroll = (html: string) =>
  baseCreateScroll(html, createRegistry([Styles, AlignStyle]));

const createQuill = (html: string) => {
  const container = document.body.appendChild(document.createElement('div'));
  container.innerHTML = normalizeHTML(html);
  const quill = new Quill(container, {
    modules: { table: true },
    registry: createRegistry([Styles, AlignStyle]),
  });
  return quill;
};

describe('Styles', () => {
  test('add', () => {
    let editor = new Editor(createScroll('<p>0123</p>'));
    editor.formatText(4, 1, {
      styles: {
        textAlign: 'center',
        maxWidth: '100px',
      },
    });
    expect(editor.getDelta()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px'} }),
    );
    expect(editor.scroll.domNode).toEqualHTML(
      '<p style="text-align: center; max-width: 100px;">0123</p>',
    );

    editor = new Editor(createScroll('<p>0123</p>'));
    editor.formatText(4, 1, {
      align: 'center',
      styles: {
        maxWidth: '100px',
      },
    });
    expect(editor.getDelta()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px' } }),
    );
    expect(editor.scroll.domNode).toEqualHTML(
      '<p style="text-align: center; max-width: 100px;">0123</p>',
    );
  });

  test('remove', () => {
    const editor = new Editor(
      createScroll('<p style="text-align: center; max-width: 100px;">0123</p>'),
    );
    editor.formatText(4, 1, { align: false });
    expect(editor.getDelta()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { styles: { maxWidth: '100px' } }),
    );
    expect(editor.scroll.domNode).toEqualHTML(
      '<p style="max-width: 100px;">0123</p>',
    );

    editor.formatText(4, 1, { align: 'center' });
    expect(editor.getDelta()).toEqual(
      new Delta()
        .insert('0123')
        .insert('\n', { align: 'center', styles: { maxWidth: '100px' } }),
    );
    expect(editor.scroll.domNode).toEqualHTML(
      '<p style="max-width: 100px; text-align: center;">0123</p>',
    );

    editor.formatText(4, 1, { styles: { maxWidth: false } });
    expect(editor.getDelta()).toEqual(
      new Delta().insert('0123').insert('\n', { align: 'center' }),
    );
    expect(editor.scroll.domNode).toEqualHTML(
      '<p style="text-align: center;">0123</p>',
    );

    editor.formatText(4, 1, { styles: false });
    expect(editor.getDelta()).toEqual(new Delta().insert('0123\n'));
    expect(editor.scroll.domNode).toEqualHTML('<p>0123</p>');
  });

  test('DOM mount', () => {
    const html = '<p style="text-align: center; max-width: 100px;">0123</p>';
    const quill = createQuill(html);
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
