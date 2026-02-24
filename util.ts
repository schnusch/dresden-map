import * as L from "leaflet"

export async function fetch_dnt(url: string): Promise<Response> {
    const resp = await fetch(url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        headers: {
            DNT: "1",
        },
    })
    if (!resp.ok) {
        throw new Error(`cannot fetch ${url}`)
    }
    return resp
}

type Marker = L.Layer & {
    getLatLng(): L.LatLng
}

export class BoundedMarkerGroup {
    public active: Array<Marker>
    public inactive: Array<Marker>
    readonly layer_group: L.LayerGroup

    constructor() {
        this.active = []
        this.inactive = []
        this.layer_group = L.layerGroup()
    }

    update_active(bounds: L.LatLngBounds): void {
        this.active = this.active.filter((m) => {
            if (bounds.contains(m.getLatLng())) {
                return true
            } else {
                this.layer_group.removeLayer(m)
                this.inactive.push(m)
                return false
            }
        })
        this.inactive = this.inactive.filter((m) => {
            if (bounds.contains(m.getLatLng())) {
                this.layer_group.addLayer(m)
                this.active.push(m)
                return false
            } else {
                return true
            }
        })
    }

    add(marker: Marker, bounds?: L.LatLngBounds): void {
        if (bounds !== undefined && bounds.contains(marker.getLatLng())) {
            marker.addTo(this.layer_group)
            this.active.push(marker)
        } else {
            this.inactive.push(marker)
        }
    }
}
