var app = new Vue({
    el: '#app',
    data: {
        season: season,
        team_id: '',
        points_data: {},
        team_data: {},
        el_data: [],
        ready: false,
        top_players_table: undefined,
        gw_table: undefined
    },
    computed: {
        is_ready() {
            return (! _.isEmpty(this.team_data)) && (! _.isEmpty(this.points_data))
        },
        completed() {
            return _.size(this.team_data)
        },
        stats_2d() {
            let structured_data = Object.entries(this.points_data).map(i => i[1].map(j => [i[0], j.id, j.e]))
            return structured_data.flat()
        },
        points_2d() {
            let st_data = this.stats_2d
            let pt_data = st_data.map((e) => {
                let pts = e[2].map(f => f.stats.map(s => s.points)).flat()
                let tot_pts = pts.reduce((a,b) => a+b, 0)
                return {'gw': e[0], 'id': e[1], 'pts': tot_pts}
            })
            return pt_data
        },
        gw_pid_pts() {
            let pts_data = this.points_2d
            let gw_grouped = _.groupBy(pts_data, 'gw')
            Object.keys(gw_grouped).map((key, index) => { gw_grouped[key] = Object.fromEntries( gw_grouped[key].map(i => [i.id, i.pts] ))})
            return gw_grouped
        },
        pid_gw_pts() {
            let pts_data = this.points_2d
            let id_grouped = _.groupBy(pts_data, 'id')
            Object.keys(id_grouped).map((key, index) => { id_grouped[key] = Object.fromEntries( id_grouped[key].map(i => [i.gw, i.pts] ))})
            return id_grouped
        },
        fpl_element() {
            return Object.fromEntries(this.el_data.map(i => [i.id, i]))
        },
        user_player_stats() {
            if (!this.ready) { return []}
            let gw_pid_pts = this.gw_pid_pts
            let fpl_data = this.fpl_element
            let picks = Object.entries(this.team_data).map(i => i[1].picks.map(j => ({'gw': i[0], ...j}))).flat()
            picks.forEach((p) => {
                p['points'] = ((gw_pid_pts[p.gw] || {})[p.element] || 0 )
                p['raw'] = fpl_data[p.element]
            })
            return picks
        },
        user_player_sum() {
            if (!this.ready) { return []}
            let picks = this.user_player_stats
            let grouped_pick_data = _(picks).groupBy('element').value()
            let grouped_all_stats = {}
            Object.keys(grouped_pick_data).map(key => {
                e = grouped_all_stats[key] = {}
                e['id'] = key
                e['squad_count'] = grouped_pick_data[key].length
                e['lineup_count'] = grouped_pick_data[key].filter(i => i.multiplier > 0).length
                e['points_total'] = grouped_pick_data[key].map(i => (i.points || 0)*i.multiplier).reduce((a,b) => a+b,0)
                e['cap_count'] = grouped_pick_data[key].filter(i => i.multiplier > 1).length
                e['position'] = grouped_pick_data[key][0].raw.element_type
                e['name'] = grouped_pick_data[key][0].raw.web_name
                e['raw'] = grouped_pick_data[key][0].raw
            })
            let sorted_data = _.orderBy(grouped_all_stats, ['points_total', 'squad_count', 'lineup_count'], ['desc', 'desc', 'desc'])
            return sorted_data
        },
        user_toty() {
            if (!this.ready) { return []}
            let player_sum_data = this.user_player_sum
            let selected_players = []
            let lineup_count = {1: 0, 2: 0, 3: 0, 4: 0}
            let squad_count = {1: 0, 2: 0, 3: 0, 4: 0}
            let selected_index = {}

            // Initial append for minimum valid formation
            for (let pos=1; pos<5; pos++) {
                let min_target = element_type[pos].min
                while(lineup_count[pos] < min_target) {
                    for (let i=0; i<player_sum_data.length; i++) {
                        let p = player_sum_data[i]
                        if (p.position != pos) { continue }
                        selected_players.push({'player': p, 'lineup': true, 'position': pos, 'points_total': p['points_total'], 'cap_count': p['cap_count']})
                        lineup_count[pos] += 1
                        squad_count[pos] += 1
                        selected_index[p.id] = true
                        if (lineup_count[pos] >= min_target) { break }
                    }
                    break;
                }
            }

            for (let i=0; i<player_sum_data.length; i++) {
                let p = player_sum_data[i]
                let pos = p['position']
                if (selected_index[p.id]) { continue }
                if (lineup_count[pos] < element_type[pos].max && getSum(Object.values(lineup_count)) < 11) {
                    selected_players.push({'player': p, 'lineup': true, 'position': pos, 'points_total': p['points_total'], 'cap_count': p['cap_count'], 'is_keeper': pos==1})
                    lineup_count[pos] += 1
                    squad_count[pos] += 1
                }
                else if (squad_count[pos] < element_type[pos].cnt) {
                    selected_players.push({'player': p, 'lineup': false, 'position': pos, 'points_total': p['points_total'], 'cap_count': p['cap_count'], 'is_keeper': pos==1})
                    squad_count[pos] += 1
                }
                if (getSum(Object.values(squad_count)) == 15) {
                    break;
                }
            }

            let pos_ctr = { 1: 1, 2: 1, 3: 1, 4: 1, 'B': 1 }
            selected_players = _.orderBy(selected_players, ['is_keeper', 'points_total'], ['desc', 'desc'])
            selected_players.forEach((player) => {
                let pos = player.position
                let cnt = lineup_count[pos]
                if (player.lineup) {
                    player.x = 122 / (cnt + 1) * pos_ctr[pos] - 17;
                    player.y = (pos - 1) * 35 + 3;
                    pos_ctr[pos] += 1;
                } else {
                    player.x = 122 / 5 * pos_ctr['B'] - 17;
                    pos_ctr['B'] += 1;
                    player.y = 138.5;
                }
            });
            return selected_players
        },
        stats_per_gw() {
            let stats = this.stats_2d
            let gw_data = []
            gw_data = []
            stats.forEach((e) => {
                let f = e[2].map(i => i.stats).flat()
                let summarized = _(f).groupBy('identifier').map(
                    (arr,key) => ({
                        'key': key,
                        'value': arr.map(i => i.value).reduce((a,b) => a+b, 0),
                        'points': arr.map(i => i.points).reduce((a,b) => a+b,0)
                    })).value()
                for (let st of summarized) {
                    gw_data.push({
                        'gw': e[0],
                        'id': e[1],
                        ...st
                    })
                }
            })
            return gw_data
        },
        user_stats_per_gw() {
            if (!this.ready) { return [] }
            let stats = this.stats_per_gw
            // let picks = this.team_data.map(i => i.picks)
            let user_picks = this.user_player_stats
            user_picks = user_picks.map(i=> ({'gw': i.gw, 'id': i.element, 'multiplier': i.multiplier})).filter(i => i.multiplier > 0)
            let stat_types = Object.keys(player_stat_types)

            let picked_stats = []
            for (let st of stat_types) {
                for (let pick of user_picks) {
                    let m = stats.find(i => i.key == st && i.gw == pick.gw && i.id == pick.id)
                    if (m != undefined) {
                        picked_stats.push({...m, 'multiplier': pick.multiplier, 'total_points': pick.multiplier * m.points})
                    }
                }
            }

            let total_non_bench = user_picks.filter(i => i.multiplier > 0)

            let gw_grouped = Object.fromEntries(_(picked_stats).groupBy('gw').map((i,k) => [k, _.groupBy(i, 'key')]).value())

            let type_grouped = _(picked_stats).groupBy('key').value()

            let pt_data = Object.entries(app.team_data).map(i => ({ 'gw': i[0], 'net_pts': i[1].entry_history.points - i[1].entry_history.event_transfers_cost, 'pts': i[1].entry_history.points, 'hit_pts': i[1].entry_history.event_transfers_cost}))

            let overall_total = getSum(pt_data.map(i => i.net_pts))

            return {
                'all_stats': picked_stats,
                'gw_grouped': gw_grouped,
                'type_grouped': type_grouped,
                'points': pt_data,
                'total_picks': total_non_bench.length,
                overall_total
            }
        },
        user_player_gws() {
            let team = this.team_data
            let all_picks = Object.entries(team).map(i => i[1].picks.map(j => ({'gw': i[0], 'id': j.element, 'multiplier': j.multiplier}))).flat()
            return all_picks
        },
        user_points_by_eltype() {
            let stats = this.user_player_stats;
            let values = stats.map(i => ({'id': i.element,  'eltype': i.raw.element_type, 'cost': i.raw.now_cost, 'total_points': (i.points || 0) * i.multiplier}))
            // values = _(values).groupBy('eltype').value()
            let price_categories = {
                1: [[50, 'Budget'], [55, 'Mid-Price'], [150, 'Premium']],
                2: [[50, 'Budget'], [60, 'Mid-Price'], [150, 'Premium']],
                3: [[75, 'Budget'], [100, 'Mid-Price'], [150, 'Premium']],
                4: [[75, 'Budget'], [100, 'Mid-Price'], [150, 'Premium']]
            }
            let grouped_vals = {
                1: {'Budget': 0, 'Mid-Price': 0, 'Premium': 0},
                2: {'Budget': 0, 'Mid-Price': 0, 'Premium': 0},
                3: {'Budget': 0, 'Mid-Price': 0, 'Premium': 0},
                4: {'Budget': 0, 'Mid-Price': 0, 'Premium': 0}
            }
            values.forEach((v) => {
                let type = v.eltype
                let price_cat = ''
                for (let c of price_categories[type]) {
                    if (v.cost < c[0]) {
                        price_cat = c[1];
                        break;
                    }
                }
                grouped_vals[type][price_cat] += parseInt(v.total_points)
            })

            let arr_vals = Object.keys(grouped_vals).map((eltype) => Object.keys(grouped_vals[eltype]).map((price_cat) => [element_type[eltype].short, price_cat, grouped_vals[eltype][price_cat]])).flat()

            return arr_vals

        }
    },
    methods: {
        fetch_team_picks() {
            this.ready = false
            $("#top_players_table").DataTable().destroy()
            this.top_players_table = undefined
            $("#gw_points_table").DataTable().destroy()
            this.gw_table = undefined

            this.team_data = {}
            let cache = {};
            let gw = 1;
            let calls = []
            for(gw=1; gw<39; gw++) {
                console.log('Fetching GW', gw);
                let current_gw = gw;
                let call = get_team_picks({
                    gw: current_gw,
                    team_id: app.team_id,
                    force_last_gw: false})
                .then((response) => {
                    app.$set(app.team_data, current_gw, response.body)
                })
                calls.push(call)
            }
            Promise.allSettled(calls).then(() => {
                setTimeout(() => {
                    app.$nextTick(() => {
                        app.ready = true
                        app.$nextTick(() => {
                            app.refresh_table()
                            app.draw_top_5()
                            app.draw_pos_heatmap()
                        })
                    })
                }, 500)
            });
        },
        draw_top_5() {
            let players = this.user_player_sum.slice(0, 3).reverse()
            for (let i of players) {
                draw_player_bar_chart("#player_charts", i.id)
            }

        },
        add_player_plot() {
            let pid = document.getElementById("new_player_id").value
            draw_player_bar_chart("#player_charts", pid)
        },
        draw_pos_heatmap() {
            draw_type_heatmap()
        },
        refresh_table() {
            
            this.top_players_table = $("#top_players_table").DataTable({
                "lengthChange": false,
                "order": [],
                "pageLength": 20,
                "info": false,
                fixedHeader: true,
                // fixedColumns: true,
                buttons: [
                    'copy', 'csv'
                ]
            })
            this.top_players_table.buttons().container()
                .appendTo('#csv_buttons');

            this.gw_table = $("#gw_points_table").DataTable({
                "lengthChange": false,
                "order": [],
                "pageLength": 38,
                "info": false,
                "paging": false,
                "searching": false,
                // fixedHeader: true,
                scrollY: '450px'
                // fixedColumns: true,
                // buttons: [
                //     'copy', 'csv'
                // ]
            })
            // this.gw_table.buttons().container()
            //     .appendTo('#csv_buttons2');
        }
    }
})

