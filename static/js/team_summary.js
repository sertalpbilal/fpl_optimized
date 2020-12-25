var app = new Vue({
    el: '#app',
    data: {
        season: season,
        gw: gw,
        next_gw: next_gw,
        date: date,
        listdates: listdates,
        solutions: [],
        team_id: "-1",
        el_data: [],
        xp_data: [],
        rp_data: [],
        rp_ready: false,
        team_data: [],
        sorted_data: [],
        chosen_player: {},
        el_types: element_type
    },
    methods: {
        refresh_results() {
            season = this.season;
            gw = this.gw;
            date = this.date;
            load_gw();
            load_team();
        },
        close_date() {
            $("#dateModal").modal('hide');
        },
        close_teammodal() {
            $("#teamModal").modal('hide');
        },
        setSolutions(values) {
            this.solutions = _.cloneDeep(values);
        },
        saveTeamId(e) {
            this.team_id = $("#teamIdEnter").val();
            this.$nextTick(() => {
                app.close_teammodal();
                load_team();
            })
        },
        saveEl(values) {
            this.el_data = values;
        },
        saveXP(values) {
            this.xp_data = values;
        },
        saveTeamData(data) {
            this.team_data = data;
        },
        saveRPData(data) {
            this.rp_data = data;
        },
        generateList() {

            // PART 1: PRIOR DATA
            if (!this.is_ready) { return; }
            this.rp_ready = false;

            let pts = this.xp_data;
            let els = this.el_data;
            let team = this.team_data;
            let cgw = this.gw.slice(2);
            pts = pts.filter(x => x.event == cgw);
            els = Object.fromEntries(els.map(x => [x.id, x]));
            let captain = team.picks.filter(i => i.is_captain)[0].element;
            let lineup = team.picks.filter(i => i.multiplier >= 1).map(i => i.element);
            let squad = team.picks.map(i => i.element);
            let rp = Object.fromEntries(this.rp_data);

            pts.forEach((e) => {
                // e.info = els[e.player_id];
                e.element_type = els[e.player_id]['element_type'];
                e.price = parseFloat(els[e.player_id]['now_cost']) / 10;
                e.ownership = els[e.player_id]['selected_by_percent'];
                e.lineup = lineup.includes(parseInt(e.player_id));
                e.squad = squad.includes(parseInt(e.player_id));
                e.captain = (e.player_id == captain);
                e.xp_owned = (1 - e.ownership / 100) * e.points_md;
                e.xp_non_owned = -e.ownership / 100 * e.points_md;
                e.net_xp = ((e.lineup == 1) - e.ownership / 100) * e.points_md;
                e.threat = false;
                e.stats = rp[e.player_id];
            });
            let sorted_players = Object.entries(pts).sort((a, b) => {
                if (a[1].squad == b[1].squad) {
                    if (a[1].net_xp < b[1].net_xp)
                        return 1;
                    else
                        return -1;
                } else {
                    return (a[1].squad < b[1].squad) * 2 - 1;
                }
            });
            for (let i of sorted_players.slice(-5)) {
                i[1].threat = true;
            };
            this.sorted_data = sorted_players;

            // Posterior

            if (this.rp_data.length != 0) {
                this.rp_ready = true;
            }

        },
        setChosenPlayer(d) {
            this.chosen_player = d;
        },
        swapPlayers() {
            let old_player = $("#transfer_out").val();
            let new_player = this.chosen_player.player_id;
            this.team_data.picks.filter(i => i.element == parseInt(old_player))[0].element = parseInt(new_player);
            this.generateList();
            this.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
            $("#playerModal").modal('hide');
        },
        toggleLineupType(e) {
            console.log(e);
            let id = e.currentTarget.dataset.id;
            let el = this.team_data.picks.filter(i => i.element == parseInt(id))[0];
            if (el.multiplier == 0) {
                el.multiplier = 1;
            } else {
                el.multiplier = 0;
            }
            this.generateList();
        }
    },
    computed: {
        is_ready() {
            if (this.team_id == "-1") {
                return false;
            }
            if (this.team_data.length == 0) { return false; }
            return true;
        },
        current_team_id: {
            get: function() {
                if (this.team_id == "-1") {
                    return "";
                }
                return this.team_id;
            },
            set: function(v) {}
        },
        valid_team_id: function() {
            if (this.team_id == "-1") {
                return "Click to enter";
            } else {
                return this.team_id;
            }
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
        },
        team_squad: function() {
            if (!this.is_ready) { return []; }
            return app.sorted_data.slice(0, 15);
        },
        prior_data: {
            get: function() {
                if (!this.is_ready) {
                    return [];
                }
                return this.sorted_data;
            }
        },
        lineup_xp_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].lineup).map(j => j[1].xp_owned).reduce((a, b) => a + b, 0).toFixed(2);
        },
        lineup_own_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].lineup).map(j => parseFloat(j[1].ownership)).reduce((a, b) => a + b, 0).toFixed(2);
        },
        squad_xp_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].squad).map(j => j[1].xp_owned).reduce((a, b) => a + b, 0).toFixed(2);
        },
        squad_own_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].squad).map(j => parseFloat(j[1].ownership)).reduce((a, b) => a + b, 0).toFixed(2);
        },
        rest_xp_sum: function() {
            if (!this.is_ready) { return 0; }
            return this.prior_data.filter(j => j[1].squad == false).map(j => j[1].xp_non_owned).reduce((a, b) => a + b, 0).toFixed(2);
        },
        net_change: function() {
            if (!this.is_ready) { return 0; }
            let lineup_xp = this.lineup_xp_sum;
            let other_xp = this.prior_data.filter(j => j[1].lineup == false).map(j => j[1].xp_non_owned).reduce((a, b) => a + b, 0);
            let net_change = parseFloat(lineup_xp) + parseFloat(other_xp);
            let change = "" + net_change < 0 ? net_change.toFixed(2) : "+" + net_change.toFixed(2);
            return change;
        },
        aftermath: function() {
            if (!this.is_ready) { return {}; }
            let gw_xp = this.prior_data.filter(j => j[1].lineup).map(j => j[1].points_md * (1 - j[1].ownership / 100)).reduce((a, b) => a + b, 0);
            let gw_rp = this.prior_data.filter(j => j[1].lineup).map(j => j[1].stats.total_points * (1 - j[1].ownership / 100)).reduce((a, b) => a + b, 0);
            let fpl_xp = this.prior_data.filter(j => j[1].lineup == false).map(j => j[1].points_md * (j[1].ownership / 100)).reduce((a, b) => a + b, 0);
            let fpl_rp = this.prior_data.filter(j => j[1].lineup == false).map(j => j[1].stats.total_points * (j[1].ownership / 100)).reduce((a, b) => a + b, 0);
            return { 'net_xp': gw_xp, 'net_rp': gw_rp, 'fpl_xp': fpl_xp, 'fpl_rp': fpl_rp }
        },
        formation: function() {
            if (!this.is_ready) {
                return [
                    [], ""
                ];
            }
            let elcount = [];
            let squad = this.prior_data.slice(0, 15);
            Object.values(this.el_types).forEach(function(e) {
                let filtered = squad.filter(i => i[1].element_type == e.id && i[1].lineup);
                elcount.push(filtered.length);
            })
            return [elcount, "(" + elcount[0] + ") " + `${elcount[1]}-${elcount[2]}-${elcount[3]}`];
        },
        is_formation_valid: function() {
            if (!this.is_ready) { return true; }
            let lineup = this.prior_data.filter(i => i[1].lineup);
            let is_valid = true;
            if (lineup.length != 11) {
                return false;
            } else {
                Object.values(this.el_types).forEach(function(e) {
                    let pos_els = lineup.filter(i => i[1].element_type == e.id).length;
                    if (pos_els < e.min) {
                        is_valid = false;
                    }
                    if (pos_els > e.max) {
                        is_valid = false;
                    }
                })
            }
            return is_valid;
        }
    }
})

