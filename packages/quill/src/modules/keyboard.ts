import { cloneDeep, isEqual } from 'lodash-es';
import Delta, { AttributeMap } from '@quill-next/delta-es';
import {
  EmbedBlot,
  Scope,
  TextBlot,
  BlockBlot,
  GenericContainer,
} from 'parchment';
import type { Blot, ParentBlot, SerializedContainer } from 'parchment';
import Quill from '../core/quill.js';
import logger from '../core/logger.js';
import Module from '../core/module.js';
import type { BlockEmbed } from '../blots/block.js';
import type { Range } from '../core/selection.js';
import { SOFT_BREAK_CHARACTER } from '../blots/soft-break.js';
import type Scroll from '../blots/scroll.js';

const debug = logger('quill:keyboard');

const SHORTKEY =
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform)
    ? 'metaKey'
    : 'ctrlKey';

interface ContextContainer {
  blot: ParentBlot | string;
  offset?: number; // cursor offset relative to this container
  length?: number; // container content length
  prefix?: RegExp;
  suffix?: RegExp;
}

export interface Context {
  collapsed: boolean;
  empty: boolean;
  offset: number;
  prefix: string;
  suffix: string;
  format: Record<string, unknown>;
  event: KeyboardEvent;
  line: BlockEmbed | BlockBlot;
  container: SerializedContainer[] | null;
}

export interface BindingObject extends Partial<
  Omit<Context, 'prefix' | 'suffix' | 'format' | 'container'>
> {
  key: number | string | string[];
  shortKey?: boolean | null;
  shiftKey?: boolean | null;
  altKey?: boolean | null;
  metaKey?: boolean | null;
  ctrlKey?: boolean | null;
  prefix?: RegExp;
  suffix?: RegExp;
  format?: Record<string, unknown> | string[];
  container?: ContextContainer;
  exclusiveContainer?: boolean;
  handler?: (
    this: { quill: Quill },
    range: Range,
    curContext: Context,
    // eslint-disable-next-line no-use-before-define
    binding: NormalizedBinding,
  ) => boolean | void;
}

export type Binding = BindingObject | string | number;

export interface NormalizedBinding extends Omit<
  BindingObject,
  'key' | 'shortKey'
> {
  key: string | number;
}

export interface KeyboardOptions {
  bindings: Record<string, Binding>;
}

class Keyboard extends Module<KeyboardOptions> {
  static DEFAULTS: KeyboardOptions;

  static match(evt: KeyboardEvent, binding: BindingObject) {
    if (
      (['altKey', 'ctrlKey', 'metaKey', 'shiftKey'] as const).some((key) => {
        return !!binding[key] !== evt[key] && binding[key] !== null;
      })
    ) {
      return false;
    }
    return binding.key === evt.key || binding.key === evt.which;
  }

  bindings: Record<string, NormalizedBinding[]>;

  constructor(quill: Quill, options: Partial<KeyboardOptions>) {
    super(quill, options);
    this.bindings = {};
    // @ts-expect-error Fix me later
    Object.keys(this.options.bindings).forEach((name) => {
      // @ts-expect-error Fix me later
      if (this.options.bindings[name]) {
        // @ts-expect-error Fix me later
        this.addBinding(this.options.bindings[name]);
      }
    });
    this.addBinding(
      {
        key: 'Enter',
        shiftKey: true,
      },
      this.handleShiftEnter,
    );
    this.addBinding({ key: 'Enter', shiftKey: null }, this.handleEnter);
    this.addBinding(
      { key: 'Enter', metaKey: null, ctrlKey: null, altKey: null },
      () => {},
    );
    if (/Firefox/i.test(navigator.userAgent)) {
      // Need to handle delete and backspace for Firefox in the general case #1171
      this.addBinding(
        { key: 'Backspace' },
        { collapsed: true },
        this.handleBackspace,
      );
      this.addBinding(
        { key: 'Delete' },
        { collapsed: true },
        this.handleDelete,
      );
    } else {
      this.addBinding(
        { key: 'Backspace' },
        { collapsed: true, prefix: /^.?$/ },
        this.handleBackspace,
      );
      this.addBinding(
        { key: 'Delete' },
        { collapsed: true, suffix: /^.?$/ },
        this.handleDelete,
      );
    }
    this.addBinding(
      { key: 'Backspace' },
      { collapsed: false },
      this.handleDeleteRange,
    );
    this.addBinding(
      { key: 'Delete' },
      { collapsed: false },
      this.handleDeleteRange,
    );
    this.addBinding(
      {
        key: 'Backspace',
        altKey: null,
        ctrlKey: null,
        metaKey: null,
        shiftKey: null,
      },
      { collapsed: true, offset: 0 },
      this.handleBackspace,
    );
    this.listen();
  }

