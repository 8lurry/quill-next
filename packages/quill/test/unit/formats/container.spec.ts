import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Quill, { type QuillOptions } from '../../../src/quill.js';
import Delta from '@quill-next/delta-es';
import Editor from '../../../src/core/editor.js';
import {
  createScroll,
  createRegistry,
  createQuill,
} from '../__helpers__/factory.js';
import { GenericContainer, Styles } from 'parchment';
import { normalizeHTML } from '../__helpers__/utils.js';
import type Table from '../../../src/modules/table.js';
import {
  TableCell,
  TableContainerCell,
  TableRow,
  TableBody,
  TableContainer,
} from '../../../src/formats/table.js';
import Video from '../../../src/formats/video.js';
import { merge, cloneDeep } from 'lodash-es';

const DEFAULT_OPTIONS: QuillOptions = {
  modules: { clipboard: true, table: true },
  registry: createRegistry([GenericContainer, Styles, Video]),
  features: {
    hierarchy: true,
    styles: true,
  },
};

let OPTION_OVERRIDES: QuillOptions = {};

const resetOptions = () => {
  OPTIONS = merge(cloneDeep(DEFAULT_OPTIONS), cloneDeep(OPTION_OVERRIDES));
};

let OPTIONS: QuillOptions;

describe('constainer formats', () => {
  beforeEach(() => {
    resetOptions();
  });

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
    scroll.hierarchical = true;

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

  describe('table operations', () => {
    beforeAll(() => {
      OPTION_OVERRIDES.modules = { table: true };
      OPTION_OVERRIDES.registry = createRegistry([
        TableCell,
        TableContainerCell,
        TableRow,
        TableBody,
        TableContainer,
        GenericContainer,
        Styles,
      ]);
    });

    afterAll(() => {
      OPTION_OVERRIDES = {};
    });

    it("loading table's container cells", () => {
      const quill = createQuill(
        `
        <table>
          <tbody>
            <tr>
              <td><p>first cell</p></td>
              <td><p>second cell</p></td>
            </tr>
          </tbody>
        </table>
      `,
        OPTIONS,
      );

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
          <table>
            <tbody>
              <tr>
                <td class="ql-cell-as-container"><p>first cell</p></td>
                <td class="ql-cell-as-container"><p>second cell</p></td>
              </tr>
            </tbody>
          </table>
          `,
        ),
        { ignoreAttrs: ['data-row'] },
      );
    });

    it('inserting a table within a container', () => {
      const quill = createQuill(
        `
        <div style="padding: 2px;">
          <p>One</p>
          <p><br></p>
        </div>
      `,
        OPTIONS,
      );

      quill.setSelection(4, 0);
      const tableModule = quill.getModule('table') as Table;
      tableModule.insertTable(2, 2);

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
          <div style="padding: 2px;">
            <p>One</p>
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container"><p><br></p></td>
                  <td class="ql-cell-as-container"><p><br></p></td>
                </tr>
                <tr>
                  <td class="ql-cell-as-container"><p><br></p></td>
                  <td class="ql-cell-as-container"><p><br></p></td>
                </tr>
              </tbody>
            </table>
            <p><br></p>
          </div>
          `,
        ),
        { ignoreAttrs: ['data-row'] },
      );
    });
  });

  describe('inserting without container formats', () => {
    beforeAll(() => {
      OPTION_OVERRIDES.modules = { table: true };
      OPTION_OVERRIDES.registry = createRegistry([
        TableCell,
        TableRow,
        TableBody,
        TableContainer,
      ]);
    });

    afterAll(() => {
      OPTION_OVERRIDES = {};
    });

    it('inserting a table in non container editor', () => {
      delete OPTIONS.features;
      const quill = createQuill(
        `
        <p>One</p>
        <p><br></p>
      `,
        OPTIONS,
      );

      quill.setSelection(4, 0);
      const tableModule = quill.getModule('table') as Table;
      tableModule.insertTable(2, 2);

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
          <p>One</p>
          <table>
            <tbody>
              <tr>
                <td><br></td>
                <td><br></td>
              </tr>
              <tr>
                <td><br></td>
                <td><br></td>
              </tr>
            </tbody>
          </table>
          <p><br></p>
          `,
        ),
        { ignoreAttrs: ['data-row'] },
      );
    });
  });

  describe('removal and insertion of containers at arbitrary depth', () => {
    it('removal and insertion of containers', () => {
      const dom = `
        <div style="padding: 2px;">
          <div style="width: 50%;">
            <p>Hello</p>
          </div>
          <div style="text-align: right;">
            <div style="margin: 10px;">
              <p>Above one</p>
            </div>
            <p>One</p>
            <div style="margin: 10px;">
              <p>Below one</p>
            </div>
          </div>
          <p><br></p>
        </div>
      `;
      const quill = createQuill(dom, OPTIONS);

      quill.setSelection(17, 5, Quill.sources.USER);

      quill.insertContainerAt({
        blot: 'generic-container',
        action: 'REUSE',
        allowSplit: true,
        formats: {
          styles: {
            padding: '5px',
          },
        },
      });

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
          <div style="padding: 2px;">
            <div style="width: 50%;">
              <p>Hello</p>
            </div>
            <div style="text-align: right;">
              <div style="margin: 10px;">
                <p>Above one</p>
              </div>
              <div style="padding: 5px;">
                <p>One</p>
                <div style="margin: 10px;">
                  <p>Below one</p>
                </div>
              </div>
            </div>
            <p><br></p>
          </div>
          `,
        ),
      );

      quill.deleteContainerAt();

      expect(quill.root.innerHTML).toEqualHTML(normalizeHTML(dom));

      quill.setSelection(4, 0, Quill.sources.USER);
      quill.deleteContainerAt();

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
          <div style="padding: 2px;">
            <p>Hello</p>
            <div style="text-align: right;">
              <div style="margin: 10px;">
                <p>Above one</p>
              </div>
              <p>One</p>
              <div style="margin: 10px;">
                <p>Below one</p>
              </div>
            </div>
            <p><br></p>
          </div>
          `,
        ),
      );

      quill.insertContainerAt({
        blot: 'generic-container',
        action: 'REUSE',
        allowSplit: true,
        formats: {
          styles: {
            width: '50%',
          },
        },
      });

      expect(quill.root.innerHTML).toEqualHTML(normalizeHTML(dom));

      quill.setSelection(quill.scroll.length() - 1, 0, Quill.sources.USER);
      quill.deleteContainerAt();

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
        <div style="padding: 2px;">
          <div style="width: 50%;">
            <p>Hello</p>
          </div>
          <div style="text-align: right;">
            <div style="margin: 10px;">
              <p>Above one</p>
            </div>
            <p>One</p>
            <div style="margin: 10px;">
              <p>Below one</p>
            </div>
          </div>
        </div>
        <p><br></p>
          `,
        ),
      );

      quill.insertContainerAt({
        blot: 'generic-container',
        action: 'MERGE_TO_PREV',
        allowSplit: true,
        formats: {
          styles: {
            padding: '2px',
          },
        },
      });

      expect(quill.root.innerHTML).toEqualHTML(normalizeHTML(dom));

      quill.setSelection(22, 0, Quill.sources.USER);

      quill.deleteContainerAt(1);

      expect(quill.root.innerHTML).toEqualHTML(
        normalizeHTML(
          `
        <div style="padding: 2px;">
          <div style="width: 50%;">
            <p>Hello</p>
          </div>
          <div style="text-align: right;">
            <div style="margin: 10px;">
              <p>Above one</p>
            </div>
            <p>One</p>
          </div>
          <div style="margin: 10px;">
            <p>Below one</p>
          </div>
          <p><br></p>
        </div>
        `,
        ),
      );

      quill.insertContainerAt(
        {
          blot: 'generic-container',
          action: 'MERGE_TO_PREV',
          allowSplit: true,
        },
        1,
      );

      expect(quill.root.innerHTML).toEqualHTML(normalizeHTML(dom));
    });
  });

  describe('containers around block embed', () => {
    it('block embeds within generic containers', () => {
      const html = `
      <div style="padding: 2px;">
        <div style="width: 50%;">
          <iframe src="#" class="ql-video" frameborder="0" allowfullscreen="true"> </iframe>
        </div>
      </div>
      `;

      const quill = createQuill(html, OPTIONS);

      expect(quill.getContents()).toEqual(
        new Delta()
          .insert(
            {
              video: '#',
            },
            {
              classes: {
                'ql-video': true,
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
            },
          )
          .insert('\n'),
      );

      quill.insertText(0, '\n', Quill.sources.USER);

      expect(quill.root.innerHTML).toEqualHTML(
        `
        <div style="padding: 2px;">
          <div style="width: 50%;">
            <p><br></p>
            <iframe src="#" class="ql-video" frameborder="0" allowfullscreen="true"></iframe>
          </div>
        </div>
        <p><br></p>
        `,
      );

      quill.deleteText({ index: 1, length: 1 }, Quill.sources.USER);

      expect(quill.root.innerHTML).toEqualHTML(
        `
        <div style="padding: 2px;">
          <div style="width: 50%;">
            <p><br></p>
          </div>
        </div>
        <p><br></p>
        `,
      );

      quill.insertEmbed(0, 'video', '#', Quill.sources.USER);

      expect(quill.root.innerHTML).toEqualHTML(
        `
        <div style="padding: 2px;">
          <div style="width: 50%;">
            <iframe src="#" class="ql-video" frameborder="0" allowfullscreen="true"></iframe>
            <p><br></p>
          </div>
        </div>
        <p><br></p>
        `,
      );
    });
  });
});