function load_gw() {
    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/input/element_gameweek.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            let xp_data = values.map(i => _.zipObject(keys, i));
            app.saveXP(xp_data);
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
        }
    });

    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/input/element.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            let el_data = values.map(i => _.zipObject(keys, i));
            app.saveEl(el_data);
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
        }
    });

    // https://fantasy.premierleague.com/api/event/14/live/

    gw_no = app.gw.slice(2);

    $.ajax({
        type: "GET",
        url: `https://cors-anywhere.herokuapp.com/https://fantasy.premierleague.com/api/event/${gw_no}/live/`,
        contentType: 'text/plain',
        dataType: 'text',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let elemvals = JSON.parse(data);
            let rp_data = elemvals.elements.map(i => [i.id, i.stats])
            app.saveRPData(rp_data);
            app.generateList();
            app.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
            alert(`Cannot get GW ${gw_no} results.`);
        }
    });
}

function load_team() {
    gw = app.gw.slice(2);
    if (app.team_id == "-1") {
        return;
    }
    $("#waitModal").modal({
        backdrop: 'static',
        keyboard: false
    }).modal('show');
    if (app.gw == next_gw) {
        gw = "" + (parseInt(gw) - 1);
        // Show message that last GW is picked up
    }
    $.ajax({
        type: "GET",
        url: `https://cors-anywhere.herokuapp.com/https://fantasy.premierleague.com/api/entry/${app.team_id}/event/${gw}/picks/`,
        contentType: 'text/plain',
        dataType: 'text',
        // responseType: 'application/json',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let teamvals = JSON.parse(data);
            app.saveTeamData(teamvals);
            $("#waitModal").modal('hide');
            app.generateList();
            app.$nextTick(() => {
                $(".plot").empty();
                generate_plots();
            })
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
            alert("Cannot get picks for given team ID and gameweek");
            $("#waitModal").modal('hide');
        }
    });
}

