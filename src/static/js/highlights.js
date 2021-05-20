var app = new Vue({
    el: '#app',
    data: {
        season: season,
        team_id: '',
        points_data: {},
        team_data: {},
        el_data: [],
        ready: false,
        loading: false,
        top_players_table: undefined,
        gw_table: undefined,
        all_picks_table: undefined
    },
    computed: {
        is_ready() {
            return this.ready && (!_.isEmpty(this.team_data)) && (!_.isEmpty(this.points_data))
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
                let tot_pts = pts.reduce((a, b) => a + b, 0)
                return { 'gw': e[0], 'id': e[1], 'pts': tot_pts }
            })
            return pt_data
        },
        gw_pid_pts() {
            let pts_data = this.points_2d
            let gw_grouped = _.groupBy(pts_data, 'gw')
            Object.keys(gw_grouped).map((key, index) => { gw_grouped[key] = Object.fromEntries(gw_grouped[key].map(i => [i.id, i.pts])) })
            return gw_grouped
        },
        pid_gw_pts() {
            let pts_data = this.points_2d
            let id_grouped = _.groupBy(pts_data, 'id')
            Object.keys(id_grouped).map((key, index) => { id_grouped[key] = Object.fromEntries(id_grouped[key].map(i => [i.gw, i.pts])) })
            return id_grouped
        },
        fpl_element() {
            return Object.fromEntries(this.el_data.map(i => [i.id, i]))
        },
        user_player_stats() {
            if (!this.is_ready) { return [] }
            let gw_pid_pts = this.gw_pid_pts
            let fpl_data = this.fpl_element
            let picks = Object.entries(this.team_data).map(i => i[1].picks.map(j => ({ 'gw': i[0], ...j }))).flat()
            picks.forEach((p) => {
                p['points'] = ((gw_pid_pts[p.gw] || {})[p.element] || 0)
                p['raw'] = fpl_data[p.element]
            })
            return picks
        },
        user_player_sum() {
            if (!this.is_ready) { return [] }
            let picks = this.user_player_stats
            let grouped_pick_data = _(picks).groupBy('element').value()
            let grouped_all_stats = {}
            Object.keys(grouped_pick_data).map(key => {
                e = grouped_all_stats[key] = {}
                e['id'] = key
                e['squad_count'] = grouped_pick_data[key].length
                e['lineup_count'] = grouped_pick_data[key].filter(i => i.multiplier > 0).length
                e['points_total'] = grouped_pick_data[key].map(i => (i.points || 0) * i.multiplier).reduce((a, b) => a + b, 0)
                e['cap_count'] = grouped_pick_data[key].filter(i => i.multiplier > 1).length
                e['position'] = grouped_pick_data[key][0].raw.element_type
                e['name'] = grouped_pick_data[key][0].raw.web_name
                e['raw'] = grouped_pick_data[key][0].raw
            })
            let sorted_data = _.orderBy(grouped_all_stats, ['points_total', 'squad_count', 'lineup_count'], ['desc', 'desc', 'desc'])
            return sorted_data
        },
        user_toty() {
            if (!this.is_ready) { return [] }
            let player_sum_data = this.user_player_sum
            let selected_players = []
            let lineup_count = { 1: 0, 2: 0, 3: 0, 4: 0 }
            let squad_count = { 1: 0, 2: 0, 3: 0, 4: 0 }
            let selected_index = {}

            // Initial append for minimum valid formation
            for (let pos = 1; pos < 5; pos++) {
                let min_target = element_type[pos].min
                while (lineup_count[pos] < min_target) {
                    for (let i = 0; i < player_sum_data.length; i++) {
                        let p = player_sum_data[i]
                        if (p.position != pos) { continue }
                        selected_players.push({ 'player': p, 'lineup': true, 'position': pos, 'points_total': p['points_total'], 'cap_count': p['cap_count'] })
                        lineup_count[pos] += 1
                        squad_count[pos] += 1
                        selected_index[p.id] = true
                        if (lineup_count[pos] >= min_target) { break }
                    }
                    break;
                }
            }

            for (let i = 0; i < player_sum_data.length; i++) {
                let p = player_sum_data[i]
                let pos = p['position']
                if (selected_index[p.id]) { continue }
                if (lineup_count[pos] < element_type[pos].max && getSum(Object.values(lineup_count)) < 11) {
                    selected_players.push({ 'player': p, 'lineup': true, 'position': pos, 'points_total': p['points_total'], 'cap_count': p['cap_count'], 'is_keeper': pos == 1 })
                    lineup_count[pos] += 1
                    squad_count[pos] += 1
                } else if (squad_count[pos] < element_type[pos].cnt) {
                    selected_players.push({ 'player': p, 'lineup': false, 'position': pos, 'points_total': p['points_total'], 'cap_count': p['cap_count'], 'is_keeper': pos == 1 })
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
        stats_per_gw_detailed() {
            let stats = this.stats_2d
            let all_data = stats.map(i => i[2].map(j => j.stats.map(k => ({ 'gw': i[0], 'id': i[1], 'fixture': j.fixture, ...k })))).flat().flat()
            return all_data
        },
        user_picks_detailed() {
            let team_data = this.team_data
            let fpl_data = this.fpl_element
            let stat_detailed = this.stats_per_gw_detailed
            let all_team_picks = Object.keys(team_data).map(i => team_data[i].picks.map(j => ({ 'gw': i, ...j }))).flat()
            let pick_mult_map = all_team_picks.map(i => [i.gw + ',' + i.element, i.multiplier])
            let pick_mult = Object.fromEntries(pick_mult_map)
            let picked_stats = stat_detailed.filter(i => (i.gw + "," + i.id) in pick_mult)
            picked_stats.forEach((p) => {
                p.multiplier = pick_mult[p.gw + "," + p.id]
                p.total_points = p.points * p.multiplier
                p.eltype = fpl_data[p.id].element_type
                p.name = fpl_data[p.id].web_name
            })
            return picked_stats
        },
        user_picks_custom_stats() {
            let picked_stats = app.user_picks_detailed
            let clean_sheets = picked_stats.filter(i => i.eltype <= 2 && i.identifier == 'clean_sheets' && i.multiplier > 0)
            let defense_picks = _.cloneDeep(picked_stats.filter(i => i.eltype <= 2 && i.identifier == 'minutes' && i.multiplier > 0))
            for (let p of defense_picks) {
                let match = clean_sheets.filter(i => i.id == p.id && i.gw == p.gw && i.fixture == p.fixture)
                if (match.length != 0) { p.success = true;
                    p.returns = match[0].total_points } else { p.success = false;
                    p.returns = 0 }
            }
            let cs_stat = { 'count': clean_sheets.length, 'total': defense_picks.length, 'values': defense_picks, 'info': 'Rate of CS gains out of all GK and DF' }

            let goal_count = picked_stats.filter(i => i.eltype >= 3 && i.identifier == 'goals_scored' && i.multiplier > 0)
            let attack_picks = _.cloneDeep(picked_stats.filter(i => i.eltype >= 3 && i.identifier == 'minutes' && i.multiplier > 0))
            for (let p of attack_picks) {
                let match = goal_count.filter(i => i.id == p.id && i.gw == p.gw && i.fixture == p.fixture)
                if (match.length != 0) { p.success = true;
                    p.returns = match[0].total_points } else { p.success = false;
                    p.returns = 0 }
            }
            let goal_stat = { 'count': goal_count.length, 'total': attack_picks.length, 'values': attack_picks, 'info': 'Rate of goal returns out of all MD and FW' }

            let assists_count = picked_stats.filter(i => i.eltype >= 3 && i.identifier == 'assists' && i.multiplier > 0)
            let assist_attack_picks = _.cloneDeep(picked_stats.filter(i => i.eltype >= 3 && i.identifier == 'minutes' && i.multiplier > 0))
            for (let p of assist_attack_picks) {
                let match = assists_count.filter(i => i.id == p.id && i.gw == p.gw && i.fixture == p.fixture)
                if (match.length != 0) { p.success = true;
                    p.returns = match[0].total_points } else { p.success = false;
                    p.returns = 0 }
            }
            let assist_stat = { 'count': assists_count.length, 'total': assist_attack_picks.length, 'values': assist_attack_picks, 'info': 'Rate of assist returns out of all MD and FW' }

            let bonus_count = picked_stats.filter(i => i.identifier == 'bonus' && i.multiplier > 0)
            let all_count = _.cloneDeep(picked_stats.filter(i => i.identifier == 'minutes' && i.multiplier > 0))
            for (let p of all_count) {
                let match = bonus_count.filter(i => i.id == p.id && i.gw == p.gw && i.fixture == p.fixture)
                if (match.length != 0) { p.success = true;
                    p.returns = match[0].total_points } else { p.success = false;
                    p.returns = 0 }
            }
            let bonus_stat = { 'count': bonus_count.length, 'total': all_count.length, 'values': all_count, 'info': 'Rate of bonus returns out of all players' }

            let captain_pts = picked_stats.filter(i => i.multiplier > 1)
            let captain_game_pts = {}
            captain_pts.forEach((c) => {
                if (!(c.fixture in captain_game_pts)) { captain_game_pts[c.fixture] = 0 }
                captain_game_pts[c.fixture] += c.total_points
            })
            let non_blank_captain = Object.values(captain_game_pts).filter(i => i > 7)
            let captain_count = _.cloneDeep(picked_stats.filter(i => i.multiplier > 1 && i.identifier == 'minutes'))
            for (let p of captain_count) {
                let match = (captain_game_pts[p.fixture] || 0)
                if (match >= 7) { p.success = true; }
                p.returns = match
            }
            let captain_stat = { 'count': non_blank_captain.length, 'total': captain_count.length, 'values': captain_count, 'info': 'Rate of non-blanking (7+ pts) captain returns' }

            return { 'Clean Sheet': cs_stat, 'Goal': goal_stat, 'Assist': assist_stat, 'Bonus': bonus_stat, 'Captain': captain_stat }
        },
        stats_per_gw() {
            let stats = this.stats_2d
            let gw_data = []
            gw_data = []
            stats.forEach((e) => {
                let f = e[2].map(i => i.stats).flat()
                let summarized = _(f).groupBy('identifier').map(
                    (arr, key) => ({
                        'key': key,
                        'value': arr.map(i => i.value).reduce((a, b) => a + b, 0),
                        'points': arr.map(i => i.points).reduce((a, b) => a + b, 0)
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
            if (!this.is_ready) { return [] }
            let stats = this.stats_per_gw
                // let picks = this.team_data.map(i => i.picks)
            let user_picks = this.user_player_stats
            user_picks = user_picks.map(i => ({ 'gw': i.gw, 'id': i.element, 'multiplier': i.multiplier })).filter(i => i.multiplier > 0)
            let stat_types = Object.keys(player_stat_types)

            let picked_stats = []
            for (let st of stat_types) {
                for (let pick of user_picks) {
                    let m = stats.find(i => i.key == st && i.gw == pick.gw && i.id == pick.id)
                    if (m != undefined) {
                        picked_stats.push({...m, 'multiplier': pick.multiplier, 'total_points': pick.multiplier * m.points })
                    }
                }
            }

            let total_non_bench = user_picks.filter(i => i.multiplier > 0)

            let gw_grouped = Object.fromEntries(_(picked_stats).groupBy('gw').map((i, k) => [k, _.groupBy(i, 'key')]).value())

            let type_grouped = _(picked_stats).groupBy('key').value()

            let pt_data = Object.entries(app.team_data).map(i => ({ 'gw': i[0], 'net_pts': i[1].entry_history.points - i[1].entry_history.event_transfers_cost, 'pts': i[1].entry_history.points, 'hit_pts': i[1].entry_history.event_transfers_cost }))

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
            let all_picks = Object.entries(team).map(i => i[1].picks.map(j => ({ 'gw': i[0], 'id': j.element, 'multiplier': j.multiplier }))).flat()
            return all_picks
        },
        user_points_by_eltype() {
            let stats = this.user_player_stats;
            let values = stats.map(i => ({ 'id': i.element, 'eltype': i.raw.element_type, 'cost': i.raw.now_cost, 'total_points': (i.points || 0) * i.multiplier }))
                // values = _(values).groupBy('eltype').value()
            let price_categories = {
                1: [
                    [50, 'Budget'],
                    [55, 'Mid-Price'],
                    [150, 'Premium']
                ],
                2: [
                    [50, 'Budget'],
                    [60, 'Mid-Price'],
                    [150, 'Premium']
                ],
                3: [
                    [75, 'Budget'],
                    [100, 'Mid-Price'],
                    [150, 'Premium']
                ],
                4: [
                    [75, 'Budget'],
                    [100, 'Mid-Price'],
                    [150, 'Premium']
                ]
            }
            let grouped_vals = {
                1: { 'Budget': 0, 'Mid-Price': 0, 'Premium': 0 },
                2: { 'Budget': 0, 'Mid-Price': 0, 'Premium': 0 },
                3: { 'Budget': 0, 'Mid-Price': 0, 'Premium': 0 },
                4: { 'Budget': 0, 'Mid-Price': 0, 'Premium': 0 }
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
            this.loading = true
            this.ready = false
            $("#top_players_table").DataTable().destroy()
            this.top_players_table = undefined
            $("#gw_points_table").DataTable().destroy()
            this.gw_table = undefined
            $("#all_picks_per_stat").DataTable().destroy()
            this.all_picks_table = undefined

            this.team_data = {}
            let cache = {};
            let gw = 1;
            let calls = []
            for (gw = 1; gw < 39; gw++) {
                console.log('Fetching GW', gw);
                let current_gw = gw;
                let call = get_team_picks({
                        gw: current_gw,
                        team_id: app.team_id,
                        force_last_gw: false
                    })
                    .then((response) => {
                        app.$set(app.team_data, current_gw, response.body)
                    })
                calls.push(call)
            }
            Promise.allSettled(calls).then(() => {
                setTimeout(() => {
                    app.$nextTick(() => {
                        app.ready = true
                        app.loading = false
                        app.$nextTick(() => {
                            app.refresh_table()
                            app.draw_top_5()
                            app.draw_pos_heatmap()
                            app.draw_radar_svg()
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
        draw_radar_svg() {
            draw_radar_map()
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

            this.all_picks_table = $("#all_picks_per_stat").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
                // scrollY: '450px',
                // sScrollX: "100%",
                buttons: [
                    'copy', 'csv'
                ],
                initComplete: function() {
                    this.api().columns().every(function() {
                        var column = this;
                        var select = $('<select class="w-100"><option value=""></option></select>')
                            .appendTo($(column.footer()).empty())
                            .on('change', function() {
                                var val = $.fn.dataTable.util.escapeRegex(
                                    $(this).val()
                                );

                                column
                                    .search(val ? '^' + val + '$' : '', true, false)
                                    .draw();
                            });

                        column.data().unique().sort((a, b) => parseInt(a) ? parseInt(a) - parseInt(b) : (a > b ? 1 : -1)).each(function(d, j) {
                            select.append('<option value="' + d + '">' + d + '</option>')
                        });

                    });
                }
            })
            this.all_picks_table.buttons().container()
                .appendTo('#csv_buttons3');

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
    let st = get_stat(gw, key)
    return st.map(ev => app.fpl_element[ev.id].web_name + (ev.value > 1 ? ` (${ev.value})` : '')).join(', ')
}



function draw_player_bar_chart(div_id, id) {

    if (!app.is_ready) { return }

    const raw_width = 500;
    const raw_height = 120;

    const margin = { top: 20, right: 20, bottom: 25, left: 20 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;

    let raw_data = app.pid_gw_pts[id] || []
    let pts_data = Object.entries(raw_data); // app.pid_gw_pts[player_id]
    let min_y = Math.min(0, Math.min(...pts_data.map(i => i[1])))
    let max_y = Math.max(Math.max(...pts_data.map(i => i[1])) + 4, 6)
    let max_x = Math.max(Math.max(...pts_data.map(i => i[0])), parseInt(gw))

    let team_pick_gws = app.user_player_gws
    let user_gws = team_pick_gws.filter(i => i.id == id)
    let lineup_gws = user_gws.filter(i => i.id == id && i.multiplier > 0).map(i => i.gw)
    let bench_gws = user_gws.filter(i => i.id == id && i.multiplier == 0).map(i => i.gw)
    let captain_gws = user_gws.filter(i => i.id == id && i.multiplier > 1).map(i => [i.gw, i.multiplier, raw_data[i.gw]])

    let this_id = `player-svg-${id}`

    const svg = d3.select(div_id)
        // .append("svg")
        .insert("svg", ":first-child")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .attr("id", `player-svg-${id}`)
        .append('g')
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    let x = d3.scaleBand()
        .range([0, width])
        .domain(_.range(1, max_x + 1))
        .padding(0.2);
    svg.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(x).tickSize(0));
    let x2 = d3.scaleBand()
        .range([0, width])
        .domain(_.range(1, max_x + 1))
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
        .attr("height", (d) => d[1] > 0 ? y(0) - y(d[1]) : y(d[1]) - y(0))
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
        .attr("x", width - 20)
        .attr("y", -20)
        .attr("width", 20)
        .attr("height", 20)
        .attr("fill", "#00000050")
        .attr("class", "close_box")
        .on("click", mouseclick)

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", width - 10)
        .attr("y", -10)
        .attr("font-size", "6pt")
        .attr("fill", "white")
        .attr("class", "close_text")
        .text("X")

}

function draw_type_heatmap() {

    if (!app.is_ready) { return }

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
        .insert("svg", ":first-child")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .append('g')
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    let x = d3.scaleBand()
        .range([0, width])
        .domain(xvals)
        .padding(0.05);
    svg.append('g').call(d3.axisTop(x).tickSize(0)).select(".domain").remove();

    let y = d3.scaleBand()
        .range([0, height])
        .domain(yvals)
        .padding(0.05);
    svg.append('g').call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

    svg.call(s => s.selectAll(".tick").attr("font-size", "8pt"))

    // var myColor = d3.scaleSequential()
    //     .interpolator(d3.interpolateBlues)
    //     .domain([0, valmax*1.3])

    var myColor = (d) => {
        let p = d3.interpolateRgb("#ffffff", "#6fcfd6")
        return p(d / valmax)
    }

    svg.selectAll()
        .data(data)
        .enter()
        .append("rect")
        .attr("x", function(d) { return x(d[0]) })
        .attr("y", function(d) { return y(d[1]) })
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", function(d) { return myColor(d[2]) })
        .style("stroke-width", 4)
        .style("stroke", "none")
        .style("opacity", 1)

    let text = svg.selectAll()
        .data(data)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr("y", (d) => y(d[1]) + y.bandwidth() / 2)
        .attr("dy", 0)
        .attr("font-size", "12pt");

    text.append("tspan")
        .text((d) => d[2])
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr('dy', 0);
    text.append("tspan")
        // .attr('x', 0)
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr('dy', 12)
        .text((d) => (100 * d[2] / total).toFixed(0) + "%")
        .attr("font-size", "6pt");

    // Plot title
    // svg.append("text")
    //     .attr("text-anchor", "middle")
    //     .attr("x", width / 2)
    //     .attr("y", height + 5)
    //     .attr("font-size", "6pt")
    //     .text("Total points per price category and position");

    let pos_totals = _(data).groupBy(0).map((i, v) => [v, _.sumBy(i, 2)]).value();

    // Position sum
    let text2 = svg.selectAll()
        .data(pos_totals)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr("y", (d) => y("Total") + y.bandwidth() / 2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt");
    text2.append("tspan")
        .text((d) => d[1])
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr('dy', 0);
    text2.append("tspan")
        // .attr('x', 0)
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr('dy', 12)
        .text((d) => (100 * d[1] / total).toFixed(1) + "%")
        .attr("font-size", "6pt");

    // Price cat sum
    let bud_totals = _(data).groupBy(1).map((i, v) => [v, _.sumBy(i, 2)]).value();

    let text3 = svg.selectAll()
        .data(bud_totals)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x("Total") + x.bandwidth() / 2)
        .attr("y", (d) => y(d[0]) + y.bandwidth() / 2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt");
    text3.append("tspan")
        .text((d) => d[1])
        .attr("x", (d) => x("Total") + x.bandwidth() / 2)
        .attr('dy', 0);
    text3.append("tspan")
        // .attr('x', 0)
        .attr("x", (d) => x("Total") + x.bandwidth() / 2)
        .attr('dy', 12)
        .text((d) => (100 * d[1] / total).toFixed(1) + "%")
        .attr("font-size", "7pt");

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("x", (d) => x("Total") + x.bandwidth() / 2)
        .attr("y", (d) => y("Total") + y.bandwidth() / 2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt")
        .text(total);

}

function draw_radar_map() {
    if (!app.is_ready) { return }

    const raw_width = 600;
    const raw_height = 400;

    // bottom will be 40 when added new players
    const margin = { top: 10, right: 30, bottom: 10, left: 30 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;
    let margin_common = 40

    let center = { x: width / 2, y: height / 2 }

    const svg = d3.select("#manager_comparison")
        .insert("svg", ":first-child")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    let raw_data = app.user_picks_custom_stats
    let data = [Object.entries(app.user_picks_custom_stats).map(i => ({'stat': i[0], 'value': i[1].count / i[1].total*100}))]
    const names = ["You"]

    const maxvals = { 'Clean Sheet': 45, 'Goal': 35, 'Assist': 25, 'Bonus': 30, 'Captain': 70 }
    // const names = ["Sertalp", "Fabio"]
    // const data = [
    //     [
    //         { 'stat': 'Clean Sheet', 'value': 39.33 },
    //         { 'stat': 'Goal', 'value': 27.34 },
    //         { 'stat': 'Assist', 'value': 20.31 },
    //         { 'stat': 'Bonus', 'value': 20.74 },
    //         { 'stat': 'Captain', 'value': 60.47 }
    //     ],
    //     [
    //         { 'stat': 'Clean Sheet', 'value': 40.98 },
    //         { 'stat': 'Goal', 'value': 33.85 },
    //         { 'stat': 'Assist', 'value': 21.79 },
    //         { 'stat': 'Bonus', 'value': 26.59 },
    //         { 'stat': 'Captain', 'value': 63.64 }
    //     ]
    // ]

    data.forEach((d) => { d.forEach((s) => { s.perc = s.value / maxvals[s.stat] }) })

    let axesDomain = data[0].map(i => i.stat)

    let dotRadius = 4
    let axisCircles = 5
    let radius = (height - (margin_common * 2)) / 2
    let axesLength = data[0].length
    let angleSlice = Math.PI * 2 / axesLength
    let axisLabelFactor = 1.20
    let maxValue = 1
    let rScale = d3.scaleLinear()
        .domain([0, maxValue])
        .range([0, radius])
    let radarLine = d3.lineRadial()
        .curve(d3['curveLinearClosed'])
        .radius(d => rScale(d))
        .angle((_, i) => i * angleSlice)
    let color = d3.scaleOrdinal()
        .range(["#EDC951", "#CC333F", "#00A0B0"])

    var axisGrid = svg.append("g")
        .attr("class", "axisWrapper");

    axisGrid.selectAll(".levels")
        .data(d3.range(1, (axisCircles + 1)).reverse())
        .enter()
        .append("circle")
        .attr("class", "gridCircle")
        .attr("cx", width / 2)
        .attr("cy", height / 2)
        .attr("r", (d, i) => radius / axisCircles * d)
        .style("fill", "#CDCDCD")
        .style("stroke", "#CDCDCD")
        .style("fill-opacity", 0.1);

    
    const axis = axisGrid.selectAll(".axis")
        .data(axesDomain)
        .enter()
        .append("g")
        .attr("class", "axis");

    axis.append("line")
        .attr("x1", center.x)
        .attr("y1", center.y)
        .attr("x2", (d, i) => rScale(maxValue * 1.1) * Math.cos(angleSlice * i - Math.PI / 2) + center.x)
        .attr("y2", (d, i) => rScale(maxValue * 1.1) * Math.sin(angleSlice * i - Math.PI / 2) + center.y)
        .attr("class", "line")
        .style("stroke", "#474747")
        .style("stroke-width", "2px");

    axis.append("text")
        .attr("class", "legend")
        .style("font-size", "10px")
        .attr("text-anchor", "middle")
        .attr("font-family", "sans-serif")
        .attr("fill", "white")
        .attr("dy", "0.35em")
        .attr("x", (d, i) => rScale(maxValue * axisLabelFactor) * Math.cos(angleSlice * i - Math.PI / 2) + center.x)
        .attr("y", (d, i) => rScale(maxValue * axisLabelFactor) * Math.sin(angleSlice * i - Math.PI / 2) + center.y)
        .text(d => d);

    axis.selectAll()
        // .data((d) => ({...d, 'c': d3.range(1, (axisCircles + 1)).reverse()}))
        // .enter()
        .data((d,j) => d3.range(1, axisCircles + 1).map(i => ({i, 'd': d, 'j': j})))
        .enter()
        .append("text")
        .attr("x", (d) => rScale(maxValue * d.i/axisCircles) * Math.cos(angleSlice * d.j - Math.PI / 2) + center.x)
        .attr("text-anchor", "start")
        .attr("y", (d) => rScale(maxValue * d.i/axisCircles) * Math.sin(angleSlice * d.j - Math.PI / 2) + center.y)
        .attr("alignment-baseline", "middle")
        .attr("fill", "white")
        .attr("font-size", "8px")
        // .attr("class", "white-shadow")
        .text((d, i) => d.i/axisCircles*maxvals[d.d] + "%")


    const plots = svg.append('g')
        .selectAll('g')
        .data(data)
        .join('g')
        .attr("data-name", (d, i) => names[i])
        .attr("fill", "none")
        .attr("stroke", "steelblue");

    plots.append('path')
        .attr("d", d => radarLine(d.map(v => v.perc)))
        .attr("fill", (d, i) => color(i))
        .attr("fill-opacity", 0.1)
        .attr("stroke", (d, i) => color(i))
        .attr("stroke-width", 2)
        .attr("transform", "translate(" + center.x + "," + center.y + ")");

    plots.selectAll("circle")
        .data((d, j) => d.map(i => ({...i, 'order': j })))
        .join("circle")
        .attr("r", dotRadius)
        .attr("cx", (d, i) => rScale(d.perc) * Math.cos(angleSlice * i - Math.PI / 2) + center.x)
        .attr("cy", (d, i) => rScale(d.perc) * Math.sin(angleSlice * i - Math.PI / 2) + center.y)
        .style("fill-opacity", 0.8)
        .attr("stroke", "none")
        .attr("fill", (d, i) => color(d.order));

    let legend_y = raw_height - margin.bottom - 10

    let legend = svg.append('g')
    let props = { 'sep': 130, 'constant': 10, 'text_margin': 25, 'width': 20, 'height': 10 }
    let initial_x = (width - (data.length * props.sep)) / 2

    // legend
    //     .append("rect")
    //     .attr("x", initial_x - 10)
    //     .attr("y", legend_y - 10)
    //     .attr("width", data.length * props.sep + 20)
    //     .attr("height", props.height + 20)
    //     .attr("fill", "black")
    //     .attr("opacity", 0.4)

    // legend.selectAll()
    //     .data(names)
    //     .enter()
    //     .append("rect")
    //     .attr("x", (d, i) => props.sep * i + initial_x)
    //     .attr("y", legend_y)
    //     .attr("width", props.width)
    //     .attr("height", props.height)
    //     .attr("stroke", "white")
    //     .attr("fill", (d, i) => color(i))

    // legend.selectAll()
    //     .data(names)
    //     .enter().append("text")
    //     .attr("x", (d, i) => props.sep * i + initial_x + props.text_margin)
    //     .attr("y", legend_y + props.height / 2)
    //     .attr("alignment-baseline", "middle")
    //     .attr("fill", "white")
    //     .attr("font-size", "10px")
    //     .attr("class", "white-shadow")
    //     .text((d, i) => d)

}


$(document).ready(() => {
    Promise.all([
            get_points(),
            fetch_main_data()
        ]).then((values) => {
            Vue.$cookies.config('120d')
            app.$nextTick(() => {
                console.log('READY!')
                let cached_team = Vue.$cookies.get('team_id')
                if (cached_team !== null) {
                    app.team_id = cached_team;
                    app.$nextTick(() => {
                        app.fetch_team_picks()
                    })
                }
            })
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
})