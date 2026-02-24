import * as L from "leaflet"
import { add_dvb_stops } from "./dvb"
import { fragment } from "./fragment"
import { BoundedMarkerGroup, fetch_dnt } from "./util"

window.onerror = (message, source, lineno, colno, error) => {
    alert(`${source}:${lineno}:${colno} ${message}`)
}

function add_user_position(map: L.Map): void {
    const moving_icon = <HTMLImageElement>(
        document.createElementNS("http://www.w3.org/1999/xhtml", "img")
    )
    moving_icon.alt = "↑"
    moving_icon.src = "images/moving.svg"
    const div_icon = L.divIcon({ html: moving_icon, className: "" })

    const user: {
        inaccuracy?: L.Circle
        standing?: L.CircleMarker
        moving?: L.Marker
    } = {}

    map.locate({ watch: true })
    map.on("locationfound", (e) => {
        // inaccuracy circle
        if (e.accuracy > 5) {
            if (user.inaccuracy === undefined) {
                user.inaccuracy = L.circle(e.latlng, {
                    radius: e.accuracy,
                    stroke: false,
                    fillColor: "blue",
                })
                user.inaccuracy.addTo(map)
            } else {
                user.inaccuracy.setLatLng(e.latlng)
                user.inaccuracy.setRadius(e.accuracy)
            }
        } else if (user.inaccuracy !== undefined) {
            user.inaccuracy.removeFrom(map)
            delete user.inaccuracy
        }

        if (e.speed < 0.5 || e.heading === undefined) {
            // unit: m/s
            if (user.standing === undefined) {
                // use circle marker for standing position
                user.standing = L.circleMarker(e.latlng, {
                    radius: 10,
                    stroke: true,
                    weight: 2,
                    color: "white",
                    fillColor: "blue",
                    fillOpacity: 1,
                })
                user.standing.addTo(map)
            } else {
                user.standing.setLatLng(e.latlng)
            }
            if (user.moving !== undefined) {
                user.moving.removeFrom(map)
                delete user.moving
            }
        } else {
            // use pointy marker
            if (user.moving === undefined) {
                user.moving = L.marker(e.latlng, {
                    icon: div_icon,
                })
                user.moving.addTo(map)
            } else {
                user.moving.setLatLng(e.latlng)
            }
            // center image in container, but the container has
            // style="margin-left: -6px; margin-top: -6px;"
            moving_icon.style.transform = `translate(6px, 6px) translate(-50%, -50%) rotate(${e.heading}deg)`
            if (user.standing !== undefined) {
                user.standing.removeFrom(map)
                delete user.standing
            }
        }
    })
}

function bounds_in_fragment(map: L.Map): void {
    function stringify_coord(x: number): string {
        return JSON.stringify(L.Util.formatNum(x))
    }

    function stringify_bounds(b: L.LatLngBounds): string {
        const sw = b.getSouthWest()
        const ne = b.getNorthEast()
        return `${stringify_coord(sw.lat)},${stringify_coord(sw.lng)};${stringify_coord(ne.lat)},${stringify_coord(ne.lng)}`
    }

    function parse_latlng(latlng: string): L.LatLng {
        const parts = latlng.split(",")
        if (parts.length != 2) {
            throw new Error(
                `expected "latitude,longitude" not ${JSON.stringify(latlng)}`,
            )
        }
        return L.latLng(JSON.parse(parts[0]), JSON.parse(parts[1]))
    }

    function parse_bounds(bounds: string): L.LatLngBounds {
        const corners = bounds.split(";")
        if (corners.length != 2) {
            throw new Error(
                `expected "corner;corner" not ${JSON.stringify(bounds)}`,
            )
        }
        return L.latLngBounds(
            parse_latlng(corners[0]),
            parse_latlng(corners[1]),
        )
    }

    function on_bounds_change(key: string, values: Array<string>): void {
        if (values.length == 0) {
            return
        }
        map.fitBounds(parse_bounds(values[0]))
    }

    ;["resize", "zoomend", "moveend"].forEach((event) => {
        map.on(event, () =>
            fragment.set("bounds", [stringify_bounds(map.getBounds())]),
        )
    })
    fragment.on("bounds", on_bounds_change)
    on_bounds_change("bounds", fragment.getAll("bounds"))
}

