// hierarchical-globals.ts

import type { RegistryDefinition } from 'parchment';
import type Quill from '../../../src/core.js';

declare global {
  interface Window {
    HierarchicalGlobals: {
      registerHierarchyAndStyles: () => void;
    };
    quill: Quill;
    Quill: typeof Quill;
  }
}

const hierarchical = {
  registerHierarchyAndStyles: () => {
    window.quill.scroll.registry.register(
      window.Quill.import('formats/styles') as RegistryDefinition,
      window.Quill.import('formats/classes') as RegistryDefinition,
      window.Quill.import('formats/container') as RegistryDefinition,
      window.Quill.import('blots/generic-container') as RegistryDefinition,
    );
  },
};

export default hierarchical;
