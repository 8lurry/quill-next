import { Registry } from 'parchment';
import type { Attributor } from 'parchment';

import Quill from '../../../src/core.js';
import type { QuillOptions } from '../../../src/core/quill.js';
import Block from '../../../src/blots/block.js';
import Break from '../../../src/blots/break.js';
import Cursor from '../../../src/blots/cursor.js';
import Scroll from '../../../src/blots/scroll.js';
import TextBlot from '../../../src/blots/text.js';
import ListItem, { ListContainer } from '../../../src/formats/list.js';
import Inline from '../../../src/blots/inline.js';
import Emitter from '../../../src/core/emitter.js';
import { normalizeHTML } from './utils.js';
import SoftBreak from '../../../src/blots/soft-break.js';

export const createRegistry = (formats: unknown[] = []) => {
  const registry = new Registry();

  formats.forEach((format) => {
    registry.register(format as Attributor);
  });
  registry.register(Block);
  registry.register(Break);
  registry.register(SoftBreak);
  registry.register(Cursor);
  registry.register(Inline);
  registry.register(Scroll);
  registry.register(TextBlot);
  registry.register(ListContainer);
  registry.register(ListItem);

  return registry;
};

export const createScroll = (
  html: string | { html: string },
  registry = createRegistry(),
  container = document.body,
) => {
  const emitter = new Emitter();
  const root = container.appendChild(document.createElement('div'));
  root.innerHTML = normalizeHTML(html);
  const scroll = new Scroll(registry, root, {
    emitter,
  });
  return scroll;
};

export const createQuill = (
  htmlOrContainer: string | HTMLDivElement,
  options: QuillOptions,
) => {
  let container: HTMLDivElement;
  if (typeof htmlOrContainer === 'string') {
    container = document.body.appendChild(document.createElement('div'));
    container.innerHTML = normalizeHTML(htmlOrContainer as unknown as string);
  } else {
    container = htmlOrContainer;
  }
  const quill = new Quill(container, options);
  return quill;
};
