importScripts("https://cdn.jsdelivr.net/pyodide/v0.23.4/pyc/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/1.2.3/dist/wheels/bokeh-3.2.2-py3-none-any.whl', 'https://cdn.holoviz.org/panel/1.2.3/dist/wheels/panel-1.2.3-py3-none-any.whl', 'pyodide-http==0.2.1', 'folium', 'json', 'pandas', 'urllib']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

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
variable_widget = pn.widgets.Select(name="place", value="市役所", options=["市役所", "区役所"])
bound_plot = pn.bind(plot_map, place=variable_widget)
first_app = pn.Column(variable_widget, bound_plot)
first_app.servable()

await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.globals.set('patch', msg.patch)
    self.pyodide.runPythonAsync(`
    state.curdoc.apply_json_patch(patch.to_py(), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.globals.set('location', msg.location)
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads(location)
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()