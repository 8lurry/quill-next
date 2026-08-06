import { describe, it, expect } from 'vitest';
import Quill from '../../../src/quill.js';
import Delta from '@quill-next/delta-es';
import Editor from '../../../src/core/editor.js';
import {
  createScroll,
  createRegistry,
  createQuill,
} from '../__helpers__/factory.js';
import { GenericContainer, Styles } from 'parchment';

const OPTIONS = {
  modules: { clipboard: true },
  registry: createRegistry([GenericContainer, Styles]),
  containerFormats: true,
};

describe('constainer formats', () => {
  it('serializes nested containers', () => {
    const quill = createQuill(
      `
        <div style="padding:2px">
          <div style="width:50%">
            <p style="background:blue">Hello</p>
          </div>
        </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta().insert('Hello').insert('\n', {
        styles: {
          background: 'blue',
        },
        container: [
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: {
                width: '50%',
              },
            },
          },
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: {
                padding: '2px',
              },
            },
          },
        ],
      }),
    );
  });

  it('serializes empty intermediate containers', () => {
    const quill = createQuill(
      `
      <div style="padding: 2px;">
        <div>
          <p>Hello</p>
        </div>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta().insert('Hello').insert('\n', {
        container: [
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
          },
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: {
                padding: '2px',
              },
            },
          },
        ],
      }),
    );
  });

  it('serializes three nested containers', () => {
    const quill = createQuill(
      `
      <div style="padding:2px">
        <div style="width:50%">
          <div style="margin:10px">
            <p>Hello</p>
          </div>
        </div>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta().insert('Hello').insert('\n', {
        container: [
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: { margin: '10px' },
            },
          },
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: { width: '50%' },
            },
          },
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: { padding: '2px' },
            },
          },
        ],
      }),
    );
  });

  it('serializes block and container formats independently', () => {
    const quill = createQuill(
      `
      <div style="padding:2px">
        <p style="background:blue;text-align:center">
          Hello
        </p>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta().insert('Hello').insert('\n', {
        styles: {
          background: 'blue',
          textAlign: 'center',
        },
        container: [
          {
            action: 'REUSE',
            allowSplit: true,
            blot: 'generic-container',
            formats: {
              styles: {
                padding: '2px',
              },
            },
          },
        ],
      }),
    );
  });

  it('shared container accross multiple blocks', () => {
    const quill = createQuill(
      `
      <div style="padding:2px">
        <p>One</p>
        <p>Two</p>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('One')
        .insert('\n', {
          container: [
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        })
        .insert('Two')
        .insert('\n', {
          container: [
            {
              action: 'MERGE_TO_PREV',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        }),
    );
  });

  it('different container heirarcies', () => {
    const quill = createQuill(
      `
      <div style="padding:2px">
        <p>One</p>
      </div>

      <div style="margin:10px">
        <p>Two</p>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('One')
        .insert('\n', {
          container: [
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        })
        .insert('Two')
        .insert('\n', {
          container: [
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { margin: '10px' },
              },
            },
          ],
        }),
    );
  });

  it('Round-trip through Delta', () => {
    const quill = createQuill(
      `
      <div style="padding: 2px;">
        <div style="width: 50%;">
          <p style="background: blue;">Hello</p>
        </div>
      </div>
      `,
      OPTIONS,
    );
    const delta = quill.getContents();

    const scroll = createScroll('', createRegistry([GenericContainer, Styles]));
    scroll.containerFormats = true;

    const editor2 = new Editor(scroll);
    editor2.applyDelta(delta);

    expect(scroll.domNode.innerHTML).toEqual(
      '<div style="padding: 2px;"><div style="width: 50%;"><p style="background: blue;">Hello</p></div></div><p><br></p>',
    );
  });

  it('nested containers with multiple blocks', () => {
    const quill = createQuill(
      `
      <div style="padding:2px">
        <div style="width:50%">
          <p>One</p>
          <p>Two</p>
        </div>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('One')
        .insert('\n', {
          container: [
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { width: '50%' },
              },
            },
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        })
        .insert('Two')
        .insert('\n', {
          container: [
            {
              action: 'MERGE_TO_PREV',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { width: '50%' },
              },
            },
            {
              action: 'MERGE_TO_PREV',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        }),
    );
  });

  it('different nesting depths', () => {
    const quill = createQuill(
      `
      <div style="padding:2px">
        <p>One</p>
      </div>

      <div style="padding:2px">
        <div style="width:50%">
          <p>Two</p>
        </div>
      </div>
      `,
      OPTIONS,
    );

    expect(quill.getContents()).toEqual(
      new Delta()
        .insert('One')
        .insert('\n', {
          container: [
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        })
        .insert('Two')
        .insert('\n', {
          container: [
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { width: '50%' },
              },
            },
            {
              action: 'REUSE',
              allowSplit: true,
              blot: 'generic-container',
              formats: {
                styles: { padding: '2px' },
              },
            },
          ],
        }),
    );
  });

  describe('editor operations', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    it('who wins when container formats are different', () => {
      container.innerHTML = `
        <p style="margin: 2px;">One</p>
        <p style="margin: 10px;">Two</p>
      `;

      const quill = createQuill(container, OPTIONS);

      const index = 4;
      quill.setSelection(index, 0, Quill.sources.SILENT);
      quill.deleteText(index - 1, 1, Quill.sources.USER);

      expect(quill.root.innerHTML).toEqual(
        '<p style="margin: 10px;">OneTwo</p>',
      );
    });

    it('backspace at the beginning of a line', () => {
      container.innerHTML = `
        <div style="padding: 2px;">
          <p>One</p>
        </div>

        <div style="margin: 10px;">
          <p>Two</p>
        </div>
      `;

      const quill = createQuill(container, OPTIONS);

      const index = 4;
      quill.setSelection(index, 0, Quill.sources.SILENT);
      quill.deleteText(index - 1, 1, Quill.sources.USER);

      expect(quill.root.innerHTML).toEqual(
        '<div style="margin: 10px;"><p>OneTwo</p></div>',
      );
    });
  });
});
