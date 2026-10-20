/** Tracks resource outcomes independently from Cesium stage.ready.
 * Readiness promises always settle; callers inspect status/errors for failed assets.
 */
export default class AssetManager {
    constructor({ onError } = {}) {
        this._entries = new Map();
        this._listeners = new Set();
        this._disposed = false;
        this._onError = onError;
        this._ready = Promise.resolve();
    }

    add({ id, url, required = true, load }) {
        if (!this._disposed && !this._entries.has(id)) {
            this._entries.set(id, { id, url, required, load, status: "idle" });
        }
    }

    get status() {
        if (this._disposed) return "disposed";
        const entries = [...this._entries.values()];
        if (entries.some(entry => entry.status === "loading")) return "loading";
        if (entries.some(entry => entry.status === "error")) return "error";
        if (entries.length === 0 || entries.some(entry => entry.status === "idle")) return "idle";
        return "ready";
    }

    get errors() {
        return Object.freeze([...this._entries.values()]
            .filter(entry => entry.status === "error")
            .map(({ id, url, required, error }) => Object.freeze({ id, url, required, error })));
    }

    get ready() { return this._ready; }

    subscribe(listener) {
        if (this._disposed) return () => {};
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _notify() {
        const snapshot = Object.freeze({ status: this.status, errors: this.errors });
        for (const listener of this._listeners) {
            // Observer failures cannot turn successful resource loads into failures.
            try { listener(snapshot); } catch (error) { console.error(error); }
        }
    }

    start(ids = [...this._entries.keys()]) {
        if (this._disposed) return Promise.resolve();
        for (const id of ids) {
            const entry = this._entries.get(id);
            if (!entry || entry.status === "ready" || entry.status === "loading") continue;
            entry.status = "loading";
            entry.error = undefined;
            entry.done = new Promise(resolve => { entry.resolve = resolve; });
            // Invoke synchronously to preserve the current request scheduling behavior.
            let source;
            try { source = entry.load(); }
            catch (error) { source = Promise.reject(error); }
            Promise.resolve(source).then(() => this._finish(entry, true), error => this._finish(entry, false, error));
        }
        this._ready = Promise.all([...this._entries.values()]
            .filter(entry => entry.required && entry.status === "loading")
            .map(entry => entry.done)).then(() => undefined);
        this._notify();
        return this._ready;
    }

    _finish(entry, succeeded, error) {
        if (this._disposed || entry.status !== "loading") return;
        entry.status = succeeded ? "ready" : "error";
        entry.error = error;
        entry.resolve();
        entry.resolve = undefined;
        if (!succeeded && this._onError) {
            try { this._onError(Object.freeze({ id: entry.id, url: entry.url, required: entry.required, error })); }
            catch (observerError) { console.error(observerError); }
        }
        this._notify();
    }

    retry() {
        const ids = [...this._entries.values()]
            .filter(entry => entry.status === "error").map(entry => entry.id);
        this.start(ids);
        return Promise.all(ids.map(id => this._entries.get(id).done)).then(() => undefined);
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        for (const entry of this._entries.values()) {
            entry.resolve?.();
            entry.resolve = undefined;
        }
        this._notify();
        this._listeners.clear();
        this._ready = Promise.resolve();
    }
}
