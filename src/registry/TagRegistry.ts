/**
 * Tag registry for custom (non-standard) SCXML tags.
 *
 * Holds registered `CustomTagSpec` entries keyed by lowercase tag name and
 * exposes lookup utilities used by the parser, validator, and serializer
 * pipelines. Supports both a process-wide singleton (via `getInstance`) and
 * isolated instances (via `new TagRegistry()`), keeping the core engine
 * closed for modification but open to extension.
 */
import type { CustomASTNode, CustomTagSpec } from '../types/extensibility';

/**
 * A registry mapping lowercase tag names to their `CustomTagSpec`.
 */
export class TagRegistry {
  private static instance: TagRegistry | undefined;
  private readonly registry = new Map<string, CustomTagSpec>();

  /**
   * Access the process-wide singleton registry.
   */
  public static getInstance(): TagRegistry {
    if (!TagRegistry.instance) {
      TagRegistry.instance = new TagRegistry();
    }
    return TagRegistry.instance;
  }

  /**
   * Register a custom tag spec. Registration is case-insensitive.
   *
   * @param spec - The custom tag specification to register.
   * @returns This registry, for chaining.
   */
  public register<T extends CustomASTNode = CustomASTNode>(spec: CustomTagSpec<T>): this {
    this.registry.set(spec.tagName.toLowerCase(), spec as unknown as CustomTagSpec);
    return this;
  }

  /**
   * Look up a tag spec by name (case-insensitive).
   */
  public get(tagName: string): CustomTagSpec | undefined {
    return this.registry.get(tagName.toLowerCase());
  }

  /**
   * Whether a tag name has a registered spec (case-insensitive).
   */
  public has(tagName: string): boolean {
    return this.registry.has(tagName.toLowerCase());
  }

  /**
   * Remove a single registered spec by name (case-insensitive).
   *
   * @param tagName - The tag name to unregister.
   * @returns Whether an entry was removed.
   */
  public unregister(tagName: string): boolean {
    return this.registry.delete(tagName.toLowerCase());
  }

  /**
   * Remove all registered specs. Useful for isolated unit tests.
   */
  public clear(): void {
    this.registry.clear();
  }

  /**
   * The number of currently registered specs.
   */
  public get size(): number {
    return this.registry.size;
  }
}