interface NextbikePlace {
    bikes_available_to_rent?: number
    bike_numbers?: Array<string>
    bike_types: { [type: string]: number }
    lat: number
    lng: number
}

interface NextbikeCity {
    places: Array<NextbikePlace>
    bounds: {
        south_west: L.LatLng
        north_east: L.LatLng
    }
}

async function fetch_nextbikes(city_uid: number): Promise<NextbikeCity> {
    const resp = await fetch_dnt(
        "https://maps.nextbike.net/maps/nextbike-live.json?" +
            new URLSearchParams({
                city: String(city_uid),
                domains: "dx",
                list_cities: "0",
                bikes: "0",
            }),
    )
    for (const country of (await resp.json()).countries) {
        for (const city of country.cities) {
            if (city.uid == city_uid) {
                return city
            }
        }
    }
    throw new Error(`cannot find city ${city_uid}`)
}

async function init_map(): Promise<{ map: L.Map; legend_elem: HTMLElement }> {
    const { map_elem, legend_elem } = await new Promise<{
        map_elem: HTMLElement
        legend_elem: HTMLElement
    }>((resolve, reject) => {
        document.addEventListener(
            "DOMContentLoaded",
            () => {
                const map_elem = document.getElementById("map")
                const legend_elem = document.getElementById("legend")
                if (legend_elem === null) {
                    reject(new Error("cannot find #legend"))
                } else if (map_elem === null) {
                    reject(new Error("cannot find #map"))
                } else {
                    resolve({ map_elem, legend_elem })
                }
            },
            { once: true },
        )
    })

    const map = L.map(map_elem)
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
            '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map)
    map.fitBounds(
        // https://de.wikipedia.org/wiki/Geographie_Deutschlands?useskin=vector#Staatsgebiet
        L.latLngBounds(
            L.latLng(47 + 16 / 60 + 15 / 3600, 5 + 52 / 60 + 1 / 3600),
            L.latLng(55 + 3 / 60 + 33 / 3600, 15 + 2 / 60 + 37 / 3600),
        ),
    )
    bounds_in_fragment(map)
    add_user_position(map)
    return { map, legend_elem }
}

const map_initialized = init_map()

function create_hide_layer_checkbox(
    legend_elem: HTMLElement,
    label: Node,
    arg: string,
    callback: (checked: boolean) => void,
): { checked: boolean } {
    const label_elem = legend_elem.appendChild(
        <HTMLElement>(
            document.createElementNS("http://www.w3.org/1999/xhtml", "label")
        ),
    )
    const input = label_elem.appendChild(
        <HTMLInputElement>(
            document.createElementNS("http://www.w3.org/1999/xhtml", "input")
        ),
    )
    label_elem.appendChild(label)

    input.type = "checkbox"
    input.addEventListener("change", () => {
        let hide = fragment.getAll("hide")
        if (input.checked) {
            hide = hide.filter((x) => x != arg)
        } else if (hide.indexOf(arg) < 0) {
            hide.push(arg)
        } else {
            return
        }
        fragment.set("hide", hide)
        callback(input.checked)
    })

    function hide_changed(key: string, values: Array<string>): void {
        input.checked = values.indexOf(arg) < 0
        callback(input.checked)
    }
    fragment.on("hide", hide_changed)
    const hide = fragment.getAll("hide")
    hide_changed("hide", hide)
    return { checked: input.checked }
}

map_initialized.then(({ map, legend_elem }) => {
    const layer_group = add_dvb_stops(map)
    create_hide_layer_checkbox(
        legend_elem,
        document.createTextNode("show DVB stops"),
        "dvb",
        (checked) => {
            if (checked) {
                layer_group.addTo(map)
            } else {
                layer_group.removeFrom(map)
            }
        },
    )
})

