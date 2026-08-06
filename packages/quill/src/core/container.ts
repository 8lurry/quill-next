import type { AttributeMap } from '@quill-next/delta-es';

import type { SerializedContainer } from 'parchment';

export interface ExtractedAttributes {
  formats: AttributeMap;
  containers: SerializedContainer[];
}

export function extractContainerAttributes(
  attributes: AttributeMap | undefined,
): ExtractedAttributes {
  if (attributes == null) {
    return {
      formats: {},
      containers: [],
    };
  }

  const { container, ...formats } = attributes as AttributeMap & {
    container?: SerializedContainer[];
  };

  return {
    formats,
    containers: container ?? [],
  };
}
