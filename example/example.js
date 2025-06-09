const onRoute = event => {
    hg.mapMousemoveHandler(event, {showMapMarker:false})
}
const outRoute = event => {
    hg.mapMouseoutHandler(2000)
}
function convertGeoJson(geo) {
    // specific for this demo!
    let res = [];
    if(!geo[0]) {
	return res;
    }
    for(const feature of geo[0].features) {
	const value = feature.properties.attributeType;
	for(const coords of feature.geometry.coordinates) {
	    const newval = L.latLng(coords[1], coords[0], coords[2]);
	    newval._value = value;
	    res.push(newval);
	}
    }
    return res;
}

const changeData = setNumber => {
    let dataSet = setNumber === '1' ? geojson1 : setNumber === '2' ? geojson2 : setNumber === '3' ? geojson3 : []
    displayGroup.clearLayers()
    if (dataSet.length !== 0) {
        let newLayer = L.geoJson(dataSet)
        newLayer.on({
            'mousemove': onRoute,
            'mouseout': outRoute,
        })
        let newBounds = newLayer.getBounds()
        displayGroup.addLayer(newLayer)
        map.fitBounds(newBounds)
    }
    hg.addData(convertGeoJson(dataSet))
}
const map = new L.Map('map')

const url = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attr = "Map data © <a href=\"https://openstreetmap.org\">OpenStreetMap</a> contributors"

const openstreetmap = L.tileLayer(url, {
    id: "openstreetmap",
    attribution: attr
})

const displayGroup = new L.LayerGroup()
displayGroup.addTo(map)

const bounds = new L.LatLngBounds(new L.LatLng(47.323989, 8.108683), new L.LatLng(46.96485, 8.029803))

const hg = L.control.heightgraph({
    graphStyle: {
        opacity: 0.8,
        'fill-opacity': 0.5,
        'stroke-width': '2px'
    },
    palette: {
	0.0: '#0000ff', // blue
	0.25: '#00ffff', // cyan
	0.5: '#00ff00', // green
	0.75: '#ffff00', // yellow
	1.0: '#ff0000', // red
    },
    translation: {
        distance: "My custom distance"
    },
    expandCallback(expand) {
        console.log("Expand: "+expand)
    },
    expandControls: true,
    highlightStyle: {
        color: "purple"
    }
})

hg.addTo(map)

hg.addData(convertGeoJson(geojson1))

L.geoJson(geojson1)
    .on({
        'mousemove': onRoute,
        'mouseout': outRoute,
    })
    .addTo(displayGroup)

map.addLayer(openstreetmap).fitBounds(bounds)

hg.resize({width:1000,height:300})