function generate_plots() {
    if (!app.is_ready) { return; }
    // if (app.rp_data == 0) { return; }
    plot_bubble_xp_own_prior();
    plot_bubble_xp_own_posterior();
}

function plot_bubble_xp_own_prior() {

    var margin = { top: 40, right: 30, bottom: 40, left: 45 },
        width = 500 - margin.left - margin.right,
        height = 500 - margin.top - margin.bottom;


    var svg = d3.select("#xp_own_prior").append("svg")
        // .attr("width", width + margin.left + margin.right)
        // .attr("height", height + margin.top + margin.bottom)
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // Add X axis
    var x = d3.scaleLinear()
        .domain([0, 7])
        .range([0, width]);
    svg.append("g")
        // .attr("transform", "translate(0," + height + ")")
        .attr("opacity", 1)
        .call(d3.axisBottom(x).ticks(5)
            .tickSize(height))
        .call(g => g.selectAll(".tick:not(:first-of-type) line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("dy", 11));

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("font-size", "smaller")
        .text("Net Gain");

    // Add Y axis
    var y = d3.scaleLinear()
        .domain([0, -5])
        .range([height, 0]);
    svg.append("g")
        .attr("opacity", 1)
        .call(d3.axisRight(y)
            .ticks(5)
            .tickSize(width))
        .call(g => g.selectAll(".tick:not(:first-of-type) line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("x", -15));

    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -30)
        .attr("font-size", "smaller")
        .text("Net Loss");

    var z = d3.scaleLinear()
        .domain([0, 13])
        .range([0, 8]);

    svg.selectAll(".domain").attr("stroke-opacity", 0);

    // Tooltip
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
        name_color = "white";
        own_color = "white";
        threat_color = "white";
        if (d[1].squad == true) {
            name_color = own_color = "#6fcfd6";
        } else if (d[1].threat == true) {
            name_color = threat_color = "#de6363";
        }
        tooltip
            .html(`
                <div class="mx-auto d-block text-center" style="color: ${name_color}">${d[1].web_name}</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">xP</td><td>${parseFloat(d[1].points_md).toFixed(2)}</td></tr>
                    <tr><td class="text-right">Own.</td><td>${d[1].ownership}%</td></tr>
                    <tr><td class="text-right">Price</td><td>£${d[1].price}M</td></tr>
                    <tr><td class="text-right">Net Gain</td><td style="color: ${own_color}">+${d[1].xp_owned.toFixed(2)}</td></tr>
                    <tr><td class="text-right">Net Loss</td><td style="color: ${threat_color}">${d[1].xp_non_owned.toFixed(2)}</td></tr>
                </table>
            `)
            .style("left", (d3.event.pageX + 15) + "px")
            .style("top", (d3.event.pageY + 15) + "px")
    }
    var mouseleave = function(d) {
        tooltip.style("opacity", 0)
        d3.select(this)
            .style("opacity", 0.5);
        tooltip.style("left", "0px")
            .style("top", "0px");
    }

    var playerclick = function(d) {
        app.setChosenPlayer(d[1]);
        $("#playerModal").modal('show');
    }

    var x_max = 7;
    var y_max = -5;

    // Guidelines
    lines = [5, 10, 25, 50];
    svg.append('g')
        .selectAll()
        .data(lines)
        .enter()
        .append('line')
        .attr("x1", x(0))
        .attr("y1", y(0))
        .attr("x2", function(d) {
            if (-x_max * d / (100 - d) < y_max) {
                return x(-y_max / d * (100 - d));
            }
            return x(x_max)
        })
        .attr("y2", function(d) {
            let x_bound = -x_max * d / (100 - d);
            let y_bound = y_max;
            if (x_bound > y_bound) {
                return y(x_bound);
            }
            return y(y_bound);
        })
        .style("stroke", "#91d3ff")
        .style("stroke-width", 1)
        .style("opacity", 0.5)
        .style("stroke-dasharray", "3,5");

    // Guidelines text
    let g_text = svg.append('g')
    g_text
        .selectAll()
        .data(lines)
        .enter()
        .append('text')
        .attr("x", function(d) {
            let x_bnd = -x_max * d / (100 - d);
            let y_bnd = y_max;
            if (x_bnd < y_bnd) {
                return x(-y_max / d * (100 - d));
            }
            return x(x_max) + 5;
        })
        .attr("y", function(d) {
            let x_bnd = -x_max * d / (100 - d);
            let y_bnd = y_max;
            if (x_bnd > y_bnd) {
                return y(x_bnd);
            }
            return y(y_bnd) - 15;
        })
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(function(d) { return d + "%" })
        .style("font-size", "x-small")
        .style("fill", "#91d3ff")
        .style("opacity", 0.4);

    g_text.append('text')
        .attr("x", x(7) + 5)
        .attr("y", y(-5) - 15)
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text("Own%")
        .style("font-size", "x-small")
        .style("fill", "#91d3ff")
        .style("opacity", 0.4);


    // All players
    svg.append('g')
        .selectAll()
        .data(app.prior_data.slice(0, -5).filter(i => (i[1].squad == false)))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d[1].xp_owned); })
        .attr("cy", function(d) { return y(d[1].xp_non_owned); })
        .attr("r", function(d) { return z(d[1].price); })
        .style("fill", "#616362")
        .style("opacity", "0.5")
        .style("cursor", "pointer")
        .attr("stroke", "#9e9e9e")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

    // Dangerous players
    svg.append('g')
        .selectAll()
        .data(app.prior_data.slice(-5))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d[1].xp_owned); })
        .attr("cy", function(d) { return y(d[1].xp_non_owned); })
        .attr("r", function(d) { return z(d[1].price); })
        .style("fill", "#e22f2f")
        .style("opacity", "0.5")
        .style("cursor", "pointer")
        .attr("stroke", "#fffe53")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave)
        .on("click", playerclick);

    // Squad
    svg.append('g')
        .selectAll()
        .data(app.prior_data.filter(i => (i[1].squad == true)))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d[1].xp_owned); })
        .attr("cy", function(d) { return y(d[1].xp_non_owned); })
        .attr("r", function(d) { return z(d[1].price); })
        .style("fill", "#6fcfd6")
        .style("opacity", "0.5")
        .attr("stroke", "#ffffff")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

    // risk color: e22f2f - stroke fffe53
    // own color: 6fcfd6 - stroke ffffff
}

