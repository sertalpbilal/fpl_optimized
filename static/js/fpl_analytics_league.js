var app = new Vue({
    el: '#app',
    data: {
        is_ready: false,
        season: season,
        gw: gw,
        next_gw: next_gw,
        date: date,
        listdates: listdates,
        league_data: [],
        table: ""
    },
    methods: {
        get_table() {
            $.ajax({
                type: "GET",
                url: `data/${this.season}/${this.gw}/${this.date}/input/fpl_analytics_league.csv`,
                dataType: "text",
                success: function(data) {
                    debugger;
                    tablevals = data.split('\n').map(i => i.split(','));
                    keys = tablevals[0];
                    keys = keys.map(i => i.trim());
                    values = tablevals.slice(1);
                    let el_data = values.map(i => _.zipObject(keys, i));
                    el_data = el_data.filter(i => i.FPL !== undefined)
                    app.saveSampleDataAndInit(true, el_data);
                },
                error: function(xhr, status, error) {
                    console.log(error);
                    console.error(xhr, status, error);
                }
            });
        },
        saveSampleDataAndInit(success, data) {
            if (success) {
                this.league_data = data;
            }
            this.is_ready = true;
            this.$nextTick(() => {
                this.table = $("#fpl_analytics_table").DataTable({
                    "order": [4],
                    info: false,
                    scrollX: true,
                    paging: false,
                    scrollY: "400px",
                    scrollCollapse: true,
                    fixedColumns: true,
                    lengthChange: false,
                    "processing": true,
                    searching: false,
                    buttons: [
                        'copy', 'csv'
                    ],
                    columnDefs: [
                        { orderable: false, targets: 0 }
                    ],
                });
                this.table.buttons().container()
                    .appendTo('.col-md-6:eq(0)');
                draw_md_vs_fpl();
            })
        },
    },
    computed: {
        is_fully_ready() {
            return (this.table != "");
        }
    }
})

function draw_md_vs_fpl() {

    var margin = { top: 10, right: 30, bottom: 35, left: 45 },
        width = 450 - margin.left - margin.right,
        height = 450 - margin.top - margin.bottom;

    var svg = d3.select("#md_vs_fpl_graph")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .style("max-width", "700px")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    debugger;
    let x_high = Math.max(...app.league_data.map(i => parseFloat(i.MD))) + 20;
    let x_low = Math.min(...app.league_data.map(i => parseFloat(i.MD))) - 20;

    let y_high = Math.max(...app.league_data.map(i => parseFloat(i.FPL))) + 20;
    let y_low = Math.min(...app.league_data.map(i => parseFloat(i.FPL))) - 20;

    var x = d3.scaleLinear()
        .domain([x_low, x_high])
        .range([0, width]);
    svg.append("g")
        // .attr("transform", "translate(0," + height + ")")
        .attr("opacity", 1)
        .call(d3
            .axisBottom(x)
            .ticks(10)
            .tickSize(height)
        )
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5")
            .attr("stroke", "#9a9a9a")
        )
        .call(g => g.selectAll(".tick text")
            .attr("dy", 11)
            .attr("font-size", "6pt")
            .attr("fill", "#9a9a9a"))
        .call(g => g.selectAll(".domain")
            .attr("stroke-opacity", 0));

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 30)
        .attr("font-size", "8pt")
        .attr("fill", "#9a9a9a")
        .text("MD Points");


    // Add Y axis
    var y = d3.scaleLinear()
        .domain([y_high, y_low])
        .range([0, height]);
    svg.append("g")
        .attr("opacity", 1)
        .call(d3.axisRight(y)
            .ticks(10)
            .tickSize(width)
        )
        // .call(g => g.selectAll(".tick:not(:first-of-type) line")
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5")
            .attr("stroke", "#9a9a9a")
        )
        .call(g => g.selectAll(".tick text")
            .attr("x", -10)
            .attr("font-size", "6pt")
            .attr("fill", "#9a9a9a")
            .attr("text-anchor", "end"))
        .call(g => g.selectAll(".domain")
            .attr("stroke-opacity", 0));;


    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -30)
        .attr("font-size", "8pt")
        .attr("fill", "#9a9a9a")
        .text("FPL Points");

    var tooltip = d3.select("body")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip-p3")
        .style("position", "absolute")
        .style("background-color", "#343436")
        .style("color", "white")
        .style("border", "solid")
        .style("border-color", "#ffffff82")
        .style("border-width", "1px")
        .style("border-radius", "5px")
        .style("padding", "5px")
        .style("font-size", "small");

    // Mouse events
    var mouseover = function(d) {
        tooltip.style("opacity", 1)
        d3.select(this)
            .style("opacity", 1)
    }

    var mousemove = function(d) {
        tooltip
            .html(`
                <div class="mx-auto d-block text-center text-white">${d.twitter}</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">FPL</td><td>${parseInt(d.FPL)}</td></tr>
                    <tr><td class="text-right">MD</td><td>${parseFloat(d.MD).toFixed(2)}</td></tr>
                    <tr><td class="text-right">FPL Rank</td><td>${d.FPL_Rank}</td></tr>
                    <tr><td class="text-right">MD Rank</td><td>${d.MD_Rank}</td></tr>
                    <tr><td class="text-right">Luck</td><td>${d.Luck}</td></tr>
                </table>
            `)
            .style("left", (d3.event.pageX + 15) + "px")
            .style("top", (d3.event.pageY + 15) + "px")
    }
    var mouseleave = function(d) {
        tooltip.style("opacity", 0)
        d3.select(this)
            .style("opacity", 0.6);
        tooltip.style("left", "0px")
            .style("top", "0px");
    }

    // Add dots
    svg.append('g')
        .selectAll()
        .data(app.league_data)
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(parseFloat(d.MD)); })
        .attr("cy", function(d) { return y(parseFloat(d.FPL)); })
        .attr("r", 5)
        .style("fill", "#c53e3e")
        .style("stroke", "white")
        .style("opacity", 0.6)
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);


}


$(document).ready(function() {
    app.get_table();
});