  addBinding(
    keyBinding: Binding,
    context:
      | Required<BindingObject['handler']>
      | Partial<Omit<BindingObject, 'key' | 'handler'>> = {},
    handler:
      | Required<BindingObject['handler']>
      | Partial<Omit<BindingObject, 'key' | 'handler'>> = {},
  ) {
    const binding = normalize(keyBinding);
    if (binding == null) {
      debug.warn('Attempted to add invalid keyboard binding', binding);
      return;
    }
    if (typeof context === 'function') {
      context = { handler: context };
    }
    if (typeof handler === 'function') {
      handler = { handler };
    }
    const keys = Array.isArray(binding.key) ? binding.key : [binding.key];
    keys.forEach((key) => {
      const singleBinding = {
        ...binding,
        key,
        ...context,
        ...handler,
      };
      this.bindings[singleBinding.key] = this.bindings[singleBinding.key] || [];
      this.bindings[singleBinding.key].push(singleBinding);
    });
  }

  listen() {
    this.quill.root.addEventListener('keydown', (evt) => {
      if (evt.defaultPrevented || evt.isComposing) return;

      // evt.isComposing is false when pressing Enter/Backspace when composing in Safari
      // https://bugs.webkit.org/show_bug.cgi?id=165004
      const isComposing =
        evt.keyCode === 229 && (evt.key === 'Enter' || evt.key === 'Backspace');
      if (isComposing) return;

      const bindings = (this.bindings[evt.key] || []).concat(
        this.bindings[evt.which] || [],
      );
      const matches = bindings.filter((binding) =>
        Keyboard.match(evt, binding),
      );
      if (matches.length === 0) return;
      // @ts-expect-error
      const blot = Quill.find(evt.target, true);
      if (blot && blot.scroll !== this.quill.scroll) return;
      const range = this.quill.getSelection();
      if (range == null || !this.quill.hasFocus()) return;
      const [line, offset] = this.quill.getLine(range.index);
      const [leafStart, offsetStart] = this.quill.getLeaf(range.index);
      const [leafEnd, offsetEnd] =
        range.length === 0
          ? [leafStart, offsetStart]
          : this.quill.getLeaf(range.index + range.length);
      const prefixText =
        leafStart instanceof TextBlot
          ? leafStart.value().slice(0, offsetStart)
          : '';
      const suffixText =
        leafEnd instanceof TextBlot ? leafEnd.value().slice(offsetEnd) : '';
      const curContext = {
        collapsed: range.length === 0,
        // @ts-expect-error Fix me later
        empty: range.length === 0 && line.length() <= 1,
        format: this.quill.getFormat(range),
        line,
        offset,
        prefix: prefixText,
        suffix: suffixText,
        event: evt,
        container: this.quill.getContainerFormats(range, evt.key === 'Enter'),
      };
      const { scroll } = this.quill;
      const { containerFormats } = scroll;

      const prevented = matches.some((binding) => {
        if (
          binding.collapsed != null &&
          binding.collapsed !== curContext.collapsed
        ) {
          return false;
        }
        let ancestorEmpty = curContext.empty,
          ancestorOffset = curContext.offset,
          ancestorPrefix = curContext.prefix,
          ancestorSuffix = curContext.suffix,
          containerMatch = !binding.container || !containerFormats,
          ancestor;

        if (containerFormats && binding.container) {
          const { blot } = binding.container;
          const [a, aOffset] = scroll.ancestorAt(
            range.index,
            blot as string | typeof ParentBlot,
          );
          if (a) {
            ancestor = a;
            containerMatch = true;
            const ancestorStart = ancestor.offset(scroll);
            const ancestorLength = ancestor.length();
            ancestorEmpty = ancestorEmpty && ancestorLength <= 1;
            ancestorOffset = aOffset;
            ancestorPrefix = this.quill.getText(
              ancestorStart,
              range.index - ancestorStart,
            );
            ancestorSuffix = this.quill.getText(
              range.index + range.length,
              ancestorStart + ancestorLength - (range.index + range.length) - 1, // The last -1 is for the trailing newline character
            );
          }
        }
        if (binding.empty != null && binding.empty !== ancestorEmpty) {
          return false;
        }
        if (binding.offset != null && binding.offset !== ancestorOffset) {
          return false;
        }
        if (binding.prefix != null && !binding.prefix.test(ancestorPrefix)) {
          return false;
        }
        if (binding.suffix != null && !binding.suffix.test(ancestorSuffix)) {
          return false;
        }

        if (containerFormats && binding.container) {
          const { offset, length, prefix, suffix } = binding.container;
          if (ancestor) {
            const ancestorLength = ancestor.length();

            if (offset != null && ancestorOffset !== offset) {
              containerMatch = false;
            }
            if (length != null && ancestorLength !== length) {
              containerMatch = false;
            }
            if (prefix != null && !prefix.test(ancestorPrefix)) {
              containerMatch = false;
            }
            if (suffix != null && !suffix.test(ancestorSuffix)) {
              containerMatch = false;
            }
          }
        }
        if (containerFormats && binding.exclusiveContainer && containerMatch) {
          return (
            // @ts-expect-error Fix me later
            binding.handler.call(this, range, curContext, binding) !== true
          );
        }
        let formatMatch = true;
        if (Array.isArray(binding.format)) {
          // any format is present
          if (binding.format.every((name) => curContext.format[name] == null)) {
            formatMatch = false;
          }
        } else if (typeof binding.format === 'object') {
          // all formats must match
          formatMatch = Object.keys(binding.format).every((name) => {
            // @ts-expect-error Fix me later
            if (binding.format[name] === true)
              return curContext.format[name] != null;
            // @ts-expect-error Fix me later
            if (binding.format[name] === false)
              return curContext.format[name] == null;
            // @ts-expect-error Fix me later
            return isEqual(binding.format[name], curContext.format[name]);
          });
        }

        if (
          (containerMatch && formatMatch) ||
          (binding.exclusiveContainer && formatMatch)
        ) {
          return (
            // @ts-expect-error Fix me later
            binding.handler.call(this, range, curContext, binding) !== true
          );
        }
        return false;
      });
      if (prevented) {
        evt.preventDefault();
      }
    });
  }

