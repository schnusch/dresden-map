function parse_fragment(): URLSearchParams {
    return new URLSearchParams((location.hash || "").substr(1))
}

function has_own(obj: any, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(obj, key)
}

type WithPrefix<P extends string> = `${P}${string}`
type FragmentParamEvent = CustomEvent<{
    key: string
    values: Array<string>
}>

class Fragment extends EventTarget {
    private old_fragment: URLSearchParams = parse_fragment()

    constructor() {
        super()
        window.addEventListener("hashchange", () => this.on_fragment_change())
    }

    /**
     * dispatch changed parameters as `param:${key}` events
     */
    private on_fragment_change(): void {
        const new_fragment = parse_fragment()

        // removed params
        for (const key of this.old_fragment.keys()) {
            if (!new_fragment.has(key)) {
                this.dispatch(
                    new CustomEvent(`param:${key}`, {
                        detail: { key: key, values: [] },
                    }),
                )
            }
        }

        // new/changed params
        for (const key of new_fragment.keys()) {
            const old_vals = this.old_fragment.getAll(key)
            const values = new_fragment.getAll(key)
            if (
                values.length != old_vals.length ||
                !values.every((x: string, i: number) => x === old_vals[i])
            ) {
                this.dispatch(
                    new CustomEvent(`param:${key}`, {
                        detail: { key: key, values: values },
                    }),
                )
            }
        }

        this.old_fragment = new_fragment
    }

    public getAll(key: string): Array<string> {
        return this.old_fragment.getAll(key)
    }

    /**
     * Set `fragment` parameter `key` without triggering callbacks.
     */
    public set(key: string, values: Array<string>): void {
        if (values.length == 0) {
            this.old_fragment.delete(key)
        } else {
            this.old_fragment.set(key, values[0])
            values.slice(1).forEach((v) => this.old_fragment.append(key, v))
        }
        location.replace("#" + this.old_fragment)
    }

    /**
     * Call `callback` when the fragment parameter `key` changes.
     */
    public on(
        key: string,
        callback: (key: string, values: Array<string>) => void,
        options?: boolean | AddEventListenerOptions,
    ): void {
        const listener = (ev: FragmentParamEvent) => {
            callback(ev.detail.key, ev.detail.values)
        }
        this.addEventListener(`param:${key}`, <EventListener>listener, options)
    }

    dispatch(ev: FragmentParamEvent): boolean {
        return super.dispatchEvent(ev)
    }
}

export const fragment = new Fragment()
