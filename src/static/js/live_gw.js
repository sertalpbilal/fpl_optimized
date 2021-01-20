var app = new Vue({
    el: '#app',
    data: {
        cnt: 0,
        season: season,
        gw: gw,
        next_gw: next_gw,
        date: date,
        listdates: listdates,
        is_active: is_active,
        active_gw: active_gw,
        gw_fixture: undefined,
        team_id: "-1",
        team_info: undefined,
        using_last_gw_team: false,
        team_data: undefined,
        el_data: undefined,
        ownership_source: "Official FPL API",
        available_sources: ["Official FPL API"],
        sample_data: undefined,
        selected_game: undefined
    },
    created: function() {
        this.gw_fixture = [];
        this.team_data = [];
        this.el_data = [];
        this.sample_data = {};
        this.team_info = {};
    },
    computed: {
        valid_team_id() { return this.team_id == -1 ? "Click to enter" : this.team_id },
        is_ready() { return this.team_id == -1 || this.team_data == undefined || this.team_data.length == 0 ? false : true },
        seasongwdate: {
            get: function() {
                return this.season + " / " + this.gw + " / " + this.date;
            },
            set: function(value) {
                let v = value.split(' / ');
                this.season = v[0];
                this.gw = v[1];
                this.date = v[2];
            }
        },
        ownership_data() {
            return get_ownership_by_type(this.ownership_source, this.el_data, this.sample_data);
        },
        current_team_id: {
            get() {
                if (this.team_id == "-1") {
                    return "";
                }
                return this.team_id;
            },
            set(v) {}
        },
        gameweek_info() {
            if (this.gw_fixture.length == 0) { return {} }
            let fixture = this.gw_fixture;
            let gw_info = {};
            gw_info.start_dt = fixture[0].start_dt;
            gw_info.end_dt = fixture[fixture.length - 1].end_dt;
            gw_info.channels = Math.max(...fixture.map(i => i.order));
            return gw_info;
        },
        game_string() {
            if (this.selected_game == undefined) { return "." }
            let game = this.gw_fixture[this.selected_game];
            if (game.finished_provisional) {
                return teams_ordered[game.team_h - 1].name + " vs " + teams_ordered[game.team_a - 1].name + " (" + game.team_h_score + "-" + game.team_a_score + ")";
            } else if (game.started) {
                return "(Live) " + teams_ordered[game.team_h - 1].name + " vs " + teams_ordered[game.team_a - 1].name + " (" + game.team_h_score + "-" + game.team_a_score + ")";
            } else {
                return teams_ordered[game.team_h - 1].name + " vs " + teams_ordered[game.team_a - 1].name;
            }
        }
    },
    methods: {
        saveTeamData(data) {
            this.team_data = data;
        },
        saveTeamInfo(data) {
            this.team_info = data;
        },
        saveEl(data) {
            this.el_data = data;
        },
        saveFixtureData(data) {

            let sorted_fixture = data.sort((a, b) => { return a.kickoff_time - b.kickoff_time });

            sorted_fixture.forEach((game, index) => {
                game.start_dt = new Date(game.kickoff_time);
                game.end_dt = new Date(game.start_dt.getTime() + (105 * 60 * 1000));
                game.duration = 105 * 60 * 1000;
                game.label = teams_ordered[game.team_h - 1].name + " vs " + teams_ordered[game.team_a - 1].name;
                game.node_info = { start: (game.start_dt).getTime(), end: game.end_dt.getTime(), content: 'Game' }
                let order = 0;
                sorted_fixture.slice(0, index).forEach((game2) => {
                    if ((game.start_dt >= game2.start_dt && game.start_dt <= game2.end_dt) ||
                        (game.end_dt >= game2.start_dt && game.end_dt <= game2.end_dt)) {
                        order += 1;
                    }
                })
                game.order = order;
            })
            this.gw_fixture = sorted_fixture;
            this.$nextTick(() => {
                init_timeline();
            })
        },
        saveSampleData(success, data) {
            if (success) {
                this.sample_data = data;
                let sample_values = Object.keys(data).reverse().map(i => "Sample - " + sample_compact_number(i));
                this.available_sources = ["Official FPL API"].concat(sample_values);
                if (this.ownership_source == this.available_sources[0]) {
                    this.ownership_source = this.available_sources[1];
                }
            } else {
                this.sample_data = [];
                this.available_sources = ["Official FPL API"];
                this.ownership_source = this.available_sources[0];
            }
        },
        selectLeagueTeam() {
            this.team_id = $("#fpl_analytics_league_select").val();
            if (this.team_id == "") { return; }
            this.$nextTick(() => {
                $("#teamModal").modal('hide');
                load_team_data();
            })
        },
        saveTeamId() {
            this.team_id = $("#teamIdEnter").val();
            this.$nextTick(() => {
                $("#fpl_analytics_league_select").val("");
                $("#teamModal").modal('hide');
                load_team_data();
            })
        }
    },
})