  handleBackspace(range: Range, context: Context) {
    // Check for astral symbols
    const length = /[\uD800-\uDBFF][\uDC00-\uDFFF]$/.test(context.prefix)
      ? 2
      : 1;
    if (range.index === 0 || this.quill.getLength() <= 1) return;
    const [line] = this.quill.getLine(range.index);
    let delta = new Delta().retain(range.index - length).delete(length);
    if (context.offset === 0) {
      if (
        line &&
        line.scroll.containerFormats &&
        line instanceof BlockBlot &&
        line.parent instanceof GenericContainer &&
        line.parent.allowSplit() &&
        (!line.prev ||
          line.prev instanceof GenericContainer ||
          line.length() <= 1)
      ) {
        const containers = line.serializeContainers().slice(1);
        delta = new Delta()
          .retain(range.index + line.length() - 1)
          .retain(1, { container: containers });
      } else {
        // Always deleting newline here, length always 1
        const [prev] = this.quill.getLine(range.index - 1);
        if (prev) {
          const isPrevLineEmpty =
            prev.statics.blotName === 'block' && prev.length() <= 1;
          if (!isPrevLineEmpty) {
            const formats = mergeDeltaAttributes(
              line as BlockBlot,
              prev as BlockBlot,
            );
            if (Object.keys(formats).length > 0) {
              // line.length() - 1 targets \n in line, another -1 for newline being deleted
              const formatDelta = new Delta()
                // @ts-expect-error Fix me later
                .retain(range.index + line.length() - 2)
                .retain(1, formats);
              delta = delta.compose(formatDelta);
            }
          }
        }
      }
    }
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.focus();
  }