Promise.all([map_initialized, fetch_nextbikes(685)]).then(
    ([{ map, legend_elem }, bikes]) => {
        if (fragment.getAll("bounds").length == 0) {
            map.fitBounds(
                L.latLngBounds(
                    bikes.bounds.south_west,
                    bikes.bounds.north_east,
                ),
            )
        }

        const markers = new BoundedMarkerGroup()
        function add_bike(place: NextbikePlace): void {
            if ((place.bike_types["196"] || 0) > 0) {
                const div = document.createElementNS(
                    "http://www.w3.org/1999/xhtml",
                    "div",
                )
                Object.assign(div.style, {
                    "max-height": "50vh",
                    "overflow": "auto",
                })

                // number of bikes
                div.appendChild(
                    document.createElementNS(
                        "http://www.w3.org/1999/xhtml",
                        "p",
                    ),
                )
                    .appendChild(
                        document.createElementNS(
                            "http://www.w3.org/1999/xhtml",
                            "strong",
                        ),
                    )
                    .appendChild(
                        document.createTextNode(
                            `${place.bikes_available_to_rent || 0} bike${place.bikes_available_to_rent == 1 ? "" : "s"} available:`,
                        ),
                    )

                // list of bikes
                const ul = div.appendChild(
                    document.createElementNS(
                        "http://www.w3.org/1999/xhtml",
                        "ul",
                    ),
                )
                ;(place.bike_numbers || []).forEach((bike: string) => {
                    ul.appendChild(
                        document.createElementNS(
                            "http://www.w3.org/1999/xhtml",
                            "li",
                        ),
                    ).appendChild(document.createTextNode(`Bike ${bike}`))
                })

                // raw JSON
                const details = div.appendChild(
                    <HTMLDetailsElement>(
                        document.createElementNS(
                            "http://www.w3.org/1999/xhtml",
                            "details",
                        )
                    ),
                )
                const pre = details.appendChild(
                    document.createElementNS(
                        "http://www.w3.org/1999/xhtml",
                        "pre",
                    ),
                )
                Object.assign(pre.style, {
                    "min-width": "40ch",
                    "white-space": "pre-wrap",
                })
                pre.appendChild(
                    document.createTextNode(JSON.stringify(place, null, 2)),
                )

                const popup = L.popup({
                    content: div,
                })
                // Resize popup when <details> is opened/closed.
                details.addEventListener("toggle", () => {
                    popup.update()
                })

                const marker = L.circleMarker(L.latLng(place.lat, place.lng), {
                    radius: 5,
                    stroke: true,
                    weight: 2,
                    color: "black",
                    fillColor: "#ffcc00",
                    fillOpacity: 1,
                }).bindPopup(popup)

                // Make sure the <details> is closed before popups are opened,
                // so the do not overflow the screen.
                marker.on("popupclose", () => {
                    details.open = false
                })

                markers.add(marker)
            }
        }
        bikes.places.forEach(add_bike)

        function update_markers(): void {
            markers.update_active(map.getBounds())
        }
        ;["resize", "zoomend", "moveend"].forEach((event) =>
            map.on(event, update_markers),
        )
        update_markers()

        create_hide_layer_checkbox(
            legend_elem,
            document.createTextNode("show Nextbikes"),
            "nextbike",
            (checked) => {
                if (checked) {
                    markers.layer_group.addTo(map)
                } else {
                    markers.layer_group.removeFrom(map)
                }
            },
        )

        // periodically update
        setInterval(async () => {
            console.log("refreshing Nextbike locations...")
            const bikes = await fetch_nextbikes(685)
            markers.active.forEach((m) => markers.layer_group.removeLayer(m))
            markers.active = []
            markers.inactive = []
            bikes.places.forEach(add_bike)
            update_markers()
        }, 300_000)
    },
)
