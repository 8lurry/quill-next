import type {
  BlotConstructor,
  ScrollBlot,
  SerializedContainer,
} from 'parchment';
import {
  Attributor,
  BlockBlot,
  ClassAttributor,
  ContainerBlot,
  EmbedBlot,
  Scope,
  StyleAttributor,
  containerRestoreAction,
} from 'parchment';
import Delta from '@quill-next/delta-es';
import { BlockEmbed, normalizeLastOp } from '../blots/block.js';
import type { EmitterSource } from '../core/emitter.js';
import logger from '../core/logger.js';
import Module from '../core/module.js';
import Quill from '../core/quill.js';
import type { Range } from '../core/selection.js';
import { AlignAttribute, AlignStyle } from '../formats/align.js';
import { StylesAttributor, Styles } from '../formats/styles.js';
import { ClassesAttributor, Classes } from '../formats/classes.js';
import { BackgroundStyle } from '../formats/background.js';
import CodeBlock from '../formats/code.js';
import { ColorStyle } from '../formats/color.js';
import { DirectionAttribute, DirectionStyle } from '../formats/direction.js';
import { FontStyle } from '../formats/font.js';
import { SizeStyle } from '../formats/size.js';
import { deleteRange } from './keyboard.js';
import normalizeExternalHTML from './normalizeExternalHTML/index.js';
import { SOFT_BREAK_CHARACTER } from '../blots/soft-break.js';
import type Scroll from '../blots/scroll.js';

const debug = logger('quill:clipboard');

type Selector = string | Node['TEXT_NODE'] | Node['ELEMENT_NODE'];
type Matcher = (node: Node, delta: Delta, scroll: ScrollBlot) => Delta;

// Constants from the browser's global "Node" object.
// Strong types ensure the constants are accurate,
// while avoiding an import time dependency on browser provided global.
// Avoiding this dependency allows this code to be imported more easily in non-browser environments such as tests and SSR.
const TEXT_NODE: typeof Node.TEXT_NODE = 3;
const ELEMENT_NODE: typeof Node.ELEMENT_NODE = 1;

const CLIPBOARD_CONFIG: [Selector, Matcher][] = [
  [TEXT_NODE, matchText],
  [TEXT_NODE, matchNewline],
  ['br', matchBreak],
  [ELEMENT_NODE, matchNewline],
  [ELEMENT_NODE, matchBlot],
  [ELEMENT_NODE, matchAttributor],
  [ELEMENT_NODE, matchStyles],
  ['li', matchIndent],
  ['ol, ul', matchList],
  ['pre', matchCodeBlock],
  ['tr', matchTable],
  ['td', matchTableCell],
  ['b', createMatchAlias('bold')],
  ['i', createMatchAlias('italic')],
  ['strike', createMatchAlias('strike')],
  ['style', matchIgnore],
];

const CLASS_ATTRIBUTORS = [Classes].reduce(
  (memo: Record<string, Attributor>, attr) => {
    memo[attr.keyName] = attr;
    return memo;
  },
  {},
);

const ATTRIBUTE_ATTRIBUTORS = [AlignAttribute, DirectionAttribute].reduce(
  (memo: Record<string, Attributor>, attr) => {
    memo[attr.keyName] = attr;
    return memo;
  },
  {},
);

const STYLE_ATTRIBUTORS = [
  AlignStyle,
  BackgroundStyle,
  ColorStyle,
  DirectionStyle,
  FontStyle,
  SizeStyle,
  Styles,
].reduce((memo: Record<string, Attributor>, attr) => {
  memo[attr.keyName] = attr;
  return memo;
}, {});

interface ClipboardOptions {
  matchers: [Selector, Matcher][];
}

class Clipboard extends Module<ClipboardOptions> {
  static DEFAULTS: ClipboardOptions = {
    matchers: [],
  };

  matchers: [Selector, Matcher][];

  constructor(quill: Quill, options: Partial<ClipboardOptions>) {
    super(quill, options);
    this.quill.root.addEventListener('copy', (e) =>
      this.onCaptureCopy(e, false),
    );
    this.quill.root.addEventListener('cut', (e) => this.onCaptureCopy(e, true));
    this.quill.root.addEventListener('paste', this.onCapturePaste.bind(this));
    this.matchers = [];
    CLIPBOARD_CONFIG.concat(this.options.matchers ?? []).forEach(
      ([selector, matcher]) => {
        this.addMatcher(selector, matcher);
      },
    );
  }

