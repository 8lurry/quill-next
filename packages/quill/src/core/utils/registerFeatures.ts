import type { Registry } from 'parchment';
import { ContainerAttributorInstance } from '../../formats/container.js';
import { GenericContainer } from '../../blots/container.js';
import { Styles } from '../../formats/styles.js';
import { Classes } from '../../formats/classes.js';

interface QuillFeature {
  register(registry: Registry): void;
}

export interface QuillFeatures {
  hierarchy?: boolean;
  styles?: boolean;
}

const HierarchyFeature: QuillFeature = {
  register(registry) {
    registry.register(GenericContainer, ContainerAttributorInstance);
  },
};

const StylesFeature: QuillFeature = {
  register(registry) {
    registry.register(Styles, Classes);
  },
};

const features = {
  hierarchy: HierarchyFeature,
  styles: StylesFeature,
} satisfies Record<string, QuillFeature>;

export default function registerFeatures(
  featuresOption: QuillFeatures | undefined,
  registry: Registry,
) {
  const enabledFeatures = featuresOption ?? {};

  for (const [name, enabled] of Object.entries(enabledFeatures)) {
    if (!enabled) continue;

    const feature = features[name as keyof typeof features];

    if (!feature) {
      throw new Error(`Unknown Quill feature: ${name}`);
    }

    feature.register(registry);
  }
}