async function get_points() {
    return $.ajax({
        type: "GET",
        url: `data/${season}/points.json`,
        async: true,
        dataType: "json",
        success: (data) => {
            app.points_data = data;
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

async function fetch_main_data() {
    return get_fpl_main_data().then((data) => {
        app.el_data = data['elements'];
    })
}

function get_stat(gw, key) {
    return ((app.user_stats_per_gw.gw_grouped[gw] || {})[key] || [])
}

function get_names(gw, key) {
    let st = get_stat(gw,key)
    return st.map(ev => app.fpl_element[ev.id].web_name + (ev.value > 1 ? ` (${ev.value})` : '')).join(', ')
}



function draw_player_bar_chart(div_id, id) {

    if (!app.ready) { return }

    const raw_width = 500;
    const raw_height = 120;

    const margin = { top: 20, right: 20, bottom: 25, left: 20 },
    width = raw_width - margin.left - margin.right,
    height = raw_height - margin.top - margin.bottom;

    let raw_data = app.pid_gw_pts[id]
    let pts_data = Object.entries(raw_data); // app.pid_gw_pts[player_id]
    let min_y = Math.min(0, Math.min(...pts_data.map(i => i[1])))
    let max_y = Math.max(...pts_data.map(i => i[1])) + 4
    let max_x = Math.max( Math.max(...pts_data.map(i => i[0])), parseInt(gw) )

    let team_pick_gws = app.user_player_gws
    let user_gws = team_pick_gws.filter(i => i.id == id)
    let lineup_gws = user_gws.filter(i => i.id == id && i.multiplier > 0).map(i => i.gw)
    let bench_gws = user_gws.filter(i => i.id == id && i.multiplier == 0).map(i => i.gw)
    let captain_gws = user_gws.filter(i => i.id == id && i.multiplier > 1).map(i => [i.gw, i.multiplier, raw_data[i.gw]])

    let this_id = `player-svg-${id}`

    const svg = d3.select(div_id)
        // .append("svg")
        .insert("svg",":first-child")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .attr("id", `player-svg-${id}`)
        .append('g')
        .attr("transform",
             "translate(" + margin.left + "," + margin.top + ")");

    let x = d3.scaleBand()
        .range([ 0, width ])
        .domain(_.range(1, max_x+1))
        .padding(0.2);
    svg.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(x).tickSize(0));
    let x2 = d3.scaleBand()
        .range([ 0, width ])
        .domain(_.range(1, max_x+1))
        .padding(0);


    let y = d3.scaleLinear().domain([min_y, max_y]).range([height, 0])
    svg.append('g').call(d3.axisRight(y).tickSize(width).tickValues(d3.range(min_y, max_y, 4)))
            .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke", "#9a9a9a")
            )
            .call(g => g.selectAll(".tick text")
                .attr("x", -10)
                .attr("font-size", "5pt")
                .attr("fill", "#9a9a9a")
                .attr("text-anchor", "end"))
            
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))

    svg.call(s => s.selectAll(".tick").attr("font-size", "5pt").attr("fill", "white"))

    // zero line
    svg.append('g')
        .append('line')
        .attr('x1', x(0))
        .attr('y1', y(0))
        .attr('x2', width)
        .attr('y2', y(0))
        .style('stroke', 'white')
        .style("stroke-opacity", 0.5)
        .style("stroke-width", 1)
        .style('pointer-events', 'none');

    svg.selectAll()
        .data(lineup_gws)
        .enter()
        .append("rect")
        .attr("x", d => x2(d))
        .attr("y", d => y(max_y))
        .attr("width", d => x2.bandwidth())
        .attr("height", d => height - y(max_y))
        .attr("class", "lineup_bar")
    
    svg.selectAll()
        .data(bench_gws)
        .enter()
        .append("rect")
        .attr("x", d => x2(d))
        .attr("y", d => y(max_y))
        .attr("width", d => x2.bandwidth())
        .attr("height", d => height - y(max_y))
        .attr("class", "bench_bar")

    svg.selectAll()
    .data(pts_data)
    .enter()
    .append("rect")
        .attr("x", (d) => x(d[0]))
        .attr("y", (d) => d[1] > 0 ? y(d[1]) : y(0))
        .attr("width", x.bandwidth())
        .attr("height", (d) => d[1] > 0 ?  y(0) - y(d[1]) : y(d[1]) - y(0))
        .attr("class", "player_point_bar")

    svg.selectAll()
        .data(captain_gws)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "bottom")
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr("y", (d) => y(d[2] || 0) - 5)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text((d) => 'x' + d[1]);

    // Plot title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", width / 2)
        .attr("y", -5)
        .attr("font-size", "6pt")
        .attr("fill", "white")
        .text(`${app.fpl_element[id].web_name}`);

    // x-title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Gameweeks");

    // y-title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", -5)
        .attr("y", -3)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Points");

    // let cb = svg.append("g")

    mouseclick = (d) => {
        $('#' + this_id).remove()
    }

    svg.append("rect")
        .attr("x", width-20 )
        .attr("y", -20)
        .attr("width", 20)
        .attr("height", 20 )
        .attr("fill", "#00000050")
        .attr("class", "close_box")
        .on("click", mouseclick)

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", width-10 )
        .attr("y", -10)
        .attr("font-size", "6pt")
        .attr("fill", "white")
        .attr("class", "close_text")
        .text("X")

}