  handleDelete(range: Range, context: Context) {
    // Check for astral symbols
    const length = /^[\uD800-\uDBFF][\uDC00-\uDFFF]/.test(context.suffix)
      ? 2
      : 1;
    if (range.index >= this.quill.getLength() - length) return;
    let formats = {};
    const [line] = this.quill.getLine(range.index);
    let delta = new Delta().retain(range.index).delete(length);
    // @ts-expect-error Fix me later
    if (context.offset >= line.length() - 1) {
      const [next] = this.quill.getLine(range.index + 1);
      if (next) {
        formats = mergeDeltaAttributes(line as BlockBlot, next as BlockBlot);
        if (Object.keys(formats).length > 0) {
          delta = delta.retain(next.length() - 1).retain(1, formats);
        }
      }
    }
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.focus();
  }

  handleDeleteRange(range: Range) {
    deleteRange({ range, quill: this.quill });
    this.quill.focus();
  }

  handleEnter(range: Range, context: Context) {
    const lineFormats = Object.keys(context.format).reduce(
      (formats: Record<string, unknown>, format) => {
        if (
          this.quill.scroll.query(format, Scope.BLOCK) &&
          !Array.isArray(context.format[format])
        ) {
          formats[format] = context.format[format];
        }
        return formats;
      },
      {},
    );
    let delta = new Delta().retain(range.index);
    let containers: SerializedContainer[] = [];
    const [line, lineOffset] = this.quill.getLine(range.index);
    if (
      this.quill.scroll.containerFormats &&
      range.length === 0 &&
      line instanceof BlockBlot &&
      line.parent instanceof GenericContainer &&
      lineOffset === 0 &&
      line.length() <= 1 &&
      line.parent.allowSplit()
    ) {
      containers = [...containers];
      while (containers.length) {
        if (containers[containers.length - 1].allowSplit) {
          containers.pop();
        } else {
          break;
        }
      }
      delta = delta.retain(line.length(), {
        ...lineFormats,
        container: containers,
      });
    } else {
      delta = delta.delete(range.length);
      containers = context.container as SerializedContainer[];
      delta = delta.insert('\n', {
        ...lineFormats,
        container: containers,
      });
    }
    this.quill.updateContents(delta, Quill.sources.USER);
    this.quill.setSelection(range.index + 1, Quill.sources.SILENT);
    this.quill.focus();
  }

  handleShiftEnter(range: Range) {
    this.quill.insertText(
      range.index,
      SOFT_BREAK_CHARACTER,
      Quill.sources.USER,
    );
    this.quill.setSelection(range.index + 1, Quill.sources.SILENT);
  }
}

