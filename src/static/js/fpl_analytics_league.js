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
        table: "",
        ngc_active: false,
        confetti: undefined
    },
    methods: {
        close_date() {
            $("#dateModal").modal('hide');
        },
        clear_all() {
            this.is_ready = false;
            if (this.table !== "") {
                this.table.destroy();
                this.table = "";
            }
            $(".points_graph svg").remove();
        },
        get_table() {
            $.ajax({
                type: "GET",
                url: `data/${this.season}/${this.gw}/${this.date}/input/fpl_analytics_league.csv`,
                dataType: "text",
                success: function(data) {
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

                $('#fpl_analytics_table').on('order.dt', function(e, settings, array) {
                    let tcol = array[0].col;
                    let tdir = array[0].dir;
                    if ((tcol == 5 || tcol == 10) && tdir == "asc") {
                        if (!app.ngc_active) {
                            app.start_confetti();
                            setTimeout(app.stop_confetti, 15000);
                        }
                    } else {
                        app.ngc_active = false;
                        app.stop_confetti();
                    }

                    // // This will show: "Ordering on column 1 (asc)", for example
                    // var order = this.table.order();
                    // $('#orderInfo').html('Ordering on column ' + order[0][0] + ' (' + order[0][1] + ')');
                });

                draw_comparison_plot("md_vs_fpl_graph", x_tag = "MD", y_tag = "FPL", x_title = "MD Points", y_title = "FPL Points", suffix = "", secondary_suffix = "_Rank");
                draw_comparison_plot("io_vs_fpl_graph", x_tag = "IO", y_tag = "FPL", x_title = "IO Points", y_title = "FPL Points", suffix = "", secondary_suffix = "_Rank");
                draw_comparison_plot("md_vs_fpl_rank_gr", x_tag = "MD", y_tag = "FPL", x_title = "MD Rank", y_title = "FPL Rank", suffix = "_Rank", secondary_suffix = "", reverse = true);
                draw_comparison_plot("io_vs_fpl_rank_gr", x_tag = "IO", y_tag = "FPL", x_title = "IO Rank", y_title = "FPL Rank", suffix = "_Rank", secondary_suffix = "", reverse = true);
            })
        },
        refresh_results() {
            season = this.season;
            gw = this.gw;
            date = this.date;
            this.clear_all();
            this.get_table();
        },
        start_confetti() {
            let confettiSettings = { target: 'confetti', max: 50, clock: 40 };
            let confetti = new ConfettiGenerator(confettiSettings);
            if (this.confetti !== undefined) {
                (this.confetti).clear();
            }
            this.confetti = confetti;
            confetti.render();
            this.ngc_active = true;
        },
        stop_confetti() {
            if (this.confetti !== undefined) {
                let c = this.confetti;
                c.clear();
                this.confetti = undefined;
                this.ngc_active = false;
            }
        }
    },
    computed: {
        is_fully_ready() {
            return (this.table != "");
        },
        seasongwdate: {
            get: function() {
                return this.season + " / " + this.gw + " / " + this.date;
            },
            set: function(value) {
                let v = value.split(' / ');
                this.season = v[0];
                this.gw = v[1];
                this.date = v[2];
                this.refresh_results();
            }
        }
    }
})

