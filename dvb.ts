import * as L from "leaflet"
import { BoundedMarkerGroup, fetch_dnt } from "./util"

interface DvbStop {
    id: string
    name: string
    latlng: L.LatLng
}

async function fetch_dvb_stations(
    bounds: L.LatLngBounds,
): Promise<Array<DvbStop>> {
    const sw = L.CRS.EPSG3857.project(bounds.getSouthWest())
    const ne = L.CRS.EPSG3857.project(bounds.getNorthEast())
    const resp = await fetch_dnt(
        "https://www.dvb.de/apps/map/pins?" +
            new URLSearchParams({
                coordinatesystem: "epsg3857",
                showlines: "true",
                swlat: String(Math.floor(sw.y / 1000) * 1000),
                swlng: String(Math.floor(sw.x / 1000) * 1000),
                nelat: String(Math.ceil(ne.y / 1000) * 1000),
                nelng: String(Math.ceil(ne.x / 1000) * 1000),
                pintypes: "stop",
            }),
    )
    const stops = []
    for (const _row of await resp.json()) {
        const row = _row.split("|")
        if (row.length < 6) {
            console.error(`cannot parse ${JSON.stringify(_row)}`)
            continue
        }
        const id = row[0]
        const name = row[3]
        const y = parseFloat(row[4])
        const x = parseFloat(row[5])
        stops.push({
            id: id,
            name: name,
            latlng: L.CRS.EPSG3857.unproject(L.point(x, y)),
        })
    }
    return stops
}

interface DvbFormElements {
    form: HTMLFormElement
    button: HTMLButtonElement
    origin: HTMLInputElement
    dest: HTMLInputElement
}

function create_dvb_form(label: string): DvbFormElements {
    const date_formatter = new Intl.DateTimeFormat("de-DE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    })
    const time_formatter = new Intl.DateTimeFormat("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
    })

    const form = <HTMLFormElement>(
        document.createElementNS("http://www.w3.org/1999/xhtml", "form")
    )

    const [date, time, origin, dest, ..._] = [
        ["date", ""],
        ["time", ""],
        ["originid", ""],
        ["destinationid", ""],
        ["submit", "true"],
        ["arrival", "false"],
    ].map(([key, value]) => {
        const input = form.appendChild(
            <HTMLInputElement>(
                document.createElementNS(
                    "http://www.w3.org/1999/xhtml",
                    "input",
                )
            ),
        )
        input.type = "hidden"
        input.name = key
        input.value = value
        return input
    })

    form.target = "_blank"
    form.rel = "noreferrer"
    form.method = "GET"
    form.action = "https://www.dvb.de/de-de/fahrplan/verbindungsauskunft"

    form.addEventListener("submit", () => {
        const now = new Date()
        date.value = date_formatter.format(now)
        time.value = time_formatter.format(now)
    })

    const button = form.appendChild(
        <HTMLButtonElement>(
            document.createElementNS("http://www.w3.org/1999/xhtml", "button")
        ),
    )
    button.type = "submit"
    button.disabled = true
    Object.assign(button.style, {
        height: "100%",
        fontSize: "2rem",
        fontWeight: "bold",
    })
    button.appendChild(document.createTextNode(label))

    return {
        form: form,
        button: button,
        origin: origin,
        dest: dest,
    }
}

function create_dvb_popup(): {
    root: HTMLElement
    label: HTMLElement
    mark_button: HTMLButtonElement
    inputs: {
        origin: DvbFormElements
        dest: DvbFormElements
    }
} {
    const div = document.createElementNS("http://www.w3.org/1999/xhtml", "div")

    const label = div
        .appendChild(
            document.createElementNS("http://www.w3.org/1999/xhtml", "p"),
        )
        .appendChild(
            document.createElementNS("http://www.w3.org/1999/xhtml", "strong"),
        )

    const buttons = div.appendChild(
        document.createElementNS("http://www.w3.org/1999/xhtml", "div"),
    )
    Object.assign(buttons.style, {
        display: "flex",
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "stretch",
    })

    const origin = create_dvb_form("↦")
    origin.button.style.color = "darkgreen"
    buttons.appendChild(origin.form)

    const mark_button = buttons.appendChild(
        <HTMLButtonElement>(
            document.createElementNS("http://www.w3.org/1999/xhtml", "button")
        ),
    )
    mark_button.type = "button"
    const img = mark_button.appendChild(
        <HTMLImageElement>(
            document.createElementNS("http://www.w3.org/1999/xhtml", "img")
        ),
    )
    Object.assign(img.style, {
        height: "1em",
    })
    img.alt = "🖈"
    img.src = "images/marker-icon.png"
    Object.assign(mark_button.style, {
        marginLeft: "1rem",
        marginRight: "1rem",
        fontSize: "2rem",
        fontWeight: "bold",
    })

    const dest = create_dvb_form("⇥")
    dest.button.style.color = "darkred"
    buttons.appendChild(dest.form)

    return {
        root: div,
        label: label,
        mark_button: mark_button,
        inputs: {
            origin: origin,
            dest: dest,
        },
    }
}