const defaultOptions: KeyboardOptions = {
  bindings: {
    bold: makeFormatHandler('bold'),
    italic: makeFormatHandler('italic'),
    underline: makeFormatHandler('underline'),
    indent: {
      // highlight tab or tab at beginning of list, indent or blockquote
      key: 'Tab',
      format: ['blockquote', 'indent', 'list'],
      handler(range, context) {
        if (context.collapsed && context.offset !== 0) return true;
        this.quill.format('indent', '+1', Quill.sources.USER);
        return false;
      },
    },
    outdent: {
      key: 'Tab',
      shiftKey: true,
      format: ['blockquote', 'indent', 'list'],
      // highlight tab or tab at beginning of list, indent or blockquote
      handler(range, context) {
        if (context.collapsed && context.offset !== 0) return true;
        this.quill.format('indent', '-1', Quill.sources.USER);
        return false;
      },
    },
    'outdent backspace': {
      key: 'Backspace',
      collapsed: true,
      shiftKey: null,
      metaKey: null,
      ctrlKey: null,
      altKey: null,
      format: ['indent', 'list'],
      offset: 0,
      handler(range, context) {
        if (context.format.indent != null) {
          this.quill.format('indent', '-1', Quill.sources.USER);
        } else if (context.format.list != null) {
          this.quill.format('list', false, Quill.sources.USER);
        }
      },
    },
    'indent code-block': makeCodeBlockHandler(true),
    'outdent code-block': makeCodeBlockHandler(false),
    'remove tab': {
      key: 'Tab',
      shiftKey: true,
      collapsed: true,
      prefix: /\t$/,
      handler(range) {
        this.quill.deleteText(range.index - 1, 1, Quill.sources.USER);
      },
    },
    tab: {
      key: 'Tab',
      handler(range, context) {
        if (context.format.table) return true;
        this.quill.history.cutoff();
        const delta = new Delta()
          .retain(range.index)
          .delete(range.length)
          .insert('\t');
        this.quill.updateContents(delta, Quill.sources.USER);
        this.quill.history.cutoff();
        this.quill.setSelection(range.index + 1, Quill.sources.SILENT);
        return false;
      },
    },
    'blockquote empty enter': {
      key: 'Enter',
      collapsed: true,
      format: ['blockquote'],
      empty: true,
      handler() {
        this.quill.format('blockquote', false, Quill.sources.USER);
      },
    },
    'list empty enter': {
      key: 'Enter',
      collapsed: true,
      format: ['list'],
      empty: true,
      handler(range, context) {
        const formats: Record<string, unknown> = { list: false };
        if (context.format.indent) {
          formats.indent = false;
        }
        this.quill.formatLine(
          range.index,
          range.length,
          formats,
          Quill.sources.USER,
        );
      },
    },
    'checklist enter': {
      key: 'Enter',
      collapsed: true,
      format: { list: 'checked' },
      handler(range) {
        const [line, offset] = this.quill.getLine(range.index);
        const formats = {
          // @ts-expect-error Fix me later
          ...line.formats(),
          list: 'checked',
        };
        const delta = new Delta()
          .retain(range.index)
          .insert('\n', formats)
          // @ts-expect-error Fix me later
          .retain(line.length() - offset - 1)
          .retain(1, { list: 'unchecked' });
        this.quill.updateContents(delta, Quill.sources.USER);
        this.quill.setSelection(range.index + 1, Quill.sources.SILENT);
        this.quill.scrollSelectionIntoView();
      },
    },
    'header enter': {
      key: 'Enter',
      collapsed: true,
      format: ['header'],
      suffix: /^$/,
      handler(range, context) {
        const [line, offset] = this.quill.getLine(range.index);
        const delta = new Delta()
          .retain(range.index)
          .insert('\n', context.format)
          // @ts-expect-error Fix me later
          .retain(line.length() - offset - 1)
          .retain(1, { header: null });
        this.quill.updateContents(delta, Quill.sources.USER);
        this.quill.setSelection(range.index + 1, Quill.sources.SILENT);
        this.quill.scrollSelectionIntoView();
      },
    },
    'table backspace': {
      key: 'Backspace',
      format: ['table'],
      collapsed: true,
      offset: 0,
      exclusiveContainer: true,
      container: {
        blot: 'table-container-cell',
      },
      handler() {},
    },
    'table delete': {
      key: 'Delete',
      format: ['table'],
      collapsed: true,
      suffix: /^$/,
      exclusiveContainer: true,
      container: {
        blot: 'table-container-cell',
      },
      handler() {},
    },
    'table enter': {
      key: 'Enter',
      shiftKey: null,
      format: ['table'],
      handler(range) {
        const module = this.quill.getModule('table');
        if (module) {
          // @ts-expect-error
          const [table, row, cell, offset] = module.getTable(range);
          const shift = tableSide(table, row, cell, offset);
          if (shift == null) return;
          let index = table.offset();
          if (shift < 0) {
            const delta = new Delta().retain(index).insert('\n');
            this.quill.updateContents(delta, Quill.sources.USER);
            this.quill.setSelection(
              range.index + 1,
              range.length,
              Quill.sources.SILENT,
            );
          } else if (shift > 0) {
            index += table.length();
            const delta = new Delta().retain(index).insert('\n');
            this.quill.updateContents(delta, Quill.sources.USER);
            this.quill.setSelection(index, Quill.sources.USER);
          }
        }
      },
    },
    'table tab': {
      key: 'Tab',
      shiftKey: null,
      format: ['table'],
      handler(range, context) {
        const { event, line: cell } = context;
        const offset = cell.offset(this.quill.scroll);
        if (event.shiftKey) {
          this.quill.setSelection(offset - 1, Quill.sources.USER);
        } else {
          this.quill.setSelection(offset + cell.length(), Quill.sources.USER);
        }
      },
    },
    'list autofill': {
      key: ' ',
      shiftKey: null,
      collapsed: true,
      format: {
        'code-block': false,
        blockquote: false,
        table: false,
      },
      prefix: /^\s*?(\d+\.|-|\*|\[ ?\]|\[x\])$/,
      handler(range, context) {
        if (this.quill.scroll.query('list') == null) return true;
        const { length } = context.prefix;
        const [line, offset] = this.quill.getLine(range.index);
        if (offset > length) return true;
        let value;
        switch (context.prefix.trim()) {
          case '[]':
          case '[ ]':
            value = 'unchecked';
            break;
          case '[x]':
            value = 'checked';
            break;
          case '-':
          case '*':
            value = 'bullet';
            break;
          default:
            value = 'ordered';
        }
        this.quill.insertText(range.index, ' ', Quill.sources.USER);
        this.quill.history.cutoff();
        const delta = new Delta()
          .retain(range.index - offset)
          .delete(length + 1)
          // @ts-expect-error Fix me later
          .retain(line.length() - 2 - offset)
          .retain(1, { list: value });
        this.quill.updateContents(delta, Quill.sources.USER);
        this.quill.history.cutoff();
        this.quill.setSelection(range.index - length, Quill.sources.SILENT);
        return false;
      },
    },
    'code exit': {
      key: 'Enter',
      collapsed: true,
      format: ['code-block'],
      prefix: /^$/,
      suffix: /^\s*$/,
      handler(range) {
        const [line, offset] = this.quill.getLine(range.index);
        let numLines = 2;
        let cur = line;
        while (
          cur != null &&
          cur.length() <= 1 &&
          cur.formats()['code-block']
        ) {
          // @ts-expect-error
          cur = cur.prev;
          numLines -= 1;
          // Requisite prev lines are empty
          if (numLines <= 0) {
            const delta = new Delta()
              // @ts-expect-error Fix me later
              .retain(range.index + line.length() - offset - 2)
              .retain(1, { 'code-block': null })
              .delete(1);
            this.quill.updateContents(delta, Quill.sources.USER);
            this.quill.setSelection(range.index - 1, Quill.sources.SILENT);
            return false;
          }
        }
        return true;
      },
    },
    'embed left': makeEmbedArrowHandler('ArrowLeft', false),
    'embed left shift': makeEmbedArrowHandler('ArrowLeft', true),
    'embed right': makeEmbedArrowHandler('ArrowRight', false),
    'embed right shift': makeEmbedArrowHandler('ArrowRight', true),
    'table down': makeTableArrowHandler(false),
    'table up': makeTableArrowHandler(true),
  },
};