function draw_comparison_plot(target_id, x_tag, y_tag, x_title, y_title, suffix = "", secondary_suffix = "_Rank", reverse = false) {

    var margin = { top: 10, right: 30, bottom: 35, left: 55 },
        width = 450 - margin.left - margin.right,
        height = 450 - margin.top - margin.bottom;

    var svg = d3.select(`#${target_id}`)
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .style("max-width", "700px")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    let x_high = Math.max(...app.league_data.map(i => parseFloat(i[x_tag + suffix]))) + 20;
    let x_low = Math.min(...app.league_data.map(i => parseFloat(i[x_tag + suffix]))) - 20;

    let y_high = Math.max(...app.league_data.map(i => parseFloat(i[y_tag + suffix]))) + 20;
    let y_low = Math.min(...app.league_data.map(i => parseFloat(i[y_tag + suffix]))) - 20;

    if (reverse) {
        [x_high, x_low] = [x_low + 20, x_high - 20];
        [y_high, y_low] = [y_low + 20, y_high - 20];
    }

    // Add Y axis
    if (reverse) {
        var x = d3.scaleLog().base(2)
            .domain([x_low, x_high])
            .range([0, width]);
    } else {
        var x = d3.scaleLinear()
            .domain([x_low, x_high])
            .range([0, width]);
    }

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
        .text(x_title);

    // Add Y axis
    if (reverse) {
        var y = d3.scaleLog().base(2)
            .domain([y_high, y_low])
            .range([0, height]);
    } else {
        var y = d3.scaleLinear()
            .domain([y_high, y_low])
            .range([0, height]);
    }

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
        .attr("y", -45)
        .attr("font-size", "8pt")
        .attr("fill", "#9a9a9a")
        .text(y_title);

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
    var mouseover = function(event, d) {
        tooltip.style("opacity", 1)
            // d3.select(this)
            //     .style("opacity", 0.9)
            // .style("fill", "orange")
            // .attr("r", 6)
        d3.selectAll(`.inner-circle-${d.twitter}`)
            .style("opacity", 0.9)
            .style("fill", "orange")
            .attr("r", 6)
        svg.append('line')
            .attr('class', 'guide')
            .attr('x1', x(x_low))
            .attr('y1', y(d[y_tag + suffix]))
            .attr('x2', x(d[x_tag + suffix]))
            .attr('y2', y(d[y_tag + suffix]))
            .attr("pointer-events", "none")
            .style("stroke", "white")
            .style("stroke-dasharray", "3,5")
            .style("opacity", "0.5");
        svg.append('line')
            .attr('class', 'guide')
            .attr('x1', x(d[x_tag + suffix]))
            .attr('y1', y(d[y_tag + suffix]))
            .attr('x2', x(d[x_tag + suffix]))
            .attr('y2', y(y_low))
            .attr("pointer-events", "none")
            .style("stroke", "white")
            .style("stroke-dasharray", "3,5")
            .style("opacity", "0.5")
    }

    var mousemove = function(event, d) {
        tooltip
            .html(`
                <div class="mx-auto d-block text-center text-white">${d.twitter}</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">${x_tag + suffix}</td><td>${d[x_tag + suffix]}</td></tr>
                    <tr><td class="text-right">${y_tag + suffix}</td><td>${d[y_tag + suffix]}</td></tr>
                    <tr><td class="text-right">${x_tag + secondary_suffix}</td><td>${d[x_tag + secondary_suffix]}</td></tr>
                    <tr><td class="text-right">${y_tag + secondary_suffix}</td><td>${d[y_tag + secondary_suffix]}</td></tr>
                    <tr><td class="text-right">Luck</td><td>${d.Luck}</td></tr>
                </table>
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY + 15) + "px")
    }
    var mouseleave = function(event, d) {
        tooltip.style("opacity", 0)
            // d3.select(this)
            //     .style("opacity", 0.6)
            // .style("fill", "#c53e3e")
            // .attr("r", 5);
        d3.selectAll(`.inner-circle-${d.twitter}`)
            .style("opacity", 0.6)
            .style("fill", "#c53e3e")
            .attr("r", 5);
        tooltip.style("left", "0px")
            .style("top", "0px");
        $(".guide").remove();
    }

    // Add diagonal first
    let left_point = Math.max(y_low, x_low);
    let right_point = Math.min(y_high, x_high);
    if (reverse) {
        left_point = Math.max(y_high, x_high);
        right_point = Math.min(y_low, x_low);
    }

    svg.append('g')
        .style("id", "diagonal")
        .append("line")
        .attr("x1", x(left_point))
        .attr("y1", y(left_point))
        .attr("x2", x(right_point))
        .attr("y2", y(right_point))
        .style("stroke", "#91d3ff")
        .style("stroke-width", 1)
        .style("opacity", 0.5)
        .style("stroke-dasharray", "3,5");

    svg.append('g')
        .append('text')
        .attr("x", x(right_point) + 2)
        .attr("y", y(right_point) - 2)
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(`${x_tag}=${y_tag}`)
        .style("font-size", "5pt")
        .style("fill", "#87b4d2")
        .style("opacity", 0.9);


    // Add dots
    svg.append('g')
        .selectAll()
        .data(app.league_data)
        .enter()
        .append("circle")
        .attr("class", function(d) { return `inner-circle-${d.twitter}` })
        .attr("cx", function(d) { return x(parseFloat(d[x_tag + suffix])); })
        .attr("cy", function(d) { return y(parseFloat(d[y_tag + suffix])); })
        .attr("r", 5)
        .style("fill", "#c53e3e")
        .style("stroke", "white")
        .style("stroke-width", 1)
        .style("opacity", 0.6);


    // Add mouseover 
    svg.append('g')
        .selectAll()
        .data(app.league_data)
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(parseFloat(d[x_tag + suffix])); })
        .attr("cy", function(d) { return y(parseFloat(d[y_tag + suffix])); })
        .attr("r", 8)
        .style("fill", "transparent")
        .style("stroke", "transparent")
        .style("stroke-width", 1)
        .style("opacity", 0.6)
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

}


$(document).ready(function() {
    app.get_table();
});