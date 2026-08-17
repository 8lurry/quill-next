import { expect } from '@playwright/test';
import { test } from './fixtures/index.js';
import { normalizeHTML } from '../unit/__helpers__/utils.js';

test.describe('editing with generic containers', () => {
  test.beforeEach(async ({ page, editorPage }) => {
    page.on('console', (msg) => console.log(msg.text()));

    await editorPage.open();
    await page.waitForFunction(() => {
      return window.quill != null;
    });
    await page.evaluate(() => {
      const { quill } = window;
      window.HierarchicalGlobals.registerHierarchyAndStyles();
      quill.scroll.hierarchical = true;
    });
  });

  test.describe('backspace', () => {
    test('backspace without container', async ({ page, editorPage }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            align: 'center',
            styles: { padding: '2px' },
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            align: 'right',
            direction: 'rtl',
            styles: { padding: '3px', width: '50%' },
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-center" style="padding: 2px;">One</p><p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;">Two</p>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(4, 0);
      });
      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-center" style="padding: 2px;">OneTwo</p>`,
      );
    });

    test('backspace on the start of a second line1', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { width: '50%' },
                },
              },
            ],
          },
        },
        {
          insert: 'Three',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '3px' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p></div><div style="width: 50%;"><p>Two</p></div><div style="padding: 3px;"><p>Three</p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(4, 0);
      });

      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p></div><p>Two</p><div style="padding: 3px;"><p>Three</p></div>`,
      );

      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>OneTwo</p></div><div style="padding: 3px;"><p>Three</p></div>`,
      );
    });

    test('backspace where there are multiple block in prev container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            align: 'center',
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            align: 'right',
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Three',
        },
        {
          insert: '\n',
          attributes: {
            align: 'justify',
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { width: '50%' },
                },
                reuse: false,
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p class="ql-align-center">One</p><p class="ql-align-right">Two</p></div><div style="width: 50%;"><p class="ql-align-justify">Three</p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(8, 0);
      });
      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p class="ql-align-center">One</p><p class="ql-align-right">Two</p></div><p class="ql-align-justify">Three</p>`,
      );
      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p class="ql-align-center">One</p><p class="ql-align-right">TwoThree</p></div>`,
      );
    });

    test('backspace on sibling blocks sharing same container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Three',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p><p>Two</p><p>Three</p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(8, 0);
      });
      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p><p>TwoThree</p></div>`,
      );
    });

    test('backspace on an empty line with a container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p><p><br></p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(4, 0);
      });
      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p></div><p><br></p>`,
      );

      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p></div>`,
      );
    });

    test('backspace on second sibling inside container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p><p>Two</p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(4, 0);
      });
      await page.keyboard.press('Backspace');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>OneTwo</p></div>`,
      );
    });
  });

  test.describe('Delete', () => {
    test('delete on the end of a first line without container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            align: 'center',
            styles: { padding: '2px' },
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            align: 'right',
            direction: 'rtl',
            styles: { padding: '3px', width: '50%' },
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-center" style="padding: 2px;">One</p><p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;">Two</p>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(3, 0);
      });
      await page.keyboard.press('Delete');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;">OneTwo</p>`,
      );
    });

    test('delete on the end of a first line with container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { width: '50%' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p>One</p></div><div style="width: 50%;"><p>Two</p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(3, 0);
      });
      await page.keyboard.press('Delete');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="width: 50%;"><p>OneTwo</p></div>`,
      );
    });
  });

  test.describe('Enter', () => {
    test('enter on the end of a first line without container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            align: 'center',
            styles: { padding: '2px' },
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            align: 'right',
            direction: 'rtl',
            styles: { padding: '3px', width: '50%' },
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-center" style="padding: 2px;">One</p><p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;">Two</p>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(3, 0);
      });
      await page.keyboard.press('Enter');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-center" style="padding: 2px;">One</p><p class="ql-align-center" style="padding: 2px;"><br></p><p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;">Two</p>`,
      );

      const selection = await editorPage.getSelection();
      expect(selection).toEqual({ index: 4, length: 0 });

      await page.evaluate(() => {
        window.quill.setSelection(8, 0);
      });

      await page.keyboard.press('Enter');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<p class="ql-align-center" style="padding: 2px;">One</p><p class="ql-align-center" style="padding: 2px;"><br></p><p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;">Two</p><p class="ql-align-right ql-direction-rtl" style="padding: 3px; width: 50%;"><br></p>`,
      );

      const selection2 = await editorPage.getSelection();
      expect(selection2).toEqual({ index: 9, length: 0 });
    });

    test('enter on the end of a first line with container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            styles: { minWidth: '100px' },
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p style="min-width: 100px;">One</p><p>Two</p></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(3, 0);
      });
      await page.keyboard.press('Enter');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p style="min-width: 100px;">One</p><p style="min-width: 100px;"><br></p><p>Two</p></div>`,
      );

      const selection = await editorPage.getSelection();
      expect(selection).toEqual({ index: 4, length: 0 });

      await page.keyboard.press('Enter');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="padding: 2px;"><p style="min-width: 100px;">One</p></div><p style="min-width: 100px;"><br></p><div style="padding: 2px;"><p>Two</p></div>`,
      );
    });

    test('enter at the end of the last line with container', async ({
      page,
      editorPage,
    }) => {
      await editorPage.setContents([
        {
          insert: 'One',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
              {
                action: 'REUSE',
                blot: 'generic-container',
                formats: {
                  styles: { width: '50%' },
                },
              },
            ],
          },
        },
        {
          insert: 'Two',
        },
        {
          insert: '\n',
          attributes: {
            container: [
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { padding: '2px' },
                },
              },
              {
                action: 'MERGE_TO_PREV',
                blot: 'generic-container',
                formats: {
                  styles: { width: '50%' },
                },
              },
            ],
          },
        },
      ]);

      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="width: 50%;"><div style="padding: 2px;"><p>One</p><p>Two</p></div></div>`,
      );

      await page.evaluate(() => {
        window.quill.setSelection(7, 0);
      });
      await page.keyboard.press('Enter');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="width: 50%;"><div style="padding: 2px;"><p>One</p><p>Two</p><p><br></p></div></div>`,
      );

      const selection = await editorPage.getSelection();
      expect(selection).toEqual({ index: 8, length: 0 });

      await page.keyboard.press('Enter');
      expect(await editorPage.root.innerHTML()).toEqual(
        `<div style="width: 50%;"><div style="padding: 2px;"><p>One</p><p>Two</p></div></div><p><br></p>`,
      );

      const selection2 = await editorPage.getSelection();
      expect(selection2).toEqual({ index: 8, length: 0 });
    });
  });

  test.describe('editing in table cell containers', () => {
    const TEST_HTML = `
      <table>
        <tbody>
          <tr>
            <td class="ql-cell-as-container" data-row="1">
              <div style="max-width: 3000px;">
                <p>One</p>
              </div>
              <div style="padding: 3px;">
                <p>Two</p>
              </div>
            </td>
            <td class="ql-cell-as-container" data-row="1"><p>Three</p><p>Four</p></td>
          </tr>
        </tbody>
      </table>
      `;

    test.describe('backspace', () => {
      test('backspace on the start of a second line in a table cell', async ({
        page,
        editorPage,
      }) => {
        await page.evaluate((TEST_HTML) => {
          const { quill } = window;
          quill.clipboard.dangerouslyPasteHTML(TEST_HTML);

          quill.setSelection(4, 0);
        }, TEST_HTML);

        await page.keyboard.press('Backspace');
        expect(await editorPage.root.innerHTML()).toEqual(
          normalizeHTML(
            `
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container" data-row="1">
                    <div style="max-width: 3000px;">
                      <p>One</p>
                    </div>
                    <p>Two</p>
                  </td>
                  <td class="ql-cell-as-container" data-row="1"><p>Three</p><p>Four</p></td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );

        await page.keyboard.press('Backspace');
        expect(await editorPage.root.innerHTML()).toEqual(
          normalizeHTML(
            `
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container" data-row="1">
                    <div style="max-width: 3000px;">
                      <p>OneTwo</p>
                    </div>
                  </td>
                  <td class="ql-cell-as-container" data-row="1">
                    <p>Three</p>
                    <p>Four</p>
                  </td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );

        await page.evaluate(() => {
          const { quill } = window;
          quill.setSelection(7, 0);
        });

        await page.keyboard.press('Backspace');
        expect(await editorPage.root.innerHTML()).toEqual(
          normalizeHTML(
            `
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container" data-row="1">
                    <div style="max-width: 3000px;">
                      <p>OneTwo</p>
                    </div>
                  </td>
                  <td class="ql-cell-as-container" data-row="1">
                    <p>Three</p>
                    <p>Four</p>
                  </td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );
      });
    });

    test.describe('delete', () => {
      test('delete on the end of a first line in a table cell', async ({
        page,
        editorPage,
      }) => {
        await page.evaluate((TEST_HTML) => {
          const { quill } = window;
          quill.clipboard.dangerouslyPasteHTML(TEST_HTML);

          quill.setSelection(3, 0);
        }, TEST_HTML);

        await page.keyboard.press('Delete');
        expect(await editorPage.root.innerHTML()).toEqual(
          normalizeHTML(
            `
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container" data-row="1">
                    <div style="padding: 3px;">
                      <p>OneTwo</p>
                    </div>
                  </td>
                  <td class="ql-cell-as-container" data-row="1"><p>Three</p><p>Four</p></td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );

        await page.evaluate(() => {
          const { quill } = window;
          quill.setSelection(12, 0);
        });

        await page.keyboard.press('Delete');

        expect(await editorPage.root.innerHTML()).toEqual(
          normalizeHTML(
            `
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container" data-row="1">
                    <div style="padding: 3px;">
                      <p>OneTwo</p>
                    </div>
                  </td>
                  <td class="ql-cell-as-container" data-row="1">
                    <p>ThreeFour</p>
                  </td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );

        await page.evaluate(() => {
          const { quill } = window;
          quill.setSelection(6, 0);
        });

        await page.keyboard.press('Delete');

        expect(await editorPage.root.innerHTML()).toEqual(
          normalizeHTML(
            `
            <table>
              <tbody>
                <tr>
                  <td class="ql-cell-as-container" data-row="1">
                    <div style="padding: 3px;">
                      <p>OneTwo</p>
                    </div>
                  </td>
                  <td class="ql-cell-as-container" data-row="1">
                    <p>ThreeFour</p>
                  </td>
                </tr>
              </tbody>
            </table>
            `,
          ),
        );
      });
    });
  });
});
