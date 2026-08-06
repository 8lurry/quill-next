import Delta from '@quill-next/delta-es';
import Quill from '../core/quill.js';
import Module from '../core/module.js';
import {
  TableCell,
  TableContainerCell,
  TableRow,
  TableBody,
  TableContainer,
  tableId,
} from '../formats/table.js';
import type { BlockEmbed } from '../quill.js';
import type Block from '../blots/block.js';

class Table extends Module {
  static register() {
    Quill.register(TableContainerCell);
    Quill.register(TableCell);
    Quill.register(TableRow);
    Quill.register(TableBody);
    Quill.register(TableContainer);
  }

  constructor(...args: ConstructorParameters<typeof Module>) {
    super(...args);
    this.listenBalanceCells();
  }

  balanceTables() {
    this.quill.scroll.descendants(TableContainer).forEach((table) => {
      table.balanceCells();
    });
  }

  deleteColumn() {
    const [table, , cell] = this.getTable();
    if (cell == null) return;
    // @ts-expect-error
    table.deleteColumn(cell.cellOffset());
    this.quill.update(Quill.sources.USER);
  }

  deleteRow() {
    const [, row] = this.getTable();
    if (row == null) return;
    row.remove();
    this.quill.update(Quill.sources.USER);
  }

  deleteTable() {
    const [table] = this.getTable();
    if (table == null) return;
    // @ts-expect-error
    const offset = table.offset();
    // @ts-expect-error
    table.remove();
    this.quill.update(Quill.sources.USER);
    this.quill.setSelection(offset, Quill.sources.SILENT);
  }

  findTableCell(
    block: Block | BlockEmbed | null,
  ): TableCell | TableContainerCell | null {
    while (block != null && block.statics.blotName !== 'scroll') {
      if (block instanceof TableCell || block instanceof TableContainerCell) {
        return block;
      }
      block = block.parent as Block | BlockEmbed | null;
    }
    return null;
  }

  getTable(
    range = this.quill.getSelection(),
  ):
    | [null, null, null, -1]
    | [TableContainer, TableRow, TableCell | TableContainerCell, number] {
    if (range == null) return [null, null, null, -1];
    const [cell, offset] = this.quill.getLine(range.index);
    const resolvedCell = this.findTableCell(cell);
    if (resolvedCell == null) {
      return [null, null, null, -1];
    }
    const row = resolvedCell.parent;
    const table = row.parent.parent;
    // @ts-expect-error
    return [table, row, resolvedCell, offset];
  }

  insertColumn(offset: number) {
    const range = this.quill.getSelection();
    if (!range) return;
    const [table, row, cell] = this.getTable(range);
    if (cell == null) return;
    const column = cell.cellOffset();
    table.insertColumn(column + offset);
    this.quill.update(Quill.sources.USER);
    let shift = row.rowOffset();
    if (offset === 0) {
      shift += 1;
    }
    this.quill.setSelection(
      range.index + shift,
      range.length,
      Quill.sources.SILENT,
    );
  }

  insertColumnLeft() {
    this.insertColumn(0);
  }

  insertColumnRight() {
    this.insertColumn(1);
  }

  insertRow(offset: number) {
    const range = this.quill.getSelection();
    if (!range) return;
    const [table, row, cell] = this.getTable(range);
    if (cell == null) return;
    const index = row.rowOffset();
    table.insertRow(index + offset);
    this.quill.update(Quill.sources.USER);
    if (offset > 0) {
      this.quill.setSelection(range, Quill.sources.SILENT);
    } else {
      this.quill.setSelection(
        range.index + row.children.length,
        range.length,
        Quill.sources.SILENT,
      );
    }
  }

  insertRowAbove() {
    this.insertRow(0);
  }

  insertRowBelow() {
    this.insertRow(1);
  }

  insertTable(rows: number, columns: number) {
    const range = this.quill.getSelection();
    if (range == null) return;
    const cellBlotName = this.quill.scroll.containerFormats
      ? TableContainerCell.blotName
      : TableCell.blotName;
    const delta = new Array(rows).fill(0).reduce((memo) => {
      const text = new Array(columns).fill('\n').join('');
      return memo.insert(text, { [cellBlotName]: tableId() });
    }, new Delta().retain(range.index));
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.setSelection(range.index, Quill.sources.SILENT);
    this.balanceTables();
  }

  listenBalanceCells() {
    this.quill.on(
      Quill.events.SCROLL_OPTIMIZE,
      (mutations: MutationRecord[]) => {
        mutations.some((mutation) => {
          if (
            ['TD', 'TR', 'TBODY', 'TABLE'].includes(
              (mutation.target as HTMLElement).tagName,
            )
          ) {
            this.quill.once(Quill.events.TEXT_CHANGE, (delta, old, source) => {
              if (source !== Quill.sources.USER) return;
              this.balanceTables();
            });
            return true;
          }
          return false;
        });
      },
    );
  }
}

export default Table;