function load_team_data() {

    $("#waitModal").modal({
        backdrop: 'static',
        keyboard: false
    }).modal('show');

    get_team_picks({ gw: app.gw.slice(2), team_id: app.team_id, force_last_gw: true }, (error, response) => {
        if (error == undefined) {
            app.saveTeamData(response.body);
            app.using_last_gw_team = response.is_last_gw;
        } else {
            console.log("Something went wrong with team picks! " + app.team_id + ", " + app.gw)
        }
        $("#waitModal").modal('hide');
    });

    get_team_info(app.team_id, (error, data) => {
        if (error == undefined) {
            app.saveTeamInfo(data);
        }
    })
}

function load_element_data() {
    get_cached_element_data({ season: app.season, gw: app.gw, date: app.date }, (error, data) => {
        if (error == undefined) { app.saveEl(data); }
    })
}

function load_sample_data() {
    get_sample_data(app.gw.slice(2), (error, data) => {
        if (error == undefined) { app.saveSampleData(true, data); } else { app.saveSampleData(false, []); }
    });
}

function load_fixture_data() {
    get_fixture(app.gw.slice(2), (error, data) => {
        if (error == undefined) {
            app.saveFixtureData(data);
        }
    })
}

function init_timeline() {
    var margin = { top: 9, right: 5, bottom: 20, left: 5 },
        width = 450 - margin.left - margin.right,
        height = 30 * (app.gameweek_info.channels * 2) - margin.top - margin.bottom;

    let cnv = d3.select("#d3-timeline")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center')
        .style('display', 'block')
        .style('min-width', '700px')
        .style('padding-bottom', '10px');

    let svg = cnv.append('g').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    svg.append('rect').attr('fill', '#5a5d5c').attr('width', width).attr('height', height);

    let game_color = (d) => {
        return d3.schemeDark2[d % 8];
    }

    // Min max values
    let vals = app.gw_fixture;
    let x_high = app.gameweek_info.end_dt.getTime() + 120 * 60 * 1000;
    let x_low = app.gameweek_info.start_dt.getTime() - 120 * 60 * 1000;

    let x_ticks = [];
    let start_midnight = new Date(app.gameweek_info.start_dt.getTime());
    start_midnight.setHours(24, 0, 0, 0);
    for (let i = start_midnight.getTime(); i <= x_high; i += 24 * 60 * 60 * 1000) {
        x_ticks.push(i)
    }


    // Axis-x
    var x = d3.scaleLinear().domain([x_low, x_high]).range([0, width]);
    svg.append('g')
        // .attr('transform', 'translate(0,' + height + ')')
        .call(
            d3.axisBottom(x).tickValues(x_ticks)
            .tickFormat(function(d, i) {
                // return new Date(d).toISOString().slice(0, 10);
                return new Date(d).toLocaleDateString();
            })
            .tickSize(height)
        );

    // Axis -y
    var y = d3.scaleBand().domain(vals.map(i => i.order)).range([height, 0]).paddingInner(0.1).paddingOuter(0.05);
    svg.append('g').call(d3.axisLeft(y).tickSize(0).tickValues([]));

    svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
        .call(g => g.selectAll(".tick line")
            .attr("stroke-dasharray", "4,2")
            .attr("stroke", "#f1f1f1")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.3)
            .style('pointer-events', 'none'))
        .call(g => g.selectAll(".domain")
            .attr("opacity", 0));

    // Title - x
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 17)
        .attr("font-size", "4pt")
        .attr("fill", "white")
        .text("Date/Time");

    svg.call(s => s.selectAll(".tick").attr("font-size", "4pt"));

    var Tooltip = d3.select("#timeline-wrapper")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip")
        .style("background-color", "white")
        .style("border", "solid")
        .style("border-width", "2px")
        .style("border-radius", "5px")
        .style("padding", "5px")
        .style("color", "black");

    function mouseenter(d) {
        let game = d3.select(this);
        game.attr("opacity", 1);
        game.attr("fill", "red");
        app.selected_game = game.attr('data-index');
        Tooltip.style("opacity", 0.85);
    }

    function mouseleave(d) {
        let game = d3.select(this);
        game.attr("opacity", 0.7);
        game.attr("fill", game_color(game.attr('data-index')));
        app.selected_game = undefined;
        Tooltip.style("opacity", 0)
            .style("left", "0px")
            .style("top", "0px");
    }

    function mousemove(d) {
        let offset = -20;
        try {
            offset = -Tooltip.node().getBoundingClientRect().width / 2;
        } catch {}
        Tooltip
            .html(app.game_string)
            .style("left", (d.pageX + offset) + "px")
            .style("top", (d.pageY - 50) + "px")
    }


    // Games
    svg.append("g")
        .selectAll()
        .data(vals)
        .enter()
        .append('rect')
        // .attr("transform", function(d) { return "translate(" + x(d.node_info.start) + ",0)"; })
        .attr("x", d => x(d.node_info.start))
        .attr("width", d => x(d.node_info.end) - x(d.node_info.start))
        .attr("y", d => y(d.order))
        .attr("height", y.bandwidth())
        .attr("opacity", 0.7)
        .attr("fill", (d, i) => game_color(i))
        .attr("stroke", "#d2d2d2")
        .attr("stroke-width", 0.5)
        .attr("data-index", (d, i) => i)
        .style("cursor", "pointer")
        .on("mouseenter", mouseenter)
        .on("mouseleave", mouseleave)
        .on("mousemove", mousemove);

    let right_now = new Date();
    let now_time = right_now.getTime();

    let now_group = svg.append('g');
    now_group
        .append('line')
        .attr('id', 'now')
        .attr("pointer-events", "none")
        .attr('x1', x(now_time))
        .attr('y1', y.range()[0])
        .attr('x2', x(now_time))
        .attr('y2', y.range()[1])
        .style('stroke', '#820000')
        .style("stroke-dasharray", "2,0.5")
        .style("stroke-width", 1)
        .style("stroke-opacity", 0.7);

    now_group.append('text')
        .attr("text-anchor", "middle")
        .attr("x", x(now_time))
        .attr("y", -6)
        .attr("font-size", "3pt")
        .attr("fill", "white")
        .text("Now");

    svg.on('mouseenter', (e) => {
        let x_now = d3.pointer(e)[0];
        svg.append('line')
            .attr('id', 'guide')
            .attr('x1', x_now)
            .attr('y1', y.range()[0])
            .attr('x2', x_now)
            .attr('y2', y.range()[1])
            .style('stroke', 'yellow')
            .style("stroke-dasharray", "3,1")
            .style("opacity", 0.5)
            .attr("pointer-events", "none");
        let val = x.invert(x_now);
        svg.append('text')
            .attr('id', 'guidetext')
            .attr("text-anchor", "middle")
            .attr("x", x_now)
            .attr("y", -2)
            .attr("font-size", "3pt")
            .attr("fill", "white")
            .text(new Date(val).toLocaleString());
    })

    svg.on('mousemove', (e) => {
        let x_now = d3.pointer(e)[0];
        let val = x.invert(x_now);
        svg.select("#guide")
            .attr('x1', x_now)
            .attr('x2', x_now);
        svg.select("#guidetext")
            .attr('x', x_now)
            .text(new Date(val).toLocaleString());
    })

    svg.on('mouseleave', () => {
        svg.select("#guide").remove();
        svg.select("#guidetext").remove();
    })

    // svg.on('mousemove', (e) => {
    //     console.log(e);
    // });

    let left_offset = document.querySelector("#now").getBoundingClientRect().x - window.innerWidth / 2;
    $("#d3-timeline").scrollLeft(left_offset);

}

function app_initialize() {
    load_element_data();
    load_sample_data();
    load_fixture_data();
}

function zoomInSvg() {
    let svgEl = document.querySelector("svg");
    let currentWidth = svgEl.getBoundingClientRect().width;
    let currentMinWidth = parseInt(svgEl.style.minWidth.replace("px", ""));
    if (currentMinWidth < currentWidth) {
        svgEl.style.minWidth = (currentWidth + 100) + "px";
    } else {
        if (currentMinWidth < 2000) {
            svgEl.style.minWidth = (currentMinWidth + 100) + "px";
        }
    }
}

function zoomOutSvg() {
    let svgEl = document.querySelector("svg");
    let currentMinWidth = svgEl.style.minWidth;
    svgEl.style.minWidth = (parseInt(currentMinWidth.replace("px", "")) - 100) + "px";
}


$(document).ready(function() {
    app_initialize();
});