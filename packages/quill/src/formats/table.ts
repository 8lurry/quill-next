import type { LinkedList } from 'parchment';
import { GenericContainer } from 'parchment';
import Block from '../blots/block.js';
import type Scroll from '../blots/scroll.js';
// import Container from '../blots/container.js';

function attachId(node: HTMLElement, value: string) {
  if (value) {
    node.setAttribute('data-row', value);
  } else {
    node.setAttribute('data-row', tableId());
  }
}

class TableCell extends Block {
  static blotName = 'table';
  static tagName = 'TD';

  static create(value: string) {
    const node = super.create() as HTMLElement;
    attachId(node, value);
    return node;
  }

  static formats(domNode: HTMLElement) {
    if (domNode.hasAttribute('data-row')) {
      return domNode.getAttribute('data-row');
    }
    return undefined;
  }

  next: this | null;

  cellOffset() {
    if (this.parent) {
      return this.parent.children.indexOf(this);
    }
    return -1;
  }

  format(name: string, value: string) {
    if (name === TableCell.blotName && value) {
      this.domNode.setAttribute('data-row', value);
    } else {
      super.format(name, value);
    }
  }

  row(): TableRow {
    return this.parent as TableRow;
  }

  rowOffset() {
    if (this.row()) {
      return this.row().rowOffset();
    }
    return -1;
  }

  table() {
    return this.row() && this.row().table();
  }
}

class TableContainerCell extends GenericContainer {
  static blotName = 'table-container-cell';
  static tagName = 'TD';
  static className = 'ql-cell-as-container';
  static defaultChild = Block;

  static create(value: string) {
    const node = super.create() as HTMLElement;
    attachId(node, value);
    return node;
  }

  static formats(
    domNode: HTMLElement,
    scroll: Scroll,
  ): { [index: string]: any } | undefined {
    const formats = super.formats(domNode, scroll) || {};
    if (domNode.hasAttribute('data-row')) {
      formats.tableId = domNode.getAttribute('data-row');
    }
    if (Object.keys(formats).length === 0) {
      return undefined;
    }
    return formats;
  }

  checkMerge() {
    return false;
  }

  next: this | null;

  removeEmptyContainer(_context: { [key: string]: any }): boolean {
    return false;
  }

  public allowSplit() {
    return false;
  }

  public formats() {
    return TableContainerCell.formats(this.domNode, this.scroll as Scroll) as {
      [index: string]: any;
    };
  }

  format(name: string, value: string) {
    if (name === 'tableId' && value) {
      this.domNode.setAttribute('data-row', value);
    } else {
      super.format(name, value);
    }
  }

  cellOffset = TableCell.prototype.cellOffset;
  row = TableCell.prototype.row;
  rowOffset = TableCell.prototype.rowOffset;
  table = TableCell.prototype.table;
}

// class TableRow extends Container {
class TableRow extends GenericContainer {
  static blotName = 'table-row';
  static tagName = 'TR';

  children: LinkedList<TableCell | TableContainerCell>;
  next: this | null;

  checkMerge() {
    if (
      super.checkMerge() &&
      // @ts-expect-error
      this.next.children.head != null
    ) {
      const thisHead = this.children.head?.formats() || {};
      const thisTail = this.children.tail?.formats() || {};
      // @ts-expect-error
      const nextHead = this.next.children.head?.formats() || {};
      // @ts-expect-error
      const nextTail = this.next.children.tail?.formats() || {};

      const thisHeadId = thisHead.tableId || thisHead.table;
      const thisTailId = thisTail.tableId || thisTail.table;
      const nextHeadId = nextHead.tableId || nextHead.table;
      const nextTailId = nextTail.tableId || nextTail.table;
      return (
        thisHeadId === thisTailId &&
        thisHeadId === nextHeadId &&
        thisHeadId === nextTailId
      );
    }
    return false;
  }