  addMatcher(selector: Selector, matcher: Matcher) {
    this.matchers.push([selector, matcher]);
  }

  convert(
    { html, text }: { html?: string; text?: string },
    formats: Record<string, unknown> = {},
  ) {
    if (formats[CodeBlock.blotName]) {
      return new Delta().insert(text || '', {
        [CodeBlock.blotName]: formats[CodeBlock.blotName],
      });
    }
    if (!html) {
      return new Delta().insert(text || '', formats);
    }
    const delta = this.convertHTML(html);
    // Remove trailing newline
    if (
      deltaEndsWith(delta, '\n') &&
      (delta.ops[delta.ops.length - 1].attributes == null || formats.table)
    ) {
      return delta.compose(new Delta().retain(delta.length() - 1).delete(1));
    }
    return delta;
  }

  protected normalizeHTML(doc: Document) {
    normalizeExternalHTML(doc);
  }

  protected convertHTML(html: string) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    this.normalizeHTML(doc);
    const container = doc.body;
    const nodeMatches = new WeakMap();
    const [elementMatchers, textMatchers] = this.prepareMatching(
      container,
      nodeMatches,
    );
    return traverse(
      this.quill.scroll,
      container,
      elementMatchers,
      textMatchers,
      nodeMatches,
    );
  }

  dangerouslyPasteHTML(html: string, source?: EmitterSource): void;
  dangerouslyPasteHTML(
    index: number,
    html: string,
    source?: EmitterSource,
  ): void;
  dangerouslyPasteHTML(
    index: number | string,
    html?: string,
    source: EmitterSource = Quill.sources.API,
  ) {
    if (typeof index === 'string') {
      const delta = this.convert({ html: index, text: '' });
      // @ts-expect-error
      this.quill.setContents(delta, html);
      this.quill.setSelection(0, Quill.sources.SILENT);
    } else {
      const paste = this.convert({ html, text: '' });
      this.quill.updateContents(
        new Delta().retain(index).concat(paste),
        source,
      );
      this.quill.setSelection(index + paste.length(), Quill.sources.SILENT);
    }
  }

  onCaptureCopy(e: ClipboardEvent, isCut = false) {
    if (e.defaultPrevented) return;
    e.preventDefault();
    const [range] = this.quill.selection.getRange();
    if (range == null) return;
    const { html, text } = this.onCopy(range, isCut);
    e.clipboardData?.setData('text/plain', text);
    e.clipboardData?.setData('text/html', html);
    if (isCut) {
      deleteRange({ range, quill: this.quill });
    }
  }

  /*
   * https://www.iana.org/assignments/media-types/text/uri-list
   */
  private normalizeURIList(urlList: string) {
    return (
      urlList
        .split(/\r?\n/)
        // Ignore all comments
        .filter((url) => url[0] !== '#')
        .join('\n')
    );
  }

  onCapturePaste(e: ClipboardEvent) {
    if (e.defaultPrevented || !this.quill.isEnabled()) return;
    e.preventDefault();
    const range = this.quill.getSelection(true);
    if (range == null) return;
    const html = e.clipboardData?.getData('text/html');
    let text = e.clipboardData?.getData('text/plain');
    if (!html && !text) {
      const urlList = e.clipboardData?.getData('text/uri-list');
      if (urlList) {
        text = this.normalizeURIList(urlList);
      }
    }
    const files = Array.from(e.clipboardData?.files || []);
    if (!html && files.length > 0) {
      this.quill.uploader.upload(range, files);
      return;
    }
    if (html && files.length > 0) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      if (
        doc.body.childElementCount === 1 &&
        doc.body.firstElementChild?.tagName === 'IMG'
      ) {
        this.quill.uploader.upload(range, files);
        return;
      }
    }
    this.onPaste(range, { html, text });
  }

  onCopy(range: Range, isCut: boolean): { html: string; text: string };
  onCopy(range: Range) {
    const text = this.quill.getText(range);
    const html = this.quill.getSemanticHTML(range);
    return { html, text };
  }

  onPaste(range: Range, { text, html }: { text?: string; html?: string }) {
    const formats = this.quill.getFormat(range.index);
    const pastedDelta = this.convert({ text, html }, formats);
    debug.log('onPaste', pastedDelta, { text, html });
    const delta = new Delta()
      .retain(range.index)
      .delete(range.length)
      .concat(pastedDelta);
    this.quill.updateContents(delta, Quill.sources.USER);
    // range.length contributes to delta.length()
    this.quill.setSelection(
      delta.length() - range.length,
      Quill.sources.SILENT,
    );
    this.quill.scrollSelectionIntoView();
  }

  prepareMatching(container: Element, nodeMatches: WeakMap<Node, Matcher[]>) {
    const elementMatchers: Matcher[] = [];
    const textMatchers: Matcher[] = [];
    this.matchers.forEach((pair) => {
      const [selector, matcher] = pair;
      switch (selector) {
        case Node.TEXT_NODE:
          textMatchers.push(matcher);
          break;
        case Node.ELEMENT_NODE:
          elementMatchers.push(matcher);
          break;
        default:
          Array.from(container.querySelectorAll(selector)).forEach((node) => {
            if (nodeMatches.has(node)) {
              const matches = nodeMatches.get(node);
              matches?.push(matcher);
            } else {
              nodeMatches.set(node, [matcher]);
            }
          });
          break;
      }
    });
    return [elementMatchers, textMatchers];
  }
}

