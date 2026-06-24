/**
 * Dependency-injection token holding the resolved {@link AiModuleOptions} for
 * the module. Used internally to inject configuration into providers.
 */
export const AI_MODULE_OPTIONS = 'AI_MODULE_OPTIONS';

/**
 * Dependency-injection token holding the active provider implementation.
 * The {@link AiService} depends on this token rather than a concrete class so
 * that the provider can be swapped based on configuration.
 */
export const AI_PROVIDER = 'AI_PROVIDER';