function draw_type_heatmap() {

    if (!app.ready) { return }

    const raw_width = 500;
    const raw_height = 400;

    const margin = { top: 20, right: 10, bottom: 5, left: 50 },
    width = raw_width - margin.left - margin.right,
    height = raw_height - margin.top - margin.bottom;

    let data = app.user_points_by_eltype
    let xvals = ["GK", "DF", "MD", "FW", "Total"]
    let yvals = ['Budget', 'Mid-Price', 'Premium', 'Total']
    let valmax = Math.max(...data.map(i => i[2]))
    let total = getSum(data.map(i => i[2]))

    const svg = d3.select("#type_heatmap")
        // .append("svg")
        .insert("svg",":first-child")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .append('g')
        .attr("transform",
             "translate(" + margin.left + "," + margin.top + ")");

    let x = d3.scaleBand()
        .range([ 0, width ])
        .domain(xvals)
        .padding(0.05);
    svg.append('g').call(d3.axisTop(x).tickSize(0)).select(".domain").remove();

    let y = d3.scaleBand()
        .range([ 0, height ])
        .domain(yvals)
        .padding(0.05);
    svg.append('g').call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

    svg.call(s => s.selectAll(".tick").attr("font-size", "8pt"))

    // var myColor = d3.scaleSequential()
    //     .interpolator(d3.interpolateBlues)
    //     .domain([0, valmax*1.3])

    var myColor = (d) => {
        let p = d3.interpolateRgb("#ffffff", "#6fcfd6")
        return p(d/valmax)
    }

    svg.selectAll()
        .data(data)
        .enter()
        .append("rect")
        .attr("x", function(d) { return x(d[0]) })
        .attr("y", function(d) { return y(d[1]) })
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("width", x.bandwidth() )
        .attr("height", y.bandwidth() )
        .style("fill", function(d) { return myColor(d[2])} )
        .style("stroke-width", 4)
        .style("stroke", "none")
        .style("opacity", 1)

    let text = svg.selectAll()
        .data(data)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x(d[0]) + x.bandwidth()/2)
        .attr("y", (d) => y(d[1]) + y.bandwidth()/2)
        .attr("dy", 0)
        .attr("font-size", "12pt");

    text.append("tspan")
        .text((d) => d[2])
        .attr("x", (d) => x(d[0]) + x.bandwidth()/2)
        .attr('dy', 0);
    text.append("tspan")
        // .attr('x', 0)
        .attr("x", (d) => x(d[0]) + x.bandwidth()/2)
        .attr('dy', 12)
        .text((d) => (100*d[2]/total).toFixed(0) + "%")
        .attr("font-size", "6pt");

    // Plot title
    // svg.append("text")
    //     .attr("text-anchor", "middle")
    //     .attr("x", width / 2)
    //     .attr("y", height + 5)
    //     .attr("font-size", "6pt")
    //     .text("Total points per price category and position");

    let pos_totals = _(data).groupBy(0).map((i,v) => [v, _.sumBy(i, 2)]).value();

    // Position sum
    let text2 = svg.selectAll()
        .data(pos_totals)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x(d[0]) + x.bandwidth()/2)
        .attr("y", (d) => y("Total") + y.bandwidth()/2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt");
    text2.append("tspan")
        .text((d) => d[1])
        .attr("x", (d) => x(d[0]) + x.bandwidth()/2)
        .attr('dy', 0);
    text2.append("tspan")
        // .attr('x', 0)
        .attr("x", (d) => x(d[0]) + x.bandwidth()/2)
        .attr('dy', 12)
        .text((d) => (100*d[1]/total).toFixed(1) + "%")
        .attr("font-size", "6pt");

    // Price cat sum
    let bud_totals = _(data).groupBy(1).map((i,v) => [v, _.sumBy(i, 2)]).value();

    let text3 = svg.selectAll()
        .data(bud_totals)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x("Total") + x.bandwidth()/2)
        .attr("y", (d) => y(d[0]) + y.bandwidth()/2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt");
    text3.append("tspan")
        .text((d) => d[1])
        .attr("x", (d) => x("Total") + x.bandwidth()/2)
        .attr('dy', 0);
    text3.append("tspan")
        // .attr('x', 0)
        .attr("x", (d) => x("Total") + x.bandwidth()/2)
        .attr('dy', 12)
        .text((d) => (100*d[1]/total).toFixed(1) + "%")
        .attr("font-size", "7pt");

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x("Total") + x.bandwidth()/2)
        .attr("y", (d) => y("Total") + y.bandwidth()/2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt")
        .text(total);

}




$(document).ready(() => {
    Promise.all([
        get_points(),
        fetch_main_data()
    ]).then((values) => {
        app.$nextTick(() => {
            console.log('READY!')
        })
    })
    .catch((error) => {
        console.error("An error has occured: " + error);
    });
})