function applyFormat(
  delta: Delta,
  format: string,
  value: unknown,
  scroll: ScrollBlot,
): Delta {
  if (!scroll.query(format)) {
    return delta;
  }

  return delta.reduce((newDelta, op) => {
    if (!op.insert) return newDelta;
    if (op.attributes && op.attributes[format]) {
      return newDelta.push(op);
    }
    const formats = value ? { [format]: value } : {};
    return newDelta.insert(op.insert, { ...formats, ...op.attributes });
  }, new Delta());
}

function deltaEndsWith(delta: Delta, text: string) {
  let endText = '';
  for (
    let i = delta.ops.length - 1;
    i >= 0 && endText.length < text.length;
    --i // eslint-disable-line no-plusplus
  ) {
    const op = delta.ops[i];
    if (typeof op.insert !== 'string') break;
    endText = op.insert + endText;
  }
  return endText.slice(-1 * text.length) === text;
}

function isLine(node: Node, scroll: ScrollBlot) {
  if (!(node instanceof Element)) return false;
  const match = scroll.query(node);
  // @ts-expect-error
  if (match && match.prototype instanceof EmbedBlot) return false;

  return [
    'address',
    'article',
    'blockquote',
    'canvas',
    'dd',
    'div',
    'dl',
    'dt',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'iframe',
    'li',
    'main',
    'nav',
    'ol',
    'output',
    'p',
    'pre',
    'section',
    'table',
    'td',
    'tr',
    'ul',
    'video',
  ].includes(node.tagName.toLowerCase());
}

function isBetweenInlineElements(node: HTMLElement, scroll: ScrollBlot) {
  return (
    node.previousElementSibling &&
    node.nextElementSibling &&
    !isLine(node.previousElementSibling, scroll) &&
    !isLine(node.nextElementSibling, scroll)
  );
}

const preNodes = new WeakMap();
function isPre(node: Node | null) {
  if (node == null) return false;
  if (!preNodes.has(node)) {
    // @ts-expect-error
    if (node.tagName === 'PRE') {
      preNodes.set(node, true);
    } else {
      preNodes.set(node, isPre(node.parentNode));
    }
  }
  return preNodes.get(node);
}

function traverse(
  scroll: ScrollBlot,
  node: ChildNode,
  elementMatchers: Matcher[],
  textMatchers: Matcher[],
  nodeMatches: WeakMap<Node, Matcher[]>,
): Delta {
  // Post-order
  if (node.nodeType === node.TEXT_NODE) {
    return textMatchers.reduce((delta: Delta, matcher) => {
      return matcher(node, delta, scroll);
    }, new Delta());
  }
  if (node.nodeType === node.ELEMENT_NODE) {
    return Array.from(node.childNodes || []).reduce((delta, childNode) => {
      let childrenDelta = traverse(
        scroll,
        childNode,
        elementMatchers,
        textMatchers,
        nodeMatches,
      );
      if (childNode.nodeType === node.ELEMENT_NODE) {
        childrenDelta = elementMatchers.reduce((reducedDelta, matcher) => {
          return matcher(childNode as HTMLElement, reducedDelta, scroll);
        }, childrenDelta);
        childrenDelta = (nodeMatches.get(childNode) || []).reduce(
          (reducedDelta, matcher) => {
            return matcher(childNode, reducedDelta, scroll);
          },
          childrenDelta,
        );
      }
      return delta.concat(childrenDelta);
    }, new Delta());
  }
  return new Delta();
}

function createMatchAlias(format: string) {
  return (_node: Element, delta: Delta, scroll: ScrollBlot) => {
    return applyFormat(delta, format, true, scroll);
  };
}

