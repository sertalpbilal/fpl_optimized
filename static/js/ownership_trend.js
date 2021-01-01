var app = new Vue({
    el: '#app',
    data: {
        is_ready: false,
        season: season,
        gw: gw,
        next_gw: next_gw,
        date: date,
        listdates: listdates,
        element_now: {},
        element_history: [],
        last_gw_all: {},
        sample_data: {},
        estimation: {},
        table: ""
    },
    methods: {
        save_gw_data(data, name, season, gw, date) {
            if (name == "now") {
                this.element_now = { 'season': season, 'gw': gw, 'date': date, 'values': data };
            }
            this.element_history.push({ 'season': season, 'gw': gw, 'date': date, 'values': data });
        },
        saveSampleDataAndInit(success, data) {
            if (success) {
                this.sample_data = data;
            }
            this.prepareLastGW();
            this.prepareEstimation();
            this.is_ready = true;
            this.$nextTick(() => {
                this.table = $("#trend_table").DataTable({
                    "order": [2],
                    info: false,
                    scrollX: true,
                    paging: false,
                    scrollY: "400px",
                    scrollCollapse: true,
                    fixedColumns: true,
                    lengthChange: false,
                    "processing": true,
                    buttons: [
                        'copy', 'csv'
                    ],
                    //dom: 'Bfrtip'
                });
                this.table.buttons().container()
                    .appendTo('.col-md-6:eq(0)');
                // new $.fn.dataTable.FixedHeader(this.table);
                draw_ownership_plot();
                $("#loading_box").remove();

            })
        },
        prepareLastGW() {
            let vals = this.sample_data[1000].filter(i => i.team !== undefined);
            let players = _.cloneDeep(this.element_now.values);

            let all_players = vals.map(i => i.data.picks).flat().filter(i => i.multiplier > 0).map(i => i.element);
            players.forEach(function(val, idx) {
                let cnt = all_players.filter(i => i.toString() == val.id).length;
                let new_ownership = (cnt + 0.0) / vals.length * 100;
                val.selected_by_percent = new_ownership + 0;
            });
            players = Object.fromEntries(players.map(i => [i.id, i.selected_by_percent]));
            this.last_gw_all = players;
        },
        prepareEstimation() {
            let players = _.cloneDeep(this.element_now.values);
            let cg = this.current_gw_data;
            let lg = this.last_gw_data;
            let slw = this.sample_last_gw;

            players.forEach(function(val) {
                val.selected_by_percent = Math.min(Math.max(slw[val.id] + (cg[val.id] - lg[val.id]), 0), 100);
            });
            this.estimation = Object.fromEntries(players.map(i => [i.id, i.selected_by_percent]));
        }
    },
    computed: {
        // is_ready() {
        //     if (this.element_history.length < 7) { return false; }
        //     if (Object.keys(this.sample_data).length == 0) { return false; }
        //     return true;
        // },
        is_fully_ready() {
            if (!this.is_ready) { return false; }
            if (Object.keys(this.estimation) == 0) { return false; }
            return true;
        },
        current_gw_data() {
            if (Object.keys(this.element_now).length == 0) { return {} };
            return Object.fromEntries(this.element_now.values.map(i => [i.id, i.selected_by_percent]));
        },
        last_gw_data() {
            if (Object.keys(this.last_gw_all).length == 0) { return []; }
            if (this.element_history.length < 7) { return []; }
            let last_gw = "GW" + (parseInt(this.gw.slice(2)) - 1);
            let vals = this.element_history.filter(i => i.gw == last_gw)[0].values;
            vals = Object.fromEntries(vals.map(i => [i.id, i.selected_by_percent]));
            let defvals = Object.fromEntries(this.element_now.values.map(i => [i.id, 0]))
            return {...defvals, ...vals };
        },
        sample_last_gw() {
            return this.last_gw_all;
        },
        sample_estimated() {
            if (this.is_fully_ready) {
                return this.estimation;
            } else {
                return {};
            }
        }
    }
})


function get_element_data(name, season, gw, date) {
    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/input/element.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            let el_data = values.map(i => _.zipObject(keys, i));
            el_data = el_data.filter(i => i.id != undefined);
            app.save_gw_data(el_data, name, season, gw, date);
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

function draw_ownership_plot() {

    return;

    if (!app.is_ready) { return; }

    var margin = { top: 10, right: 100, bottom: 30, left: 30 },
        width = 300 - margin.left - margin.right,
        height = 200 - margin.top - margin.bottom;

    var svg = d3.select("#ownership_graph").append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    let data = app.element_history;
    data = data.map(i => Object.fromEntries(i.values.map(j => [j.id, j.selected_by_percent])))
    let keys = Object.keys(data[0]);
    let graph_data = [];
    for (let k of keys) {
        let vals = data.map(i => i[k]).filter(i => i != undefined);
        if (vals.length == 7) {
            let change = vals[0] - vals[6];
            let avg = (vals.reduce((a, b) => parseFloat(a) + parseFloat(b), 0)) / vals.length;
            graph_data.push({ 'id': k, 'values': vals, 'change': change, 'avg': avg });
        }
    }
    graph_data = graph_data.filter(i => i.avg > 8).filter(i => Math.abs(i.change) > 5);

    var x = d3.scaleLinear()
        .domain([0, 6])
        .range([0, width]);
    svg.append("g")
        .attr("transform", "translate(0," + height + ")")
        .call(d3.axisBottom(x));

    var y = d3.scaleLinear()
        .domain([0, 70])
        .range([height, 0]);
    svg.append("g")
        .call(d3.axisLeft(y));

    var line = d3.line()
        .x(function(d, i) { return x(i) })
        .y(function(d, i) { return y(d) })
    svg.selectAll("myLines")
        .data(graph_data)
        .enter()
        .append("path")
        .attr("d", function(d) { return line(d.values) })
        // .attr("stroke", function(d) { return myColor(d.name) })
        .attr("stroke", "white")
        .style("stroke-width", 1)
        .style("fill", "none")

    // USE DROPDOWN

}


$(document).ready(function() {
    get_element_data("now", season, gw, date);
    for (let i of listdates.slice(1, 7)) {
        let point = i.split('/').map(i => i.trim());
        get_element_data('historic', point[0], point[1], point[2]);
    }

    let last_gw = (parseInt(gw.slice(2)) - 1);

    $.ajax({
        type: "GET",
        url: `sample/${last_gw}/fpl_sampled.json`,
        dataType: "json",
        success: function(data) {
            app.saveSampleDataAndInit(true, data);
        }
    });
});