export function add_dvb_stops(map: L.Map): L.LayerGroup {
    const { root, label, mark_button, inputs } = create_dvb_popup()

    interface SavedStop {
        marker: L.Marker
        stop: DvbStop
    }

    const clicked_stop = <SavedStop>{}
    const saved_stop: Partial<SavedStop> = {}
    mark_button.addEventListener("click", () => {
        if (saved_stop.marker === undefined) {
            saved_stop.marker = L.marker(clicked_stop.marker.getLatLng())
            saved_stop.marker.on("click", () => {
                saved_stop.marker?.removeFrom(map)
                delete saved_stop.marker
                delete saved_stop.stop
                inputs.origin.button.disabled = true
                inputs.dest.button.disabled = true
            })
            saved_stop.marker.addTo(map)
            inputs.origin.button.disabled = false
            inputs.dest.button.disabled = false
        } else {
            saved_stop.marker.setLatLng(clicked_stop.marker.getLatLng())
        }
        saved_stop.stop = clicked_stop.stop
        clicked_stop.marker.closePopup()
    })
    inputs.origin.form.addEventListener("submit", () => {
        inputs.origin.origin.value = clicked_stop.stop.id
        inputs.origin.dest.value = saved_stop.stop?.id || ""
        clicked_stop.marker.closePopup()
    })
    inputs.dest.form.addEventListener("submit", () => {
        inputs.dest.origin.value = saved_stop.stop?.id || ""
        inputs.dest.dest.value = clicked_stop.stop.id
        clicked_stop.marker.closePopup()
    })

    const stop_icon = <HTMLImageElement>(
        document.createElementNS("http://www.w3.org/1999/xhtml", "img")
    )
    stop_icon.alt = "Haltestelle"
    stop_icon.src = "images/stop.svg"
    Object.assign(stop_icon.style, {
        height: "18px",
        // center image in container, but the container has
        // style="margin-left: -6px; margin-top: -6px;"
        transform: "translate(6px, 6px) translate(-50%, -50%)",
    })

    const dvb_stations: { [id: string]: DvbStop } = {}
    const markers = new BoundedMarkerGroup()

    async function update_stations(): Promise<void> {
        const bounds = map.getBounds()
        markers.update_active(bounds)
        ;(await fetch_dvb_stations(bounds)).forEach((stop) => {
            if (dvb_stations[stop.id] !== undefined) {
                return
            }

            const marker = L.marker(stop.latlng, {
                icon: L.divIcon({
                    html: <HTMLElement>stop_icon.cloneNode(true),
                    className: "",
                }),
            })
            marker.bindPopup(root)
            marker.on("popupopen", () => {
                // add stop name
                while (label.firstChild) {
                    label.removeChild(label.firstChild)
                }
                label.appendChild(document.createTextNode(stop.name))

                // update `clicked_stop`
                Object.assign(clicked_stop, {
                    marker: marker,
                    stop: stop,
                })

                // set button hover texts
                if (saved_stop.stop === undefined) {
                    inputs.origin.button.removeAttributeNS(
                        "http://www.w3.org/1999/xhtml",
                        "title",
                    )
                    inputs.dest.button.removeAttributeNS(
                        "http://www.w3.org/1999/xhtml",
                        "title",
                    )
                } else {
                    inputs.origin.button.setAttributeNS(
                        "http://www.w3.org/1999/xhtml",
                        "title",
                        `von ${clicked_stop.stop.name}\nnach ${saved_stop.stop.name}`,
                    )
                    inputs.dest.button.setAttributeNS(
                        "http://www.w3.org/1999/xhtml",
                        "title",
                        `von ${saved_stop.stop.name}\nnach ${clicked_stop.stop.name}`,
                    )
                }
            })
            markers.add(marker, bounds)
            dvb_stations[stop.id] = stop
        })
    }

    ;["resize", "zoomend", "moveend"].forEach((event) =>
        map.on(event, update_stations),
    )
    update_stations()

    return markers.layer_group
}
