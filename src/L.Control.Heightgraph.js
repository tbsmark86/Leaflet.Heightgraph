import { select, selectAll, mouse } from 'd3-selection'
import 'd3-selection-multi'
import { scaleLinear } from 'd3-scale'
import { max as d3Max, bisector } from 'd3-array'
import { drag } from 'd3-drag'
import { axisLeft, axisBottom } from 'd3-axis'
import { format } from 'd3-format'
import { symbol, symbolTriangle } from 'd3-shape'
(function (factory, window) {

    // define an AMD module that relies on 'leaflet'
    if (typeof define === 'function' && define.amd) {
        define(['leaflet'], factory);

        // define a Common JS module that relies on 'leaflet'
    } else if (typeof exports === 'object') {
        if (typeof window !== 'undefined' && window.L) {
            module.exports = factory(L);
        } else {
            module.exports = factory(require('leaflet'));
        }
    }

    // attach your plugin to the global 'L' variable
    if (typeof window !== 'undefined' && window.L) {
        window.L.Control.Heightgraph = factory(L);
    }
}(function (L) {
    L.Control.Heightgraph = L.Control.extend({
        options: {
            position: "bottomright",
            width: 800,
            height: 280,
            margins: {
                top: 10,
                right: 30,
                bottom: 55,
                left: 50
            },
            expand: true,
            expandControls: true,
            translation: {},
            expandCallback: undefined,
            xTicks: undefined,
            yTicks: undefined,
            highlightStyle: undefined,
            graphStyle: undefined,
	    palette: {
		    0.0: 'green',
		    0.5: 'yellow',
		    1.0: 'red'
	    },
	    palette_size: 30,
	    palette_minValue: undefined,
	    palette_maxValue: undefined,
	    value2text: (val) => {return val;},
	    extratext: (val) => {return [];}
        },
        _defaultTranslation: {
            distance: "Distance",
            elevation: "Elevation",
            segment_length: "Segment length",
            type: "Type",
            selection: "Current selection",
            selection_dist: "Distance",
            selection_ascend: "Elevation Gain",
            selection_descend: "Elevation Loss",
	    extra0: ' ', // dummy
	    extra1: ' ',
        },
        _init_options() {
            this._margin = this.options.margins;
            this._width = this.options.width;
            this._height = this.options.height;
            this._svgWidth = this._width - this._margin.left - this._margin.right;
            this._svgHeight = this._height - this._margin.top - this._margin.bottom;
            this._highlightStyle = this.options.highlightStyle || { color: 'red' }
            this._graphStyle = this.options.graphStyle || {}
            this._dragCache = {}
	    this.initPalette();
        },
        onAdd(map) {
            let container = this._container = L.DomUtil.create("div", "heightgraph")
            L.DomEvent.disableClickPropagation(container);
            if (this.options.expandControls) {
                let buttonContainer = this._button = L.DomUtil.create('div', "heightgraph-toggle", container);
                const link = L.DomUtil.create("a", "heightgraph-toggle-icon", buttonContainer)
                const closeButton = this._closeButton = L.DomUtil.create("a", "heightgraph-close-icon", container)
            }
            this._showState = false;
            this._initToggle();
            this._init_options();
            // Note: this._svg really contains the <g> inside the <svg>
            this._svg = select(this._container).append("svg").attr("class", "heightgraph-container")
                .attr("width", this._width)
                .attr("height", this._height).append("g")
                .attr("transform", "translate(" + this._margin.left + "," + this._margin.top + ")")
            if (this.options.expand) this._expand();
            return container;
        },
        onRemove(map) {
            this._removeMarkedSegmentsOnMap();
            this._container = null;
            this._svg = undefined;
        },
        /**
         * Add data form source an (re-)draws the actual graph
         * @param {Array<LatLng>} data array of L.latLng objects with extra
	 *	_value to specify the color
	 *	The values _will_ be modified by the lib to contain additional
	 *	helper values.
         */
        addData(data) {
            this._addData(data);
        },
	/**
	 * Sets the palette gradient.
	 * Lifted from leaflet.hotline
	 * @param {Object.<number, string>} palette  - Gradient definition.
	 * e.g. { 0.0: 'white', 1.0: 'black' }
	 *
	 * options.size will limit how colorful the result will be.
	 * Hotline uses 256 but might be better to use a bit lese here.
	 */
	initPalette: function () {
		const palette = this.options.palette
		let size = this.options.palette_size;
		var canvas = document.createElement('canvas'),
				ctx = canvas.getContext('2d'),
				gradient = ctx.createLinearGradient(0, 0, 0, size);

		canvas.width = 1;
		canvas.height = size;

		for (var i in palette) {
			gradient.addColorStop(i, palette[i]);
		}

		ctx.fillStyle = gradient;
		ctx.fillRect(0, 0, 1, size);

		this._palette = ctx.getImageData(0, 0, 1, size).data;
		// If missing prepareData() will fill these from the actual values
		this._palette.min = this.options.palette_minValue;
		this._palette.max = this.options.palette_maxValue;
		this._palette.size = size;

		return this;
	},
	/**
	 * Gets the RGB values of a given z value of the current palette.
	 * Lifted from leaflet.hotline
	 * @param {number} value - Value to get the color for, should be between min and max.
	 * @returns {Array.<number>} The RGB values as an array [r, g, b]
	 */
	getRGBForValue: function (value) {
		const palette = this._palette;
		var valueRelative = Math.min(Math.max((value - palette.min) / (palette.max - palette.min), 0), 0.999);
		var paletteIndex = Math.floor(valueRelative * palette.size) * 4;

		return `rgb(${palette[paletteIndex]},${palette[paletteIndex + 1]},${palette[paletteIndex + 2]})`;
	},
	/**
         * Internal function. Overloads public addData().
         * Call with resize = true when resizing instead of actually adding data.
         * TODO: this should be refactored to avoid calling addData on resize
         * @param data
         * @private
         */
	_addData(data) {
	    if (this._svg !== undefined) {
                this._svg.selectAll("*")
                    .remove();
            }
            this._removeMarkedSegmentsOnMap();
            this._resetDrag(true);

	    this._data = data;
            this._init_options();

	    const drawData = this._prepareData(data);
            this._appendScales();
            this._appendGrid();
	    this._drawData(data, drawData);

	    this._dragRectangleG = this._svg.append("g");
	    this._createFocus();
	    this._appendBackground();
	    this._createHorizontalLine();
	},
	_prepareData(data) {
	    let maxAlt = Number.MIN_SAFE_INTEGER, minAlt = Number.MAX_SAFE_INTEGER;
	    let minValue = Number.MAX_SAFE_INTEGER, maxValue = Number.MIN_SAFE_INTEGER;
	    for(const point of data) {
		if(!isNaN(point.alt)) {
		    maxAlt = Math.max(maxAlt, point.alt);
		    minAlt = Math.min(minAlt, point.alt);
		}
		if(isNaN(point._value)) {
		    // value is required, therefore use default
		    point._value = 0;
		}
		maxValue = Math.max(maxValue, point._value);
		minValue = Math.min(minValue, point._value);
	    }
	    if(this._palette.min === undefined) {
		this._palette.min = minValue;
	    }
	    // not used internally but allowed for external use
	    this._palette.realMin = minValue;
	    if(this._palette.max === undefined) {
		this._palette.max = maxValue;
	    }
	    this._palette.realMax = maxValue;

	    if(maxAlt == Number.MIN_SAFE_INTEGER) {
		maxAlt = 0;
	    }
	    if(minAlt == Number.MAX_SAFE_INTEGER) {
		minAlt = 0;
	    }
	    maxAlt = Math.max(maxAlt, 10);
	    let altitudeRange = maxAlt - minAlt;
	    this._elevationBounds = {min: minAlt, max: maxAlt};
	    /* always add a little head room to the graph */
	    this._elevationBounds.max += Math.max(10, Math.min(0.1 * altitudeRange, 100));
	    if(minAlt > 0) {
		/* bottom room, but avoid going below zero if not required */
		this._elevationBounds.min -= Math.max(10, Math.min(0.1 * altitudeRange, 100));
		this._elevationBounds.min = Math.max(this._elevationBounds.min, 0);
	    }
	    altitudeRange = this._elevationBounds.max - this._elevationBounds.min;
	    // for ease of calculation we normalizes altitude to start at zero
	    // for the actual drawing.
	    const altitudeOffset = this._elevationBounds.min < 0 ? Math.abs(this._elevationBounds.min) : -this._elevationBounds.min;

	    let cumDistance = 0;
	    let lastPoint = null;
	    let pathlist = ['M0 0'];
	    let colors = [];
	    let lastColor = null;
	    for(const point of data) {
		if(lastPoint != null) {
		    cumDistance += lastPoint.distanceTo(point);
		}
		point._position = cumDistance / 1000;
		lastPoint = point;

		// Because svg will translate/transform everything anyway why bother
		// converting it? just just meters for both axes directly ...
		// Possible limits are 32bit for values so avoid tracks longer then
		// 2,147,483 km!
		pathlist.push(`L${cumDistance} ${(point.alt||0)+altitudeOffset}`);

		const pointColor = this.getRGBForValue(point._value);
		if(pointColor != lastColor) {
		    colors.push([cumDistance, pointColor]);
		    lastColor = pointColor;
		}
	    }
            this._totalDistance = cumDistance / 1000;

	    return {altitudeRange, cumDistance, pathlist, colors};
	},
	_drawData(data, prepared) {
	    const {altitudeRange, cumDistance, pathlist, colors} = prepared;
	    this._areapath = this._svg.append('path')
		.attr('class', 'area');

	    if(cumDistance === 0) {
		return;
	    }
	    const gradient = this._svg.append('defs').append('linearGradient')
		.attr('id', 'graph')
		.attr('x1', 0).attr('x2', 1)
		.attr('y1', 0).attr('y2', 0);
	    for(const colorStop of colors) {
		gradient.append('stop')
		    .attr('offset', (colorStop[0]/cumDistance)*100+'%')
		    .attr('stop-color', colorStop[1]);
	    }

	    pathlist.push(`L${cumDistance} 0`);
	    pathlist.push('Z');
	    this._areapath
		.attr('d', pathlist.join(''))
		.attr('stroke', 'green')
		.styles(this._graphStyle)
		.style('fill', 'url(#graph)')
		.style('pointer-events', 'none')
		// Scale our meters into the actual graph
		// Also our altitude values are inverse to svg coordinates so we simply
		// flip everything
		.style('transform', `translate(-1px, ${this._svgHeight}px) scale(${this._svgWidth/cumDistance}, ${this._svgHeight/altitudeRange}) rotateX(180deg)`);
	},
        resize(size) {
            if (size.width)
                this.options.width = size.width;
            if (size.height)
                this.options.height = size.height;

            // Resize the <svg> along with its container
            select(this._container).selectAll("svg")
                .attr("width", this.options.width)
                .attr("height", this.options.height);

            // Re-add the data to redraw the chart.
            this._addData(this._data);
        },
        _initToggle() {
            if (!L.Browser.touch) {
                L.DomEvent.disableClickPropagation(this._container);
            } else {
                L.DomEvent.on(this._container, 'click', L.DomEvent.stopPropagation);
            }
            if (this.options.expandControls) {
                L.DomEvent.on(this._button, 'click', this._expand, this);
                L.DomEvent.on(this._closeButton, 'click', this._expand, this);
            }
        },
        _dragHandler() {
            //we don´t want map events to occur here
            if (typeof event !== 'undefined') {
                event.preventDefault();
                event.stopPropagation();
            }
            this._gotDragged = true;
            this._drawDragRectangle();
        },
        /**
         * Draws the currently dragged rectangle over the chart.
         */
        _drawDragRectangle() {
            if (!this._dragStartCoords) {
                return;
            }
            const dragEndCoords = this._dragCurrentCoords = this._dragCache.end = mouse(this._background.node())
            const x1 = Math.min(this._dragStartCoords[0], dragEndCoords[0]),
                x2 = Math.max(this._dragStartCoords[0], dragEndCoords[0])
            if (!this._dragRectangle) {
                this._dragRectangle = this._dragRectangleG.append("rect")
                    .attr("width", x2 - x1)
                    .attr("height", this._svgHeight)
                    .attr("x", x1)
                    .attr('class', 'mouse-drag')
                    .style("fill", "grey")
                    .style("opacity", 0.5)
                    .style("pointer-events", "none");
            } else {
                this._dragRectangle.attr("width", x2 - x1)
                    .attr("x", x1);
            }
        },
        /**
         * Removes the drag rectangle
         * @param {boolean} skipMapFitBounds - whether to zoom the map back to the total extent of the data
         */
        _resetDrag(skipMapFitBounds) {
            if (this._dragRectangle) {
                this._dragRectangle.remove();
                this._dragRectangle = null;

                if (skipMapFitBounds !== true) {
                    // potential performance improvement:
                    // we could cache the full extend when addData() is called
                    let fullExtent = this._calculateFullExtent(this._data);
                    if (fullExtent) this._map.fitBounds(fullExtent);
	            this._focusHideSelection();
                }
            }
        },
        /**
         * Handles end of drag operations. Zooms the map to the selected items extent.
         */
        _dragEndHandler() {
            if (!this._dragStartCoords || !this._gotDragged) {
                this._dragStartCoords = null;
                this._gotDragged = false;
                this._resetDrag();
                return;
            }
            const item1 = this._findItemForX(this._dragStartCoords[0]),
                item2 = this._findItemForX(this._dragCurrentCoords[0])
            this._fitSection(item1, item2);
            this._dragStartCoords = null;
            this._gotDragged = false;
        },
        _dragStartHandler() {
            event.preventDefault();
            event.stopPropagation();
            this._gotDragged = false;
            this._dragStartCoords = this._dragCache.start = mouse(this._background.node());
        },
        /*
         * Calculates the full extent of the data array
         */
        _calculateFullExtent(data) {
            if (!data || data.length < 1) {
                return null;
            }
            let full_extent = new L.latLngBounds(data[0], data[0]);
            data.forEach((item) => {
                if (!full_extent.contains(item)) {
                    full_extent.extend(item);
                }
            });
            return full_extent;
        },
        /**
         * Make the map fit the route section between given indexes.
         */
        _fitSection(index1, index2) {
            const start = Math.min(index1, index2), end = Math.max(index1, index2)
            let ext
            if (start !== end) {
                ext = this._calculateFullExtent(this._data.slice(start, end + 1));
            } else if (this._data.length > 0) {
                ext = [this._data[start], this._data[end]];
            }
            if (ext) this._map.fitBounds(ext);
        },
        /**
         * Expand container when button clicked and shrink when close-Button clicked
         */
        _expand() {
            if (this.options.expandControls !== true) {
                // always expand, never collapse
                this._showState = false;
            }
            if (!this._showState) {
                select(this._button)
                    .style("display", "none");
                select(this._container)
                    .selectAll('svg')
                    .style("display", "block");
                select(this._closeButton)
                    .style("display", "block");
            } else {
                select(this._button)
                    .style("display", "block");
                select(this._container)
                    .selectAll('svg')
                    .style("display", "none");
                select(this._closeButton)
                    .style("display", "none");
            }
            this._showState = !this._showState;
            if (typeof this.options.expandCallback === "function") {
                this.options.expandCallback(this._showState);
            }
        },
        /**
         * Creates a marker on the map while hovering
         * @param {Object} ll: actual coordinates of the route
         * @param {*} height: height as float or undefined text
         * @param {string} type: type of element
         */
        _showMapMarker(ll, height, type) {
            const layerPoint = this._map.latLngToLayerPoint(ll)
            const normalizedY = layerPoint.y - 75
            if (!this._mouseHeightFocus) {
		const svg = L.svg({pane: 'tooltipPane'}).addTo(this._map);
		const heightG = select(svg._container).append("g");
		svg._container.style.pointerEvents = 'none';
                this._mouseHeightFocus = heightG.append('svg:line')
                    .attr('class', 'height-focus line')
                    .attr('x2', '0')
                    .attr('y2', '0')
                    .attr('x1', '0')
                    .attr('y1', '0');
                this._mouseHeightFocusLabel = heightG.append("g")
                    .attr('class', 'height-focus label');
                this._mouseHeightFocusLabelRect = this._mouseHeightFocusLabel.append("rect")
                    .attr('class', 'bBox');
                this._mouseHeightFocusLabelTextElev = this._mouseHeightFocusLabel.append("text")
                    .attr('class', 'tspan');
                this._mouseHeightFocusLabelTextType = this._mouseHeightFocusLabel.append("text")
                    .attr('class', 'tspan');
                const pointG = this._pointG = heightG.append("g").attr("class", "height-focus circle")
                pointG.append("svg:circle")
                    .attr("r", 5)
                    .attr("cx", 0)
                    .attr("cy", 0)
                    .attr("class", "height-focus circle-lower");
            }
            this._mouseHeightFocusLabel.style("display", "block");
            this._mouseHeightFocus.attr("x1", layerPoint.x)
                .attr("x2", layerPoint.x)
                .attr("y1", layerPoint.y)
                .attr("y2", normalizedY)
                .style("display", "block");
            this._pointG.attr("transform", "translate(" + layerPoint.x + "," + layerPoint.y + ")")
                .style("display", "block");
            this._mouseHeightFocusLabelRect.attr("x", layerPoint.x + 3)
                .attr("y", normalizedY)
                .attr("class", 'bBox');
            this._mouseHeightFocusLabelTextElev.attr("x", layerPoint.x + 5)
                .attr("y", normalizedY + 12)
                .text(height + " m")
                .attr("class", "tspan mouse-height-box-text");
            this._mouseHeightFocusLabelTextType.attr("x", layerPoint.x + 5)
                .attr("y", normalizedY + 24)
                .text(type)
                .attr("class", "tspan mouse-height-box-text");
            const maxWidth = this._dynamicBoxSize("text.tspan")[1]
            // box size should change for profile none (no type)
            const maxHeight = (type === "") ? 12 + 6 : 2 * 12 + 6
            selectAll('.bBox')
                .attr("width", maxWidth + 10)
                .attr("height", maxHeight);
        },
	_focusTextDistance: 15,
        /**
         *  Creates focus Line and focus box while hovering
         */
        _createFocus() {
            const boxPosition = this._elevationBounds.min
            if (this._focus) {
                this._focus.remove();
                this._focusLineGroup.remove();
            }
            this._focus = this._svg.append("g")
                .attr("class", "focusbox");
            // background box
            this._focusRect = this._focus.append("rect")
                .attr("x", 3)
                .attr("y", -this._y(boxPosition))
                .attr("display", "none");

	    this._focusLines = {};
	    this._focusSpans = {};
	    let cnt = 1;
	    for(const name of ['distance', 'elevation', 'segment_length', 'type',
		'selection', 'selection_dist', 'selection_ascend', 'selection_descend',
		'extra0', 'extra1'
	    ]) {
		this._focusLines[name] = this._focus.append('text')
		    .attr('x', 7)
		    .attr('y', -this._y(boxPosition) + (cnt * this._focusTextDistance))
		    .attr('id', `heightgraph.${name}`);
		this._focusLines[name].append('tspan')
		    .text(this._getTranslation(name) + ':');
		this._focusSpans[name] = this._focusLines[name].append('tspan')
		    .attr('class', 'tspan');
		cnt++;
	    }
	    const height = this._dynamicBoxSize(".focusbox text")[0];
            selectAll('.focusbox rect')
                .attr("height", height * this._focusTextDistance + (this._focusTextDistance / 2))
                .attr("display", "block");
            this._focusLineGroup = this._svg.append("g")
                .attr("class", "focusLine");
            this._focusLine = this._focusLineGroup.append("line")
                .attr("y1", 0)
                .attr("y2", this._y(this._elevationBounds.min));
        },
	_focusShowSelection() {
	    this._focusLines.selection.style('display', 'block');
	    this._focusLines.selection_dist.style('display', 'block');
	    this._focusLines.selection_ascend.style('display', 'block');
	    this._focusLines.selection_descend.style('display', 'block');
	},
        _focusHideSelection() {
	    this._focusLines.selection.style('display', 'none');
	    this._focusLines.selection_dist.style('display', 'none');
	    this._focusLines.selection_ascend.style('display', 'none');
	    this._focusLines.selection_descend.style('display', 'none');
	},
        /**
         *  Creates horizontal Line for dragging
         */
        _createHorizontalLine() {
            const self = this
            this._horizontalLine = this._svg.append("line")
                .attr("class", "horizontalLine")
                .attr("x1", 0)
                .attr("x2", this._width - this._margin.left - this._margin.right)
                .attr("y1", this._y(this._elevationBounds.min))
                .attr("y2", this._y(this._elevationBounds.min))
                .style("stroke", "black");
            this._elevationValueText = this._svg.append("text")
                .attr("class", "horizontalLineText")
                .attr("x", this._width - this._margin.left - this._margin.right - 20)
                .attr("y", this._y(this._elevationBounds.min) - 10)
                .attr("fill", "black");
            //triangle symbol as controller
            const jsonTriangle = [
                {
                    "x": this._width - this._margin.left - this._margin.right + 7,
                    "y": this._y(this._elevationBounds.min),
                    "color": "black",
                    "type": symbolTriangle,
                    "angle": -90,
                    "size": 100
                }
            ]
            const dragstart = function (d) {
                select(this).raise().classed("active", true)
                select(".horizontalLine").raise().classed("active", true)
            }

            const dragged = function (d) {
                const maxY = self._svgHeight
                let eventY = mouse(self._container)[1] - 10
                select(this)
                    .attr("transform", d => "translate(" + d.x + "," + (eventY < 0 ? 0
                        : eventY > maxY ? maxY
                            : eventY) + ") rotate(" + d.angle + ")");
                select(".horizontalLine")
                    .attr("y1", (eventY < 0 ? 0 : (eventY > maxY ? maxY : eventY)))
                    .attr("y2", (eventY < 0 ? 0 : (eventY > maxY ? maxY : eventY)));
                if (eventY >= maxY) {
                    self._highlightedCoords = [];
                } else {
                    self._highlightedCoords = self._findCoordsForY(eventY);
                }
                select(".horizontalLineText")
                    .attr("y", (eventY <= 10 ? 0 : (eventY > maxY ? maxY - 10 : eventY - 10)))
                    .text(format(".0f")(self._y.invert((eventY < 0 ? 0 : (eventY > maxY ? maxY : eventY)))) + " m");
                self._removeMarkedSegmentsOnMap();
                self._markSegmentsOnMap(self._highlightedCoords);
            }

            const dragend = function (d) {
                select(this)
                    .classed("active", false);
                select(".horizontalLine")
                    .classed("active", false);
                self._removeMarkedSegmentsOnMap();
                self._markSegmentsOnMap(self._highlightedCoords);
            }

            const horizontalDrag = this._svg.selectAll(".horizontal-symbol").data(jsonTriangle).enter().append("path").
                attr("class", "lineSelection")
                .attr("d", symbol().type(d => d.type).size(d => d.size))
                .attr("transform", d => "translate(" + d.x + "," + d.y + ") rotate(" + d.angle + ")")
                .attr("id", d => d.id)
                .style("fill", d => d.color)
                .call(drag().on("start", dragstart).on("drag", dragged).on("end", dragend))
        },
        /**
         * Highlights segments on the map above given elevation value
         */
        _markSegmentsOnMap(coords) {
            if (coords) {
                if (coords.length > 1) {
                    // some other leaflet plugins can't deal with multi-Polylines very well
                    // therefore multiple single polylines are used here
                    this._markedSegments = L.featureGroup()
                    for (let linePart of coords) {
                        L.polyline(
                            linePart,
                            { ...this._highlightStyle, ...{ interactive: false } }
                        ).addTo(this._markedSegments)
                    }
                    this._markedSegments.addTo(this._map)
                        .bringToFront()
                } else {
                    this._markedSegments = L.polyline(coords, this._highlightStyle).addTo(this._map);
                }
            }
        },
        /**
         * Remove the highlighted segments from the map
         */
        _removeMarkedSegmentsOnMap() {
            if (this._markedSegments !== undefined) {
                this._map.removeLayer(this._markedSegments);
            }
        },
        /**
         * Defines the ranges and format of x- and y- scales and appends them
         */
        _appendScales() {
            const shortDist = Boolean(this._totalDistance <= 10)
            this._x = scaleLinear()
                .range([0, this._svgWidth]);
            this._y = scaleLinear()
                .range([this._svgHeight, 0]);
            this._x.domain([0, this._totalDistance]);
            this._y.domain([this._elevationBounds.min, this._elevationBounds.max]);
            this._xAxis = axisBottom()
                .scale(this._x)
            if (shortDist === true) {
                this._xAxis.tickFormat(d => format(".2f")(d) + " km");
            } else {
                this._xAxis.tickFormat(d => format(".0f")(d) + " km");
            }
            this._xAxis.ticks(this.options.xTicks ? Math.pow(2, this.options.xTicks) : Math.round(this._svgWidth / 75), "s");
            this._yAxis = axisLeft()
                .scale(this._y)
                .tickFormat(d => d + " m");
            this._yAxis.ticks(this.options.yTicks ? Math.pow(2, this.options.yTicks) : Math.round(this._svgHeight / 30), "s");
        },
        /**
         * Appends a background and adds mouse handlers
         */
        _appendBackground() {
            const background = this._background = select(this._container)
                .select("svg")
                .select("g")
                .append("rect")
                .attr("width", this._svgWidth)
                .attr("height", this._svgHeight)
                .style("fill", "none")
                .style("stroke", "none")
                .style("pointer-events", "all")
                .on("mousemove.focusbox", this._mousemoveHandler.bind(this))
                .on("mouseout.focusbox", this._mouseoutHandler.bind(this))
            if (L.Browser.android) {
                background.on("touchstart.drag", this._dragHandler.bind(this))
                    .on("touchstart.drag", this._dragStartHandler.bind(this))
                    .on("touchstart.focusbox", this._mousemoveHandler.bind(this));
                L.DomEvent.on(this._container, 'touchend', this._dragEndHandler, this);
            } else {
                background.on("mousemove.focusbox", this._mousemoveHandler.bind(this))
                    .on("mouseout.focusbox", this._mouseoutHandler.bind(this))
                    .on("mousedown.drag", this._dragStartHandler.bind(this))
                    .on("mousemove.drag", this._dragHandler.bind(this));
                L.DomEvent.on(this._container, 'mouseup', this._dragEndHandler, this);
            }
        },
        /**
         * Appends a grid to the graph
         */
        _appendGrid() {
            this._svg.append("g")
                .attr("class", "grid")
                .attr("transform", "translate(0," + this._svgHeight + ")")
                .call(this._make_x_axis()
                    .tickSize(-this._svgHeight, 0, 0)
                    .ticks(Math.round(this._svgWidth / 75))
                    .tickFormat(""));
            this._svg.append("g")
                .attr("class", "grid")
                .call(this._make_y_axis()
                    .tickSize(-this._svgWidth, 0, 0)
                    .ticks(Math.round(this._svgHeight / 30))
                    .tickFormat(""));
            this._svg.append('g')
                .attr("transform", "translate(0," + this._svgHeight + ")")
                .attr('class', 'x axis')
                .call(this._xAxis);
            this._svg.append('g')
                .attr("transform", "translate(-2,0)")
                .attr('class', 'y axis')
                .call(this._yAxis);
        },
        /**
         * Returns if the given data element is defined, in order to handle missing
         * elevation values and show them as gap. Implements a d3 defined accessor
         * that can be passed to area/line.defined.
         * @param {*} d data element
         * @return {boolean} true, if elevation value is defined, false otherwise
         */
        _defined(d) {
            return d && d.alt !== undefined && d.alt !== null;
        },
        // grid lines in x axis function
        _make_x_axis() {
            return axisBottom()
                .scale(this._x);
        },
        // grid lines in y axis function
        _make_y_axis() {
            return axisLeft()
                .scale(this._y);
        },
	/**
         * calculates the margins of boxes
         * @param {String} className: name of the class
         * @return {array} borders: number of text lines, widest range of text
         */
        _dynamicBoxSize(className) {
            const cnt = selectAll(className).nodes().length
            const widths = []
            for (let i = 0; i < cnt; i++) {
                widths.push(selectAll(className)
                    .nodes()[i].getBoundingClientRect()
                    .width);
            }
            const maxWidth = d3Max(widths)
            return [cnt, maxWidth];
        },
        /*
         * Handles the mouseout event when the mouse leaves the background
         */
        _mouseoutHandler() {
            for (let param of ['_focusLine', '_focus', '_pointG', '_mouseHeightFocus', '_mouseHeightFocusLabel'])
                if (this[param]) {
                    this[param].style('display', 'none');
                }
        },
        /*
         * Handles the mouseout event and clears the current point info.
         * @param {int} delay - time before markers are removed in milliseconds
         */
        mapMouseoutHandler(delay = 1000) {
            if (this.mouseoutDelay) {
                window.clearTimeout(this.mouseoutDelay)
            }
            this.mouseoutDelay = window.setTimeout(() => {
                this._mouseoutHandler();
            }, delay)
        },
        /*
         * Handles the mouseover the map and displays distance and altitude level.
         * Since this does a lookup of the point on the graph
         * the closest to the given latlng on the provided event, it could be slow.
         */
        mapMousemoveHandler(event, { showMapMarker: showMapMarker = true } = {}) {
            if (!this._data.length) {
                return;
            }
            // initialize the vars for the closest item calculation
            let closestItem = null;
            let closestItemIx = -1;
            // large enough to be trumped by any point on the chart
            let closestDistance = 2 * Math.pow(100, 2);
            // consider a good enough match if the given point (lat and lng) is within
            // 1.1 meters of a point on the chart (there are 111,111 meters in a degree)
            const exactMatchRounding = 1.1 / 111111;
            // In order to ease cumulated calculations, we pass the index as well as the item
            // to the mouse handler.
	    var ix = 0; 
            for (const item of this._data) {
                let latDiff = event.latlng.lat - item.lat;
                let lngDiff = event.latlng.lng - item.lng;
                // first check for an almost exact match; it's simple and avoid further calculations
                if (Math.abs(latDiff) < exactMatchRounding && Math.abs(lngDiff) < exactMatchRounding) {
                    this._internalMousemoveHandler(item, ix, showMapMarker);
                    break;
                }
                // calculate the squared distance from the current to the given;
                // it's the squared distance, to avoid the expensive square root
                const distance = Math.pow(latDiff, 2) + Math.pow(lngDiff, 2);
                if (distance < closestDistance) {
                    closestItem = item;
                    closestItemIx = ix;
                    closestDistance = distance;
                }
		ix++;
            }

            if (closestItem) this._internalMousemoveHandler(closestItem, closestItemIx, showMapMarker);
        },
        /*
         * Handles the mouseover the chart and displays distance and altitude level
         */
        _mousemoveHandler(d, i, ctx) {
            const coords = mouse(this._svg.node())
            const ix = this._findItemForX(coords[0]);
            const item = this._data[ix];
            if (item) this._internalMousemoveHandler(item, ix);
        },
        /*
         * Handles the mouseover, given the current item the mouse is over
         */
        _internalMousemoveHandler(point, ix, showMapMarker = true) {
            const alt = this._defined(point) ? point.alt : '-', 
		dist = point._position;
	    const type = this.options.value2text(point._value);
	    const extra = this.options.extratext(point);
            const boxWidth = this._dynamicBoxSize(".focusbox text")[1] + 10
            if (showMapMarker) {
                this._showMapMarker(point, alt, type);
            }
	    let lines = 4;
            // If the user has selected an area, show the cumulated values
            if (this._dragStartCoords) {
              let ix1 = this._findItemForX(this._dragStartCoords[0]);
              let [dst, ascend, descend] = this._cumulatedValues(ix1, ix);
	      this._focusShowSelection();
	      lines += 4;
              this._focusSpans.selection_ascend.text(" " + ascend.toFixed(1) + " m");
              this._focusSpans.selection_descend.text(" " + descend.toFixed(1)+ " m");
              this._focusSpans.selection_dist.text(" " + (dst/1000.0).toFixed(1) + " km");
            // If the area has been removed, hide them again.
            } else if (!this._dragRectangle){
	      this._focusHideSelection();
            } else {
	      lines += 4;
	    }
            this._focusSpans.distance.text(" " + dist.toFixed(1) + ' km');
            this._focusSpans.elevation.text(" " + alt + ' m');
            this._focusSpans.segment_length.text(` ${this._getLengthSameValue(ix).toFixed(1)} km`);
            this._focusSpans.type.text(" " + type);

	    let cnt = 0;
	    for(const t of extra) {
		lines++;

		if(cnt > 1) {
		    throw new Error('To many extra values!');
		}
		this._focusLines[`extra${cnt}`].style('display', 'block')
		    .attr('y', -this._y(this._elevationBounds.min) + (lines * this._focusTextDistance))
		    .select('tspan:first-child').text(t[0] + ':');
		this._focusSpans[`extra${cnt}`].text(' ' + t[1]);
		cnt++;
	    }
	    while(cnt < 2) {
		this._focusLines[`extra${cnt}`].style('display', 'none');
		cnt++;
	    }

            this._focusRect.attr("width", boxWidth);
            this._focusLine.style("display", "block")
                .attr('x1', this._x(dist))
                .attr('x2', this._x(dist));
            const xPositionBox = this._x(dist) - (boxWidth + 5)
            const totalWidth = this._width - this._margin.left - this._margin.right
            if (this._x(dist) + boxWidth < totalWidth) {
                this._focus.style("display", "initial")
                    .attr("transform", "translate(" + this._x(dist) + "," + this._y(this._elevationBounds.min) + ")");
            }
            if (this._x(dist) + boxWidth > totalWidth) {
                this._focus.style("display", "initial")
                    .attr("transform", "translate(" + xPositionBox + "," + this._y(this._elevationBounds.min) + ")");
            }
	    this._focusRect.attr('height', lines * this._focusTextDistance + 5);
        },
        _cumulatedValues(ix1, ix2) {
           // To avoid unneccessary recalculations for minimal changes, the previous calculation is returned
           // if the previous calculation is less than 300ms old, and if the selection has changed by less than 5 segments.
           if (this._prev_cumulation) {
             if ((Math.abs(this._prev_cumulation[0] - Math.abs(ix1-ix2)) < 5) && (Date.now()-this._prev_cumulation[1] < 300)) {
               return this._prev_cumulation[2];
             }
           }
           let prev = null;
           let dst = 0.0;
           let ascend = 0.0;
           let descend = 0.0;
           // Cumulated height difference over a short segment
           let delta_hd = 0.0;
           // Cumulated distance for the short segment
           let delta_dst = 0.0;
           for (let ix = Math.min(ix1, ix2); ix <= Math.max(ix1, ix2); ix++) {
             let item = this._data[ix];
             if (!prev){
               prev = item;
               continue;
             }
             let single_dst = prev.distanceTo(item);
             // 
             delta_dst += single_dst;
             dst += single_dst;
             let hdiff = item.alt - prev.alt;
             delta_hd += hdiff;
             let abs_hd = Math.abs(delta_hd);
             prev = item;
             // To correct for small fluctuations, only absolute height differences of 10 meters or more are 
             // taken into account. If the distance is too small (<12m), only height differences of 15 meters or more
             // are taken into account.
             if (((delta_dst < 12) && (abs_hd < 15)) || (abs_hd < 10)) {
               continue;
             }
             if (delta_hd > 0) {
               ascend += delta_hd;
             } else {
               descend += -delta_hd;
             }
             delta_hd = 0.0;
             delta_dst = 0.0;
           }
           // Finally, add the rest.
           if (delta_hd > 0) {
             ascend += delta_hd;
           } else {
             descend += -delta_hd;
           }
           let vals = [dst, ascend, descend];
           this._prev_cumulation = [Math.abs(ix1-ix2), Date.now(), vals];
           return vals;
        },
	/* Looking at some index pos into the data sum up the length with
	 * the same value e.g. length with same incline and therefore color */
	_getLengthSameValue(pos) {
	    const point = this._data[pos];
	    let start = point._position, end = point._position;
	    const val = point._value;
	    for(let i = pos; i >= 0 && this._data[i]._value === val; i--) {
		start = this._data[i]._position;
	    }
	    for(let i = pos; i < this._data.length && this._data[i]._value === val; i++) {
		end = this._data[i]._position;
	    }
	    return end - start;
	},
        /*
         * Finds a data entry for a given x-coordinate of the diagram
         */
        _findItemForX(x) {
            const bisect = bisector(d => d._position).left
            const xInvert = this._x.invert(x)
            return bisect(this._data, xInvert);
        },
        /*
         * Finds data entries above a given y-elevation value and returns geo-coordinates
         */
        _findCoordsForY(y) {
            let bisect = (b, yInvert) => {
                //save indexes of elevation values above the horizontal line
                const list = []
                for (let i = 0; i < b.length; i++) {
                    if (b[i].alt >= yInvert) {
                        list.push(i);
                    }
                }
                //split index list into coherent blocks of coordinates
                const newList = []
                let start = 0
                for (let j = 0; j < list.length - 1; j++) {
                    if (list[j + 1] !== list[j] + 1) {
                        newList.push(list.slice(start, j + 1));
                        start = j + 1;
                    }
                }
                newList.push(list.slice(start, list.length));
                //get lat lon coordinates based on indexes
                for (let k = 0; k < newList.length; k++) {
                    for (let l = 0; l < newList[k].length; l++) {
                        newList[k][l] = b[newList[k][l]];
                    }
                }
                return newList;
            }

            const yInvert = this._y.invert(y)
            return bisect(this._data, yInvert);
        },
        /*
         * Checks the user passed translations, if they don't exist, fallback to the default translations
         */
        _getTranslation(key) {
            if (this.options.translation[key])
                return this.options.translation[key];
            if (this._defaultTranslation[key])
                return this._defaultTranslation[key];
            console.error("Unexpected error when looking up the translation for " + key);
            return 'No translation found';
        }
    });
    L.control.heightgraph = function (options) {
        return new L.Control.Heightgraph(options)
    }

    return L.Control.Heightgraph
}, window))
