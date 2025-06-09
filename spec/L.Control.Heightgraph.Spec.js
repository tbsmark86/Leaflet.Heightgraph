import {select} from 'd3-selection'
describe('L.Control.Heightgraph', () => {
    let hg, data;
    beforeEach(() => {
        hg = new L.control.heightgraph({
         width: 800,
         height: 280,
         margins: {
             top: 10,
             right: 30,
             bottom: 55,
             left: 50
         },
         position: "bottomright",
         mappings: undefined
     });
        hg._margin = {
                top: 20,
                right: 50,
                bottom: 25,
                left: 50
        }
        hg._container = L.DomUtil.create('div', 'heightgraph');
        hg._svg = select(hg._container)
            .append("svg")
            .attr("class", "heightgraph-container")
            .attr("width", 100)
            .attr("height", 100)
            .append("g")
            .attr("transform", "translate(" + 100 + "," + 100 + ")");
        data = [
	    // 0
	    L.latLng(8.109849, 47.320243, 453.1),
	    L.latLng(8.110078, 47.319857, 454.3),
	    L.latLng(8.11022, 47.319656, 455),
            // 3
	    L.latLng(8.110281, 47.319694, 455.3),
            L.latLng(8.110383, 47.319714, 455.7),
	    L.latLng(8.111643, 47.319786, 456.3)
        ];
	data.forEach((ele, idx) => {
	    ele._value = idx > 2 ? 3 : 0;
	})
	console.log(data);
        hg.addData(data);
    });
    it('reads data of data correctly', () => {
        expect(hg._data).toEqual(data);
    });
    it('gathers correct stats', () => {
        expect(hg._palette.min).toEqual(0);
        expect(hg._palette.max).toEqual(3);
        expect(hg._elevationBounds.min).toEqual(443.1);
        expect(hg._elevationBounds.max).toEqual(466.3);
    });
    it('reads coordinates of data correctly', () => {
	const div = hg._container;
        expect(div.querySelector('.area[d]').getAttribute('d')).toEqual('M0 0L0 10L49.53752402979564 11.199999999999989L76.72028656317882 11.899999999999977L84.68937174969591 12.199999999999989L96.24296800837863 12.599999999999966L236.57258678455906 13.199999999999989L236.57258678455906 0Z');
    });
});

describe('L.Control.Heightgraph', () => {
    let hg;
    
    function ctx(element, attributeName) {
        let s = element.tagName;
        if (element.classList.length > 0) {
            s += '.' + element.classList.value;
        }
        s += '[' + attributeName + ']';
        return s;
    }

    beforeEach(() => {
	let data = [
	    L.latLng(8.109849, 47.320243),
	    L.latLng(8.110078, 47.319857),
	    L.latLng(8.11022, 47.319656),
        ];
	data.forEach((ele, idx) => {
	    ele._value =  0;
	})


        hg = L.control.heightgraph();
        hg.onAdd();
        hg.addData(data);
        hg._background.style("pointer-events", "none");
        // uncomment to render on test page
        //document.body.appendChild(hg._container);
    });

    it('handles missing elevation values', () => {
	expect(hg._palette.min).toEqual(0);
        expect(hg._palette.max).toEqual(0);
        expect(hg._elevationBounds.min).toEqual(0);
        expect(hg._elevationBounds.max).toEqual(20);

	const div = hg._container;
        expect(div.querySelector('.area[d]').getAttribute('d')).toEqual('M0 0L0 0L49.53752402979564 0L76.72028656317882 0L76.72028656317882 0Z');
    });
});