function plot_bubble_xp_own_posterior() {

    var margin = { top: 40, right: 30, bottom: 45, left: 45 },
        width = 500 - margin.left - margin.right,
        height = 500 - margin.top - margin.bottom;


    var svg = d3.select("#xp_own_posterior").append("svg")
        // .attr("width", width + margin.left + margin.right)
        // .attr("height", height + margin.top + margin.bottom)
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr("class", "mx-auto d-block")
        .append("g")
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    // Add X axis
    var x = d3.scaleLinear()
        .domain([0, 8])
        .range([0, width]);
    svg.append("g")
        // .attr("transform", "translate(0," + height + ")")
        .attr("opacity", 1)
        .call(d3.axisBottom(x).ticks(5)
            .tickSize(height))
        .call(g => g.selectAll(".tick:not(:first-of-type) line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("dy", 11));

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 40)
        .attr("font-size", "smaller")
        .text("Expected Points");

    // Add Y axis
    var y = d3.scaleLinear()
        .domain([-3, 21])
        .range([height, 0]);
    svg.append("g")
        .attr("opacity", 1)
        .call(d3.axisRight(y)
            .ticks(8)
            .tickSize(width))
        .call(g => g.selectAll(".tick:not(:first-of-type) line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke-dasharray", "3,5"))
        .call(g => g.selectAll(".tick text").attr("x", -15));

    // Add Y axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -30)
        .attr("font-size", "smaller")
        .text("Realized Points");

    var z = d3.scaleLinear()
        .domain([0, 80])
        .range([3, 13]);

    svg.selectAll(".domain").attr("stroke-opacity", 0);

    // Tooltip
    var tooltip = d3.select("body")
        .append("div")
        .style("opacity", 0)
        .attr("class", "tooltip-p2")
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
        name_color = "white";
        own_color = "white";
        threat_color = "white";
        if (d[1].squad == true) {
            name_color = own_color = "#6fcfd6";
        } else if (d[1].threat == true) {
            name_color = threat_color = "#de6363";
        }
        tooltip
            .html(`
                <div class="mx-auto d-block text-center" style="color: ${name_color}">${d[1].web_name}</div>
                <table class="table table-striped table-sm table-dark mb-0">
                    <tr><td class="text-right">xP</td><td>${parseFloat(d[1].points_md).toFixed(2)}</td></tr>
                    <tr><td class="text-right">rP</td><td>${parseInt(d[1].stats.total_points)}</td></tr>
                    <tr><td class="text-right">Mins</td><td>${d[1].stats.minutes}</td></tr>
                    <tr><td class="text-right">Own.</td><td>${d[1].ownership}%</td></tr>
                    <tr><td class="text-right">Price</td><td>£${d[1].price}M</td></tr>
                </table>
            `)
            .style("left", (d3.event.pageX + 15) + "px")
            .style("top", (d3.event.pageY + 15) + "px")
    }
    var mouseleave = function(d) {
        tooltip.style("opacity", 0)
        d3.select(this)
            .style("opacity", 0.5);
        tooltip.style("left", "0px")
            .style("top", "0px");
    }

    // Guidelines
    lines = [0.5, 1, 1.5, 2];
    svg.append('g')
        .selectAll()
        .data(lines)
        .enter()
        .append('line')
        .attr("x1", x(0))
        .attr("y1", y(0))
        .attr("x2", x(8))
        .attr("y2", function(d) {
            return y(8 * d)
        })
        .style("stroke", "#91d3ff")
        .style("stroke-width", 1)
        .style("opacity", 0.5)
        .style("stroke-dasharray", "3,5");

    // Guidelines text
    let g_text = svg.append('g');
    g_text
        .selectAll()
        .data(lines)
        .enter()
        .append('text')
        .attr("x", x(8) + 5)
        .attr("y", function(d) {
            return y(8 * d);
        })
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text(function(d) { return d; }) //((d - 1) * 100).toFixed(0) + "%" })
        .style("font-size", "x-small")
        .style("fill", "#91d3ff")
        .style("opacity", 0.4);

    g_text.append('text')
        .attr("x", x(8) + 5)
        .attr("y", y(21) - 15)
        .attr("text-anchor", "left")
        .attr("alignment-baseline", "middle")
        .attr("pointer-events", "none")
        .text("rP/xP")
        .style("font-size", "x-small")
        .style("fill", "#91d3ff")
        .style("opacity", 0.4);

    // All players
    svg.append('g')
        .selectAll()
        .data(app.prior_data.slice(0, -5).filter(i => (i[1].squad == false)))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d[1].points_md); })
        .attr("cy", function(d) { return y(parseInt(d[1].stats.total_points)); })
        .attr("r", function(d) { return z(parseFloat(d[1].ownership)); })
        .style("fill", "#616362")
        .style("opacity", "0.5")
        .attr("stroke", "#9e9e9e")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

    // Dangerous players
    svg.append('g')
        .selectAll()
        .data(app.prior_data.slice(-5))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d[1].points_md); })
        .attr("cy", function(d) { return y(parseInt(d[1].stats.total_points)); })
        .attr("r", function(d) { return z(parseFloat(d[1].ownership)); })
        .style("fill", "#e22f2f")
        .style("opacity", "0.5")
        .attr("stroke", "#fffe53")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

    // Squad
    svg.append('g')
        .selectAll()
        .data(app.prior_data.filter(i => (i[1].squad == true)))
        .enter()
        .append("circle")
        .attr("cx", function(d) { return x(d[1].points_md); })
        .attr("cy", function(d) { return y(parseInt(d[1].stats.total_points)); })
        .attr("r", function(d) { return z(parseFloat(d[1].ownership)); })
        .style("fill", "#6fcfd6")
        .style("opacity", "0.5")
        .attr("stroke", "#ffffff")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);



}

$(document).ready(function() {
    load_gw();
});