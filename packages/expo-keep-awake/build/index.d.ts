/**
 * The default tag used, when no tag has been specified in keep awake method calls.
 */
export declare const ExpoKeepAwakeTag = "ExpoKeepAwakeDefaultTag";
export type KeepAwakeOptions = {
    /**
     * The call will throw an unhandled promise rejection on Android when the original Activity is dead or deactivated.
     * Set the value to `true` for suppressing the uncaught exception.
     */
    suppressDeactivateWarnings?: boolean;
};
/**
 * A React hook to keep the screen awake for as long as the owner component is mounted.
 * The optionally provided `tag` argument is used when activating and deactivating the keep-awake
 * feature. If unspecified, the default `tag` is used. See the documentation for `activateKeepAwake`
 * below to learn more about the `tag` argument.
 *
 * @param tag Tag to lock screen sleep prevention. If not provided, the default tag is used.
 * @param options Additional options for the keep awake hook.
 */
export declare function useKeepAwake(tag?: string, options?: KeepAwakeOptions): void;
/**
 * Prevents the screen from sleeping until `deactivateKeepAwake` is called with the same `tag` value.
 *
 * If the `tag` argument is specified, the screen will not sleep until you call `deactivateKeepAwake`
 * with the same `tag` argument. When using multiple `tags` for activation you'll have to deactivate
 * each one in order to re-enable screen sleep. If tag is unspecified, the default `tag` is used.
 * @param tag Tag to lock screen sleep prevention. If not provided, the default tag is used.
 */
export declare function activateKeepAwake(tag?: string): Promise<void>;
/**
 * Releases the lock on screen-sleep prevention associated with the given `tag` value. If `tag`
 * is unspecified, it defaults to the same default tag that `activateKeepAwake` uses.
 * @param tag Tag to release the lock on screen sleep prevention. If not provided,
 * the default tag is used.
 */
export declare function deactivateKeepAwake(tag?: string): Promise<void>;
//# sourceMappingURL=index.d.ts.map