Keyboard.DEFAULTS = defaultOptions;

function makeCodeBlockHandler(indent: boolean): BindingObject {
  return {
    key: 'Tab',
    shiftKey: !indent,
    format: { 'code-block': true },
    handler(range, { event }) {
      const CodeBlock = this.quill.scroll.query('code-block');
      // @ts-expect-error
      const { TAB } = CodeBlock;
      if (range.length === 0 && !event.shiftKey) {
        this.quill.insertText(range.index, TAB, Quill.sources.USER);
        this.quill.setSelection(range.index + TAB.length, Quill.sources.SILENT);
        return;
      }

      const lines =
        range.length === 0
          ? this.quill.getLines(range.index, 1)
          : this.quill.getLines(range);
      let { index, length } = range;
      lines.forEach((line, i) => {
        if (indent) {
          line.insertAt(0, TAB);
          if (i === 0) {
            index += TAB.length;
          } else {
            length += TAB.length;
          }
        } else if (line.domNode.textContent.startsWith(TAB)) {
          line.deleteAt(0, TAB.length);
          if (i === 0) {
            index -= TAB.length;
          } else {
            length -= TAB.length;
          }
        }
      });
      this.quill.update(Quill.sources.USER);
      this.quill.setSelection(index, length, Quill.sources.SILENT);
    },
  };
}

function makeEmbedArrowHandler(
  key: string,
  shiftKey: boolean | null,
): BindingObject {
  const where = key === 'ArrowLeft' ? 'prefix' : 'suffix';
  return {
    key,
    shiftKey,
    altKey: null,
    [where]: /^$/,
    handler(range) {
      let { index } = range;
      if (key === 'ArrowRight') {
        index += range.length + 1;
      }
      const [leaf] = this.quill.getLeaf(index);
      if (!(leaf instanceof EmbedBlot)) return true;
      if (key === 'ArrowLeft') {
        if (shiftKey) {
          this.quill.setSelection(
            range.index - 1,
            range.length + 1,
            Quill.sources.USER,
          );
        } else {
          this.quill.setSelection(range.index - 1, Quill.sources.USER);
        }
      } else if (shiftKey) {
        this.quill.setSelection(
          range.index,
          range.length + 1,
          Quill.sources.USER,
        );
      } else {
        this.quill.setSelection(
          range.index + range.length + 1,
          Quill.sources.USER,
        );
      }
      return false;
    },
  };
}