  optimize(context: { [key: string]: any }) {
    super.optimize(context);
    this.children.forEach((child) => {
      if (child.next == null) return;
      const childFormats = child.formats();
      const nextFormats = child.next.formats();
      const childId = childFormats.table || childFormats.tableId;
      const nextId = nextFormats.table || nextFormats.tableId;
      if (childId !== nextId) {
        const next = this.splitAfter(child);
        if (next) {
          // @ts-expect-error TODO: parameters of optimize() should be a optional
          next.optimize();
        }
        // We might be able to merge with prev now
        if (this.prev) {
          // @ts-expect-error TODO: parameters of optimize() should be a optional
          this.prev.optimize();
        }
      }
    });
  }

  rowOffset() {
    if (this.parent) {
      return this.parent.children.indexOf(this);
    }
    return -1;
  }

  table() {
    return this.parent && this.parent.parent;
  }

  public allowSplit() {
    return true;
  }
}

// class TableBody extends Container {
class TableBody extends GenericContainer {
  static blotName = 'table-body';
  static tagName = 'TBODY';

  children: LinkedList<TableRow>;

  public allowSplit() {
    return false;
  }
}

// class TableContainer extends Container {
class TableContainer extends GenericContainer {
  static blotName = 'table-container';
  static tagName = 'TABLE';

  children: LinkedList<TableBody>;

  balanceCells() {
    const rows = this.descendants(TableRow);
    const maxColumns = rows.reduce((max, row) => {
      return Math.max(row.children.length, max);
    }, 0);
    rows.forEach((row) => {
      new Array(maxColumns - row.children.length).fill(0).forEach(() => {
        let value;
        if (row.children.head != null) {
          value = TableCell.formats(row.children.head.domNode);
        }
        let blotName = TableCell.blotName;
        if (this.scroll.containerFormats) {
          blotName = TableContainerCell.blotName;
        }
        const blot = this.scroll.create(blotName, value);
        row.appendChild(blot);
        // @ts-expect-error TODO: parameters of optimize() should be a optional
        blot.optimize(); // Add break blot
      });
    });
  }

  cells(column: number) {
    return this.rows().map((row) => row.children.at(column));
  }

  deleteColumn(index: number) {
    // @ts-expect-error
    const [body] = this.descendant(TableBody) as TableBody[];
    if (body == null || body.children.head == null) return;
    body.children.forEach((row) => {
      const cell = row.children.at(index);
      if (cell != null) {
        cell.remove();
      }
    });
  }

  insertColumn(index: number) {
    // @ts-expect-error
    const [body] = this.descendant(TableBody) as TableBody[];
    if (body == null || body.children.head == null) return;
    let blotName = TableCell.blotName;
    if (this.scroll.containerFormats) {
      blotName = TableContainerCell.blotName;
    }
    body.children.forEach((row) => {
      const ref = row.children.at(index);
      // @ts-expect-error
      const value = TableCell.formats(row.children.head.domNode);
      const cell = this.scroll.create(blotName, value);
      row.insertBefore(cell, ref);
    });
  }

  insertRow(index: number) {
    // @ts-expect-error
    const [body] = this.descendant(TableBody) as TableBody[];
    if (body == null || body.children.head == null) return;
    const id = tableId();
    const row = this.scroll.create(TableRow.blotName) as TableRow;
    let blotName = TableCell.blotName;
    if (this.scroll.containerFormats) {
      blotName = TableContainerCell.blotName;
    }
    body.children.head.children.forEach(() => {
      const cell = this.scroll.create(blotName, id);
      row.appendChild(cell);
    });
    const ref = body.children.at(index);
    body.insertBefore(row, ref);
  }

  rows() {
    const body = this.children.head;
    if (body == null) return [];
    return body.children.map((row) => row);
  }

  public allowSplit() {
    return false;
  }
}

TableContainer.allowedChildren = [TableBody];
TableBody.requiredContainer = TableContainer;

TableBody.allowedChildren = [TableRow];
TableRow.requiredContainer = TableBody;

TableRow.allowedChildren = [TableCell, TableContainerCell];
TableCell.requiredContainer = TableRow;
TableContainerCell.requiredContainer = TableRow;

function tableId() {
  const id = Math.random().toString(36).slice(2, 6);
  return `row-${id}`;
}

export {
  TableCell,
  TableContainerCell,
  TableRow,
  TableBody,
  TableContainer,
  tableId,
};
