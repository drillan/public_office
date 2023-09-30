import json
from urllib import parse, request

import pandas as pd
import panel as pn

import folium


def _get_locations(
    path: str = "/address-search/AddressSearch",
    query: dict[str, str] = {},
) -> list:
    url = parse.urlunparse(
        (
            "https",
            "msearch.gsi.go.jp",
            path,
            None,
            parse.urlencode(query),
            None,
        )
    )
    res = request.urlopen(url)
    return json.loads(res.read().decode())


def get_locations(q: str) -> list:
    return _get_locations(query={"q": q})


def plot_map(place: str):
    locations = get_locations(place)
    centor = pd.DataFrame(
        [loc["geometry"]["coordinates"] for loc in locations], columns=["lon", "lat"]
    ).mean()
    m = folium.Map(location=(centor["lat"], centor["lon"]), zoom_start=8, height=600)
    folium_pane = pn.pane.plot.Folium(m, width=800, height=600)
    for loc in locations:
        lon, lat = loc["geometry"]["coordinates"]
        folium.Marker(location=(lat, lon), tooltip=loc["properties"]).add_to(m)
    folium_pane.object = m
    return folium_pane


pn.extension(sizing_mode="stretch_width")
variable_widget = pn.widgets.Select(name="place", value="市役所", options=["市役所", "区役所", "県庁"])
bound_plot = pn.bind(plot_map, place=variable_widget)
first_app = pn.Column(variable_widget, bound_plot)
first_app.servable()