function makeFormatHandler(format: string): BindingObject {
  return {
    key: format[0],
    shortKey: true,
    handler(range, context) {
      this.quill.format(format, !context.format[format], Quill.sources.USER);
    },
  };
}

function makeTableArrowHandler(up: boolean): BindingObject {
  return {
    key: up ? 'ArrowUp' : 'ArrowDown',
    collapsed: true,
    format: ['table'],
    handler(range, context) {
      // TODO move to table module
      const key = up ? 'prev' : 'next';
      const cell = context.line;
      const targetRow = cell.parent[key];
      if (targetRow != null) {
        if (targetRow.statics.blotName === 'table-row') {
          // @ts-expect-error
          let targetCell = targetRow.children.head;
          let cur = cell;
          while (cur.prev != null) {
            // @ts-expect-error
            cur = cur.prev;
            targetCell = targetCell.next;
          }
          const index =
            targetCell.offset(this.quill.scroll) +
            Math.min(context.offset, targetCell.length() - 1);
          this.quill.setSelection(index, 0, Quill.sources.USER);
        }
      } else {
        // @ts-expect-error
        const targetLine = cell.table()[key];
        if (targetLine != null) {
          if (up) {
            this.quill.setSelection(
              targetLine.offset(this.quill.scroll) + targetLine.length() - 1,
              0,
              Quill.sources.USER,
            );
          } else {
            this.quill.setSelection(
              targetLine.offset(this.quill.scroll),
              0,
              Quill.sources.USER,
            );
          }
        }
      }
      return false;
    },
  };
}

function normalize(binding: Binding): BindingObject | null {
  if (typeof binding === 'string' || typeof binding === 'number') {
    binding = { key: binding };
  } else if (typeof binding === 'object') {
    binding = cloneDeep(binding);
  } else {
    return null;
  }
  if (binding.shortKey) {
    binding[SHORTKEY] = binding.shortKey;
    delete binding.shortKey;
  }
  return binding;
}

// TODO: Move into quill.ts or editor.ts
function deleteRange({ quill, range }: { quill: Quill; range: Range }) {
  const lines = quill.getLines(range);
  let formats = {};
  if (lines.length > 1) {
    formats = mergeDeltaAttributes(
      lines[lines.length - 1] as BlockBlot,
      lines[0] as BlockBlot,
    );
  }
  quill.deleteText(range, Quill.sources.USER);
  if (Object.keys(formats).length > 0) {
    quill.formatLine(range.index, 1, formats, Quill.sources.USER);
  }
  quill.setSelection(range.index, Quill.sources.SILENT);
}

function tableSide(_table: unknown, row: Blot, cell: Blot, offset: number) {
  if (row.prev == null && row.next == null) {
    if (cell.prev == null && cell.next == null) {
      return offset === 0 ? -1 : 1;
    }
    return cell.prev == null ? -1 : 1;
  }
  if (row.prev == null) {
    return -1;
  }
  if (row.next == null) {
    return 1;
  }
  return null;
}

function mergeDeltaAttributes(
  removed: BlockBlot,
  survivor: BlockBlot,
): AttributeMap {
  const attributes =
    AttributeMap.diff(removed.formats(), survivor.formats()) || {};

  if (survivor.scroll.containerFormats) {
    const rIndex = removed.offset(removed.scroll);
    const rComesFirst = rIndex < survivor.offset(survivor.scroll);
    let boundary: BlockBlot | undefined;
    if (rComesFirst) {
      boundary = removed;
      if (rIndex > 0) {
        boundary =
          ((survivor.scroll as Scroll).line(rIndex - 1)[0] as BlockBlot) ||
          removed;
      }
    }
    const survivorContainers = survivor.serializeContainers({ boundary });
    attributes.container = survivorContainers;
  }

  return attributes;
}

export { Keyboard as default, SHORTKEY, normalize, deleteRange };