function matchAttributor(node: HTMLElement, delta: Delta, scroll: ScrollBlot) {
  if ((scroll as Scroll).hierarchical) {
    const match = scroll.query(node);

    if (
      match &&
      'prototype' in match &&
      match.prototype instanceof ContainerBlot
    ) {
      return delta;
    }
  }

  const attributes = Attributor.keys(node);
  const classes = ClassAttributor.keys(node);
  const styles = StyleAttributor.keys(node);
  const stylesMap = scroll.registry.has(Styles)
    ? StylesAttributor.keys(node)
    : [];
  const klasses = scroll.registry.has(Classes)
    ? ClassesAttributor.keys(node)
    : [];
  const formats: Record<string, string | undefined> = {};
  attributes
    .concat(classes)
    .concat(styles)
    .concat(stylesMap)
    .concat(klasses)
    .forEach((name) => {
      let attr = scroll.query(name, Scope.ATTRIBUTE) as Attributor;
      if (attr != null) {
        formats[attr.attrName] = attr.value(node);
        if (formats[attr.attrName]) return;
      }
      attr = ATTRIBUTE_ATTRIBUTORS[name];
      if (attr != null && (attr.attrName === name || attr.keyName === name)) {
        formats[attr.attrName] = attr.value(node) || undefined;
      }
      attr = CLASS_ATTRIBUTORS[name];
      if (attr != null && (attr.attrName === name || attr.keyName === name)) {
        formats[attr.attrName] = attr.value(node) || undefined;
      }
      attr = STYLE_ATTRIBUTORS[name];
      if (attr != null && (attr.attrName === name || attr.keyName === name)) {
        attr = STYLE_ATTRIBUTORS[name];
        formats[attr.attrName] = attr.value(node) || undefined;
      }
    });

  return Object.entries(formats).reduce(
    (newDelta, [name, value]) => applyFormat(newDelta, name, value, scroll),
    delta,
  );
}

function matchBlot(node: Node, delta: Delta, scroll: Scroll) {
  const match = scroll.query(node);
  if (match == null) return delta;
  // @ts-expect-error
  if (match.prototype instanceof EmbedBlot) {
    const embed = {};
    // @ts-expect-error
    const value = match.value(node);
    if (value != null) {
      // @ts-expect-error
      embed[match.blotName] = value;
      // @ts-expect-error
      delta = new Delta().insert(embed, match.formats(node, scroll));
    }
  } else {
    // @ts-expect-error
    if (match.prototype instanceof BlockBlot) {
      if (!deltaEndsWith(delta, '\n')) {
        delta.insert('\n');
      }

      if (scroll.hierarchical) {
        delta = normalizeLastOp(delta);
      }
    }
    if (
      'blotName' in match &&
      'formats' in match &&
      typeof match.formats === 'function' &&
      !(scroll.hierarchical && match.prototype instanceof ContainerBlot)
    ) {
      const formats = match.formats(node, scroll);
      delta = applyFormat(delta, match.blotName, formats, scroll);
    }
  }
  if (scroll.hierarchical && (match as BlotConstructor).isBlock) {
    const containers = serializeContainerDOM(node, scroll);
    if (containers.length) {
      const lastOp = delta.ops[delta.ops.length - 1];
      lastOp.attributes = {
        ...(lastOp.attributes || {}),
        container: containers,
      };
    }
  }
  return delta;
}

function matchBreak(node: Node, delta: Delta, scroll: ScrollBlot) {
  const parentLineElement = getParentLine(node, scroll);
  if (parentLineElement == null) {
    // <br> tags pasted without a parent will be treated as soft breaks
    return new Delta().insert(SOFT_BREAK_CHARACTER);
  }
  if (isPre(parentLineElement)) {
    // code blocks don't allow soft breaks
    return new Delta().insert('\n');
  }
  if (isInLastPositionOfParentLine(node, parentLineElement)) {
    // ignore trailing breaks
    return delta;
  }
  return new Delta().insert(SOFT_BREAK_CHARACTER);
}

function getParentLine(node: Node, scroll: ScrollBlot): HTMLElement | null {
  let current: Node = node;
  while (current.parentElement != null) {
    if (isLine(current.parentElement, scroll)) {
      return current.parentElement;
    }
    current = current.parentElement;
  }
  return null;
}

function isInLastPositionOfParentLine(
  node: Node,
  parentLineElement: HTMLElement,
): boolean {
  let current: Node = node;
  while (current.nextSibling == null && current.parentElement != null) {
    if (current.parentElement === parentLineElement) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function matchCodeBlock(node: Node, delta: Delta, scroll: ScrollBlot) {
  const match = scroll.query('code-block');
  const language =
    match && 'formats' in match && typeof match.formats === 'function'
      ? match.formats(node, scroll)
      : true;
  return applyFormat(delta, 'code-block', language, scroll);
}

function matchIgnore() {
  return new Delta();
}

function matchIndent(node: Node, delta: Delta, scroll: ScrollBlot) {
  const match = scroll.query(node);
  if (
    match == null ||
    // @ts-expect-error
    match.blotName !== 'list' ||
    !deltaEndsWith(delta, '\n')
  ) {
    return delta;
  }
  let indent = -1;
  let parent = node.parentNode;
  while (parent != null) {
    // @ts-expect-error
    if (['OL', 'UL'].includes(parent.tagName)) {
      indent += 1;
    }
    parent = parent.parentNode;
  }
  if (indent <= 0) return delta;
  return delta.reduce((composed, op) => {
    if (!op.insert) return composed;
    if (op.attributes && typeof op.attributes.indent === 'number') {
      return composed.push(op);
    }
    return composed.insert(op.insert, { indent, ...(op.attributes || {}) });
  }, new Delta());
}

function matchList(node: Node, delta: Delta, scroll: ScrollBlot) {
  const element = node as Element;
  let list = element.tagName === 'OL' ? 'ordered' : 'bullet';

  const checkedAttr = element.getAttribute('data-checked');
  if (checkedAttr) {
    list = checkedAttr === 'true' ? 'checked' : 'unchecked';
  }

  return applyFormat(delta, 'list', list, scroll);
}

function matchNewline(node: Node, delta: Delta, scroll: ScrollBlot) {
  if (!deltaEndsWith(delta, '\n')) {
    if (
      isLine(node, scroll) &&
      (node.childNodes.length > 0 || node instanceof HTMLParagraphElement)
    ) {
      return delta.insert('\n');
    }
    if (delta.length() > 0 && node.nextSibling) {
      let nextSibling: Node | null = node.nextSibling;
      while (nextSibling != null) {
        if (isLine(nextSibling, scroll)) {
          return delta.insert('\n');
        }
        const match = scroll.query(nextSibling);
        // @ts-expect-error
        if (match && match.prototype instanceof BlockEmbed) {
          return delta.insert('\n');
        }
        nextSibling = nextSibling.firstChild;
      }
    }
  }
  return delta;
}

function matchStyles(node: HTMLElement, delta: Delta, scroll: ScrollBlot) {
  const formats: Record<string, unknown> = {};
  const style: Partial<CSSStyleDeclaration> = node.style || {};
  if (style.fontStyle === 'italic') {
    formats.italic = true;
  }
  if (style.textDecoration === 'underline') {
    formats.underline = true;
  }
  if (style.textDecoration === 'line-through') {
    formats.strike = true;
  }
  if (
    style.fontWeight?.startsWith('bold') ||
    // @ts-expect-error Fix me later
    parseInt(style.fontWeight, 10) >= 700
  ) {
    formats.bold = true;
  }
  delta = Object.entries(formats).reduce(
    (newDelta, [name, value]) => applyFormat(newDelta, name, value, scroll),
    delta,
  );
  // @ts-expect-error
  if (parseFloat(style.textIndent || 0) > 0) {
    // Could be 0.5in
    return new Delta().insert('\t').concat(delta);
  }
  return delta;
}

function getRowIndex(node: HTMLTableRowElement) {
  const table =
    node.parentElement?.tagName === 'TABLE'
      ? node.parentElement
      : node.parentElement?.parentElement;
  if (table != null) {
    const rows = Array.from(table.querySelectorAll('tr'));
    return rows.indexOf(node) + 1;
  }
  return -1;
}

function matchTable(
  node: HTMLTableRowElement,
  delta: Delta,
  scroll: ScrollBlot,
) {
  const rowIndex = getRowIndex(node);
  if (rowIndex > 0) {
    return applyFormat(delta, 'table', rowIndex, scroll).reduce(
      (newDelta, op) => {
        if (!op.insert) return newDelta;
        if (
          !op.attributes ||
          !op.attributes.table ||
          op.attributes.table !== CELL_OVERRIDE_PLACEHOLDER
        ) {
          return newDelta.push(op);
        }
        delete op.attributes.table;
        return newDelta.insert(op.insert, { ...op.attributes });
      },
      new Delta(),
    );
  }
  return delta;
}

const CELL_OVERRIDE_PLACEHOLDER = 'NotARegularTableCell';

function matchTableCell(
  node: HTMLTableCellElement,
  delta: Delta,
  scroll: ScrollBlot,
) {
  const blotConstructor = scroll.query(node) as BlotConstructor;
  if (blotConstructor && blotConstructor.blotName !== 'table') {
    return applyFormat(delta, 'table', CELL_OVERRIDE_PLACEHOLDER, scroll);
  }
  return delta;
}

function matchText(node: HTMLElement, delta: Delta, scroll: ScrollBlot) {
  // @ts-expect-error
  let text = node.data as string;
  // Word represents empty line with <o:p>&nbsp;</o:p>
  if (node.parentElement?.tagName === 'O:P') {
    return delta.insert(text.trim());
  }
  if (!isPre(node)) {
    if (
      text.trim().length === 0 &&
      text.includes('\n') &&
      !isBetweenInlineElements(node, scroll)
    ) {
      return delta;
    }
    // convert all non-nbsp whitespace into regular space
    text = text.replace(/[^\S\u00a0]/g, ' ');
    // collapse consecutive spaces into one
    text = text.replace(/ {2,}/g, ' ');
    if (
      (node.previousSibling == null &&
        node.parentElement != null &&
        isLine(node.parentElement, scroll)) ||
      (node.previousSibling instanceof Element &&
        isLine(node.previousSibling, scroll))
    ) {
      // block structure means we don't need leading space
      text = text.replace(/^ /, '');
    }
    if (
      (node.nextSibling == null &&
        node.parentElement != null &&
        isLine(node.parentElement, scroll)) ||
      (node.nextSibling instanceof Element && isLine(node.nextSibling, scroll))
    ) {
      // block structure means we don't need trailing space
      text = text.replace(/ $/, '');
    }
    // done removing whitespace and can normalize all to regular space
    text = text.replaceAll('\u00a0', ' ');
  }
  return delta.insert(text);
}

function serializeContainerDOM(
  node: Node,
  scroll: ScrollBlot,
): SerializedContainer[] {
  const containers: SerializedContainer[] = [];

  let current = node.parentElement;
  let blockCandidate = node;

  let mergerFound = false;

  while (current && current !== scroll.domNode) {
    let rowIndex = -1;
    if (current.tagName === 'TD') {
      current.classList.add('ql-cell-as-container');
      if (!current.dataset.row) {
        rowIndex = getRowIndex(current.parentElement as HTMLTableRowElement);
      }
    }

    const blot = scroll.query(current);

    // @ts-expect-error
    if (blot && blot.prototype instanceof ContainerBlot) {
      // @ts-expect-error
      const blotName = blot.blotName;

      if (!mergerFound) {
        mergerFound = hasPreviousBlockBlot(blockCandidate, scroll);
      }

      const container: SerializedContainer = {
        allowSplit: true,
        blot: blotName,
        action: containerRestoreAction.MERGE_TO_PREV,
      };

      if (!mergerFound) {
        container.action = containerRestoreAction.REUSE;
        // @ts-expect-error
        const formats = blot.formats(current, scroll) || {};
        if (rowIndex > 0) {
          formats.tableId = rowIndex;
        }
        if (formats && Object.keys(formats).length) {
          container.formats = formats;
        }
      }

      containers.push(container);
    } else {
      break;
    }

    blockCandidate = current;

    current = current.parentElement;
  }

  return containers;
}

function hasPreviousBlockBlot(node: Node, scroll: ScrollBlot): boolean {
  let current: Node | null = node.previousSibling;

  while (current) {
    if (hasBlockBlotInSubtree(current, scroll)) {
      return true;
    }
    current = current.previousSibling;
  }

  return false;
}

function hasBlockBlotInSubtree(node: Node, scroll: ScrollBlot): boolean {
  const stack: Node[] = [node];

  while (stack.length > 0) {
    const current = stack.pop();
    if (current == null) {
      continue;
    }

    const match = scroll.query(current);

    // @ts-expect-error
    if (match && match.isBlock) {
      return true;
    }

    const children = current.childNodes;
    for (let i = children.length - 1; i >= 0; i -= 1) {
      stack.push(children[i]);
    }
  }

  return false;
}

export {
  Clipboard as default,
  matchAttributor,
  matchBlot,
  matchNewline,
  matchText,
  traverse,
};
