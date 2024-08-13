var app = new Vue({
    el: '#app',
    data: {
        ready: false,
        team_id: '',
        loading: false,
        calculating: false,
        sc_files: sc_files,
        active_sc: 0,
        sc_details: undefined,
        sc_game_details: undefined,
        main_data: undefined,
        fixture_data: undefined,
        team_data: undefined,
        // lineup: [],
        // bench: [],
        picked_out: undefined,
        picked_out_rival: undefined,
        player_filter: undefined,
        player_filter_rival: undefined,
        swap_out: undefined,
        swap_out_rival: undefined,
        trigger: 0,
        active_rep: undefined,
        display_paste: false,
        active_sample: 0,
        samples: ["FPL Data"],
        sample_gw: undefined,
        sample_data: [],
        use_eo: false,
        custom_ownership: [],
        rival_mode: false,
        rival_id: '',
        rival_data: undefined,
        page_link: '',
        // options
        show_outcomes: true,
        show_field: false,
        show_diff: true,
        show_diff_rival: true,
        tick: 300,
        my_penalty: 0,
        rival_penalty: 0,
        show_gw_result: false,
        selected_id: undefined,
        target_pts: undefined,
        sort_method: 'avg'
    },
    computed: {
        current_gw() {
            let name = this.sc_files[this.active_sc]
            return parseInt(name[0].split("GW")[1])
        },
        is_next_gw() {
            return this.active_sc == 0
        },
        grouped_sc() {
            if (_.isEmpty(this.sc_details)) { return {} }
        },
        picks() {
            if (_.isEmpty(this.team_data)) { return [] }
            return this.team_data.picks
        },
        elements() {
            if (_.isEmpty(this.main_data)) { return undefined }
            return this.main_data.elements
        },
        fixture_dict() {
            // for active gw: team -> rivals
            if (_.isEmpty(this.fixture_data)) { return undefined }
            let gw_fixtures = this.fixture_data.filter(i => i.event == this.current_gw)
            let teams = this.teams
            let fix_dict = {}
            teams.forEach((t) => {
                fix_dict[t.id] = {}
                let v = fix_dict[t.id]
                let team_fix = gw_fixtures.filter(i => i.team_h == t.id || i.team_a == t.id)
                v.games = team_fix
                let game_str = team_fix.map(i => i.team_h == t.id ? teams_ordered[i.team_a - 1].short.toUpperCase() : teams_ordered[i.team_h - 1].short.toLowerCase())
                v.str = game_str.join(" + ")
            })

            return fix_dict
        },
        elements_dict() {
            if (_.isEmpty(this.elements)) { return {} }
            let els = this.elements
            let el_dict = Object.fromEntries(els.map(i => [i.id, i]))
            return el_dict
        },
        teams() {
            if (_.isEmpty(this.main_data)) { return undefined }
            return this.main_data.teams
        },
        lineup() {
            return this.team_picks.filter(i => i.multiplier > 0)
        },
        bench() {
            return this.team_picks.filter(i => i.multiplier == 0)
        },
        team_picks() {
            if (_.isEmpty(this.team_data)) { return [] }
            if (_.isEmpty(this.sc_details)) { return [] }
            let td = this.team_data
            let picks = td.picks
            picks.forEach(p => {
                p.data = app.elements.find(i => i.id == p.element)
                debugger
                // p.img = "https://resources.premierleague.com/premierleague/photos/players/110x140/p" + p.data.photo.replace(".jpg", ".png")
                p.img = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.data.team_code}${p.data.element_type == 1 ? '_1' : ''}-110.png`
            })
            let lineup = picks.filter(i => i.multiplier > 0)
            let bench = picks.filter(i => i.multiplier == 0)
            lineup.forEach((p, idx) => {
                p.x = this.get_lineup_x(lineup, p, idx)
                p.y = (p.data.element_type - 1) * 34 + 5

            })
            bench.forEach((p, idx) => {
                p.x = this.get_bench_x(idx)
                p.y = 4 * 35 + 2
            })
            return picks
        },
        team_ready() {
            return !_.isEmpty(this.team_picks)
        },
        rival_ready() {
            return !_.isEmpty(this.rival_picks)
        },
        rival_picks() {
            if (_.isEmpty(this.rival_data)) { return [] }
            if (_.isEmpty(this.sc_details)) { return [] }
            let td = this.rival_data
            let picks = td.picks
            picks.forEach(p => {
                p.data = app.elements.find(i => i.id == p.element)
                // p.img = "https://resources.premierleague.com/premierleague/photos/players/110x140/p" + p.data.photo.replace(".jpg", ".png")
                p.img = `https://fantasy.premierleague.com/dist/img/shirts/standard/shirt_${p.data.team_code}${p.data.element_type == 1 ? '_1' : ''}-110.png`
            })
            let lineup = picks.filter(i => i.multiplier > 0)
            let bench = picks.filter(i => i.multiplier == 0)
            lineup.forEach((p, idx) => {
                p.x = this.get_lineup_x(lineup, p, idx)
                p.y = (p.data.element_type - 1) * 34 + 5
            })
            bench.forEach((p, idx) => {
                p.x = this.get_bench_x(idx)
                p.y = 4 * 35 + 2
            })
            return picks
        },
        ownership_rates() {
            if (_.isEmpty(this.elements)) { return [] }
            if (this.active_sample == 'custom' && _.isEmpty(this.custom_ownership)) { return [] }
            if (!_.isEmpty(this.custom_ownership) && this.active_sample == 'custom') {
                return this.custom_ownership
            } else {
                let sample_selection = this.samples[this.active_sample]
                let own_data = get_ownership_by_type(reverse_sample_name(sample_selection), this.elements, this.sample_data, {})
                return Object.freeze(own_data.data)
            }

        },
        ownership_rate_dict() {
            let or = this.ownership_rates
            return Object.fromEntries(or.map(i => [i.id, this.use_eo ? (i.effective_ownership || i.selected_by_percent) : i.selected_by_percent]))
        },
        grouped_scenarios() {
            if (_.isEmpty(this.sc_details)) { return {} }
            return _(this.sc_details).groupBy('sim').map((value, key) => { return { 'sim': key, 'values': Object.fromEntries(value.map(i => [i.ID, i])) } }).value()
        },
        grouped_scenario_with_field() {
            if (_.isEmpty(this.sc_details)) { return [] }
            if (_.isEmpty(this.grouped_scenarios)) { return [] }
            let grouped_scenarios = this.grouped_scenarios
            let elements = this.elements
            let ownership = this.ownership_rates
            let use_eo = this.use_eo
            ownership = Object.fromEntries(ownership.map(i => [i.id, use_eo ? (i.effective_ownership || i.selected_by_percent) : i.selected_by_percent]))
            grouped_scenarios.forEach((s, i) => {
                let field = 0
                elements.forEach(p => {
                    let player_score = (s.values[p.id] && s.values[p.id].Points) || 0
                    field += parseInt(player_score) * (parseFloat(ownership[p.id]) / 100)
                })
                s.total_field = field
            })
            console.log("CALC")
            return grouped_scenarios
        },
        scenario_evals() {
            if (_.isEmpty(this.team_data)) { return [] }
            if (_.isEmpty(this.sc_details)) { return [] }
            if (_.isEmpty(this.team_picks)) { return {} }
            let picks = this.team_picks
            let pen = this.my_penalty

            grouped_scenarios = this.evaluate_scenarios(picks, pen)

            return grouped_scenarios
        },
        scenario_evals_rival() {
            if (_.isEmpty(this.rival_data)) { return [] }
            if (_.isEmpty(this.sc_details)) { return [] }
            if (_.isEmpty(this.rival_picks)) { return {} }
            let picks = this.rival_picks
            let pen = this.rival_penalty

            grouped_scenarios = this.evaluate_scenarios(picks, pen)

            return grouped_scenarios
        },
        scenario_head_2_head() {
            if (_.isEmpty(this.scenario_evals)) { return {} }
            if (_.isEmpty(this.scenario_evals_rival)) { return {} }
            let t1 = _.cloneDeep(this.scenario_evals)
            let t2 = _.cloneDeep(this.scenario_evals_rival)

            let h2h = _.range(t1.length).map(i => [t1[i].total_score, t2[i].total_score])


            return {
                'win': h2h.filter(i => i[0] > i[1]).length,
                'tie': h2h.filter(i => i[0] == i[1]).length,
                'loss': h2h.filter(i => i[0] < i[1]).length,
                'mean': _.mean(h2h.map(i => i[0] - i[1])),
                'max': _.max(h2h.map(i => i[0] - i[1])),
                'min': _.min(h2h.map(i => i[0] - i[1]))
            }
        },
        scenario_stats() {
            if (_.isEmpty(this.team_picks)) { return {} }
            if (_.isEmpty(this.scenario_evals)) { return {} }
            let evals = this.scenario_evals

            let stats = this.get_eval_stats(evals)
            return stats
        },
        scenario_stats_rival() {
            if (_.isEmpty(this.rival_picks)) { return {} }
            if (_.isEmpty(this.scenario_evals_rival)) { return {} }
            let evals = this.scenario_evals_rival

            let stats = this.get_eval_stats(evals)
            return stats
        },
        team_ids() {
            if (_.isEmpty(this.team_data)) { return [] }
            return this.team_data.picks.map(i => i.element)
        },
        rival_ids() {
            if (_.isEmpty(this.rival_data)) { return [] }
            return this.rival_data.picks.map(i => i.element)
        },
        graph_update_watch() {
            this.refresh_histogram()
            let t = this.scenario_evals
            return []
        },
        current_rep_dict() {
            if (_.isEmpty(this.grouped_scenarios)) { return {} }
            if (this.active_rep == undefined) { return [] }
            return this.grouped_scenarios[this.active_rep].values
        },
        target_pts_range() {
            if (_.isEmpty(this.sc_details)) { return [] }
            return _.range(0, _.max(this.sc_details.map(i => parseInt(i.Points))))
        },
        current_rep_players() {
            if (_.isEmpty(this.grouped_scenarios)) { return [] }
            if (this.active_rep == undefined) { return [] }
            let el_dict = this.elements_dict
            let my_players = this.current_rep_team
            let ownership = this.ownership_rate_dict
            let players = _.cloneDeep(Object.values(this.current_rep_dict))
            players.forEach(p => {
                p.data = el_dict[parseInt(p.ID)]
                if (p.data == undefined) {
                    debugger
                }
                let match = my_players.find(i => i.element == p.ID)
                p.eff_points = (p.Points * ((match == undefined ? 0 : match.multiplier) - ownership[p.ID] / 100)).toFixed(2)
            })
            players = players.filter(i => i.data !== undefined)
            return players
        },
        current_rep_team() {
            if (_.isEmpty(this.scenario_evals)) { return [] }
            if (this.active_rep == undefined) { return [] }
            return this.scenario_evals[this.active_rep].picks
        },
        current_rep_values() {
            if (_.isEmpty(this.scenario_evals)) { return [] }
            if (this.active_rep == undefined) { return [] }
            return this.scenario_evals[this.active_rep]
        },
        active_rep_comp: {
            get() {
                return this.active_rep
            },
            set(v) {
                $("#top_players").DataTable().destroy()
                this.active_rep = v
                this.$nextTick(() => {
                    let table = $("#top_players").DataTable({
                        "order": [5],
                        "lengthChange": false,
                        "pageLength": 15,
                        "searching": true,
                        "info": false,
                        "paging": true,
                        "columnDefs": []
                    });
                    table.cells("td").invalidate().draw();
                })
            }
        },
        sc_game_averages() {
            let sc = this.sc_game_details
            if (sc == undefined) { return [] }

            let game_details = []
            for (let scenario of this.sc_game_details) {
                for (let game of scenario.details) {
                    let key = game['home'].code + ',' + game['away'].code
                    let match = game_details.find(i => i.key == key)
                    if (match == undefined) {
                        match = { 'key': key, 'home': game['home'], 'away': game['away'], entries: { 'home': [], 'away': [] } }
                        game_details.push(match)
                    }
                    match.entries.home.push(game.score.home)
                    match.entries.away.push(game.score.away)
                }
            }
            for (let g of game_details) {
                g.home_avg = _.sum(g.entries.home) / (g.entries.home.length)
                g.away_avg = _.sum(g.entries.away) / (g.entries.away.length)
                g.home_win = _.range(g.entries.home.length).map(i => g.entries.home[i] > g.entries.away[i] ? 1 : 0)
                g.tie = _.range(g.entries.home.length).map(i => g.entries.home[i] == g.entries.away[i] ? 1 : 0)
                g.away_win = _.range(g.entries.home.length).map(i => g.entries.home[i] < g.entries.away[i] ? 1 : 0)
                g.home_win_avg = _.sum(g.home_win) / g.entries.home.length
                g.away_win_avg = _.sum(g.away_win) / g.entries.away.length
                g.tie_avg = _.sum(g.tie) / g.entries.home.length
                g.home_cs = g.entries.away.filter(i => i == 0).length / g.entries.away.length
                g.away_cs = g.entries.home.filter(i => i == 0).length / g.entries.home.length
            }
            return game_details
        },
        sorted_player_list() {
            if (this.elements == []) { return [] }
            let e = _.cloneDeep(this.elements)
            e.forEach((v) => { v.selected_by_percent = parseFloat(v.selected_by_percent) })
            return _.orderBy(e, 'selected_by_percent', 'desc')
        },
        sc_player_averages() {
            if (_.isEmpty(this.sc_game_details)) { return {} }

            let sc = this.sc_game_details
            let sums = []

            sc.forEach((e) => {
                let players = _.mapValues(_.groupBy(e.details.map(i => Object.entries(_.merge(i.points.away, i.points.home))).flat(), '0'), v => v.map(j => j[1]))
                let player_sum = _.mapValues(players, v => _.sum(v))
                sums.push(Object.entries(player_sum))
            })

            let total_avg = _.mapValues(_.groupBy(sums.flat(), '0'), v => _.sum(v.map(j => j[1])) / sc.length)
            let total_pps = _.mapValues(_.groupBy(sums.flat(), '0'), v => _.sum(v.map(j => j[1])) / v.length)
            let total_app = _.mapValues(_.groupBy(sums.flat(), '0'), v => v.length)
            return { avg: total_avg, pps: total_pps, app: total_app }
        },
        sc_player_avg_full () {
            if (_.isEmpty(this.sc_game_details)) { return {} }
            let sca = this.sc_player_averages
            let player_ids = this.main_data.elements.map(i => i.id)
            let pts_dict = {}
            player_ids.forEach((p) => {
                pts_dict[p] = {
                    'avg': sca.avg[p] ? _.round(sca.avg[p],1) : "-",
                    'pps': sca.pps[p] ? _.round(sca.pps[p],1) : "-"
                }
            })
            return Object.freeze(pts_dict)
        },
        sc_player_data() {
            if (_.isEmpty(this.sc_game_details)) { return [] }
            let sc_d = this.sc_details
            player_ids = this.elements.map(i => i.id)
            data = {}
            let sc_count = _.uniq(sc_d.map(i => i.sim)).length
            let target_pts = this.target_pts
            for (let pid of player_ids) {
                let entries = sc_d.filter(i => i.ID == pid)
                let vals = entries.map(i => parseInt(i.Points))
                let total_pts = _.sum(vals)
                let avg_pts = total_pts / sc_count
                let avg_90 = _.mean(vals)
                let q = jStat.quantiles(vals, [0, 0.25, 0.5, 0.75, 1])
                let tp = NaN
                if (target_pts != undefined) {
                    tp = vals.filter(j => j >= target_pts).length / sc_count
                }
                data[pid] = {'id': pid, 'web_name': this.elements_dict[pid].web_name, 'entries': entries, 'play_prob': entries.length/sc_count, 'values': vals, 'avg': avg_pts, 'avg90': avg_90, 'q0': q[0], 'q25': q[1], 'q50': q[2], 'q75': q[3], 'q100': q[4], 'tp': tp}
            }
            let ldata = Object.values(data)
            return ldata
        },
        sc_data_sorted() {
            if (_.isEmpty(this.sc_player_data)) { return [] }
            let sort_method = this.sort_method
            ldata = _.orderBy(this.sc_player_data, [i => i.play_prob > 0.5 ? 1 : 0, i => isNaN(i[sort_method]) ? -100 : 1, i => i[sort_method]], ['desc', 'desc', 'desc'])
            return ldata
        }
    },
    methods: {
        activate_gw(gw) {
            if (gw) {
                for (const i in sc_files) {
                    if (sc_files[i][0].split('GW')[1] == gw) {
                        this.active_sc = i
                    }
                }
            }
            setTimeout(() => {
                update_sim_values()
            }, 200)
            
        },
        suggestTeam(key) {
            if (_.isEmpty(this[key])) { return }
            let pids = this[key].picks.map(i => i.element)
            let xp_data = Object.fromEntries(pids.map(i => [i, [this.sc_player_averages.avg[i] || 0, (this.sc_player_averages.app[i] > 70 || 0) ? 1 : 0, this.sc_player_averages.pps[i] || 0]]))
            this[key] = createTeamFromList(false, pids, undefined, undefined, undefined, this.elements_dict, xp_data)
            this.loading = false
            this.refresh_histogram()
        },
        set_team_with_url(sorted, picks, cap, vice_cap, tc, gw) {
            if (gw) {
                for (const i in sc_files) {
                    if (sc_files[i][0].split('GW')[1] == gw) {
                        this.active_sc = i
                    }
                }
            }
            let pids = this.elements.map(i => i.id)
            let xp_data = Object.fromEntries(pids.map(i => [i, [this.sc_player_averages.avg[i] || 0, (this.sc_player_averages.app[i] > 70 || 0) ? 1 : 0, this.sc_player_averages.pps[i] || 0]]))
            this.team_data = createTeamFromList(sorted, picks, cap, vice_cap, tc, this.elements_dict, xp_data)
            this.loading = false
            this.refresh_histogram()
        },
        fetch_team_picks() {
            this.team_data = undefined
            this.lineup = []
            this.bench = []
            let target_gw = this.current_gw
            if (this.is_next_gw) {
                target_gw = this.current_gw - 1
            }
            this.loading = true
            get_team_picks({ gw: target_gw, team_id: this.team_id, force_last_gw: false }).then((response) => {
                if (app.is_next_gw && response.body.active_chip !== undefined && response.body.active_chip == 'freehit') {
                    get_team_picks({ gw: target_gw - 1, team_id: this.team_id, force_last_gw: false }).then((response) => {
                        app.team_data = response.body
                        app.team_data.picks.forEach(p => {
                            if (p.multiplier > 2 && this.is_next_gw) {
                                p.multiplier = 2 // triple captain fix
                            }
                        })
                        app.loading = false
                        app.refresh_histogram()
                    })
                } else {
                    app.team_data = response.body
                    app.team_data.picks.forEach(p => {
                        if (p.multiplier > 2 && this.is_next_gw) {
                            p.multiplier = 2 // triple captain fix
                        }
                    })
                    app.loading = false
                    app.refresh_histogram()
                }


            }).catch(error => {
                console.error(error)
                app.loading = false
            })
        },
        fetch_rival_picks() {
            if (!this.rival_mode) { return }
            this.rival_data = undefined
            this.lineup = []
            this.bench = []
            let target_gw = this.current_gw
            if (this.is_next_gw) {
                target_gw = this.current_gw - 1
            }
            this.loading = true
            get_team_picks({ gw: target_gw, team_id: this.rival_id, force_last_gw: false }).then((response) => {
                if (app.is_next_gw && response.body.active_chip !== undefined && response.body.active_chip == 'freehit') {
                    get_team_picks({ gw: target_gw - 1, team_id: this.team_id, force_last_gw: false }).then((response) => {
                        app.rival_data = response.body
                        app.rival_data.picks.forEach(p => {
                            if (p.multiplier > 2 && this.is_next_gw) {
                                p.multiplier = 2 // triple captain fix
                            }
                        })
                        app.loading = false
                        app.refresh_histogram()
                    })
                } else {
                    app.rival_data = response.body
                    app.rival_data.picks.forEach(p => {
                        if (p.multiplier > 2 && this.is_next_gw) {
                            p.multiplier = 2 // triple captain fix
                        }
                    })
                    app.loading = false
                    app.refresh_histogram()
                }

            }).catch(error => {
                console.error(error)
                app.loading = false
            })
        },
        evaluate_scenarios(picks, pen) {

            let grouped_scenarios = _.cloneDeep(this.grouped_scenario_with_field)
            let ownership = this.ownership_rate_dict
            if (_.isEmpty(ownership)) { return [] }
            let cur_pick = this.current_rep_dict
            let position_bounds = {
                1: { 'min': 1, 'max': 1 },
                2: { 'min': 3, 'max': 5 },
                3: { 'min': 2, 'max': 5 },
                4: { 'min': 1, 'max': 3 }
            }
            grouped_scenarios.forEach((s, i) => {
                let sc_picks = _.cloneDeep(picks.map(i => { return {...i } }))

                // Initial assignment
                sc_picks.forEach(p => {
                    let player_score = (s.values[p.element] && s.values[p.element].Points) || 0
                    p.pts = player_score
                    p.original_mult = p.multiplier
                    
                    if (p.element in s.values && p.multiplier > 0) {
                        // score += parseInt(player_score) * p.multiplier
                        p.played = true
                    } else {
                        if (p.multiplier > 0) {
                            p.played = false
                            p.autosub_out = true
                            p.multiplier = 0
                        }
                        if (p.is_captain || p.multiplier > 1) {
                            p.captain_out = true
                        }
                    }
                })
                
                // Autosub
                sc_picks.filter(i => i.autosub_out).forEach(p => {
                    let pos = p.data.element_type
                    let pos_playing = sc_picks.filter(i => i.data.element_type == pos && i.played).length
                    if (pos_playing < position_bounds[pos].min) {
                        // can only replace with same type
                        let match = sc_picks.find(i => i.multiplier == 0 && i.data.element_type == pos && i.element in s.values)
                        if (match) {
                            match.multiplier = 1
                            match.played = true
                            match.autosub_in = true
                            // let player_score = s.values[match.element].Points
                            // score += parseInt(player_score) * match.multiplier
                            // match.eff_points = ((match.multiplier - ownership[match.element] / 100) * parseInt(player_score)).toFixed(2)
                        }
                    } else {
                        // next available bench player
                        let match = sc_picks.find(i => i.multiplier == 0 && i.data.element_type > 1 && i.element in s.values) // no gk
                        if (match) {
                            match.multiplier = 1
                            match.played = true
                            match.autosub_in = true
                            // let player_score = s.values[match.element].Points
                            // score += parseInt(player_score) * match.multiplier
                            // match.eff_points = ((match.multiplier - ownership[match.element] / 100) * parseInt(player_score)).toFixed(2)
                        }
                    }
                    if (p.captain_out) {
                        let vc = sc_picks.find(i => i.is_vice_captain)
                        if (vc && vc.played) {
                            vc.multiplier = (p.original_mult + 0)
                            vc.captain_in = true
                        }
                    }
                })

                s.lineup_score = _.sum(sc_picks.filter(i => !i.autosub_in && i.played).map(i => i.pts * i.multiplier))
                s.autosub_score = _.sum(sc_picks.filter(i => i.autosub_in && i.played).map(i => i.pts * i.multiplier))

                sc_picks.forEach((p) => {
                    p.eff_points = ((p.multiplier - ownership[p.element] / 100) * parseInt(p.pts)).toFixed(2)
                })
                
                let score = s.lineup_score + s.autosub_score
                s.total_score = score + pen
                s.diff = score + pen - s.total_field
                s.idx = i
                s.picks = sc_picks
            })

            return grouped_scenarios
        },
        get_eval_stats(evals) {
            let sample_values = evals.map(i => i.total_score)
            let avg_score = sample_values.reduce((a, b) => a + b, 0) / evals.length
            let best_one = _.maxBy(evals, 'total_score')
            let worst_one = _.minBy(evals, 'total_score')
            let best_diff_field = _.maxBy(evals, 'diff')
            let worst_diff_field = _.minBy(evals, 'diff')

            let variance = jStat.variance(sample_values)
            let step = jStat.studentt.inv((1 - (1 - 0.95) / 2), sample_values.length - 1) * Math.sqrt(variance) / Math.sqrt(sample_values.length)
            let conf_interval = [avg_score - step, avg_score + step]
            let quantiles = jStat.quantiles(sample_values, [0, 0.25, 0.5, 0.75, 1])

            let diff_values = evals.map(i => i.diff)
            let diff_quantiles = jStat.quantiles(diff_values, [0, 0.25, 0.5, 0.75, 1])
            let avg_diff = jStat.mean(diff_values)
            let avg_field = jStat.mean(evals.map(i => i.total_field))

            let probs = {
                '20+': sample_values.filter(i => i >= 20).length / sample_values.length,
                '30+': sample_values.filter(i => i >= 30).length / sample_values.length,
                '40+': sample_values.filter(i => i >= 40).length / sample_values.length,
                '50+': sample_values.filter(i => i >= 50).length / sample_values.length,
                '60+': sample_values.filter(i => i >= 60).length / sample_values.length,
                '70+': sample_values.filter(i => i >= 70).length / sample_values.length
            }

            let diff_probs = {
                'm10': diff_values.filter(i => i <= -10).length / diff_values.length,
                'm5': diff_values.filter(i => i <= -5).length / diff_values.length,
                'm0': diff_values.filter(i => i <= 0).length / diff_values.length,
                'p0': diff_values.filter(i => i >= 0).length / diff_values.length,
                'p5': diff_values.filter(i => i >= 5).length / diff_values.length,
                'p10': diff_values.filter(i => i >= 10).length / diff_values.length
            }

            setTimeout(() => {
                app.$nextTick(() => {
                    app.calculating = false
                })
            }, 100)

            let lineup_avg = jStat.mean(evals.map(i => i.lineup_score))
            let autosub_avg = jStat.mean(evals.map(i => i.autosub_score))

            return {
                avg_score,
                avg_field,
                best_one: { 'sim': best_one.sim, 'total_score': best_one.total_score },
                worst_one: { 'sim': worst_one.sim, 'total_score': worst_one.total_score },
                best_diff: { 'sim': best_diff_field.sim, 'diff': best_diff_field.diff },
                worst_diff: { 'sim': worst_diff_field.sim, 'diff': worst_diff_field.diff },
                total_scores: sample_values,
                quantiles,
                conf_interval,
                diff_quantiles,
                avg_diff,
                probs,
                diff_probs,
                lineup_avg,
                autosub_avg
            }
        },
        saveSampleData(gw, data) {
            this.sample_gw = gw
            this.sample_data = Object.freeze(data)
            this.samples = ["FPL Data"].concat(Object.keys(app.sample_data).map(i => sample_compact_number(i)))
            if (this.samples.includes("Prime")) {
                this.active_sample = 7 // prime sample
                this.use_eo = true
            }
        },
        submitTeam(e) {
            if (e.keyCode === 13) {
                this.fetch_team_picks()
            }
        },
        submitRival(e) {
            if (e.keyCode === 13) {
                this.fetch_rival_picks()
            }
        },
        paste_data(e) {
            this.display_paste = true
        },
        save_data() {
            this.loading = true

            let content = document.getElementById("paste_area")
            try {
                let data = JSON.parse(content.value)
                if ('picks' in data) {
                    this.team_data = data
                    this.team_data.picks.forEach(p => {
                        if (p.multiplier > 2) {
                            p.multiplier = 2 // triple captain fix
                        }
                    })
                    app.refresh_histogram()
                }
            } catch {
                console.log("error in paste")
            }

            this.display_paste = false
            this.loading = false
        },
        get_lineup_x(list, current, order) {
            let total_pos = list.filter(i => i.data.element_type == current.data.element_type).length
            let this_pos = list.slice(0, order).filter(i => i.data.element_type == current.data.element_type).length + 1
            return 122 / (total_pos + 1) * this_pos - 14;
        },
        get_bench_x(order) {
            let total_pos = 4
            let this_pos = order + 1
            return 122 / (total_pos + 1) * this_pos - 14;
        },
        select_captain(e) {
            console.log(e)
            let picks = this.team_data.picks
            let cc = picks.find(i => i.multiplier > 1.5)
            let nc = picks.find(i => i.element == e)
            if (cc.element == nc.element) { return } // same player
            this.calculating = true
            let old_mult = cc.multiplier + 0
            cc.multiplier = 1
            cc.is_captain = false
            nc.multiplier = old_mult
            nc.is_captain = true
            if (nc.is_vice_captain) {
                nc.is_vice_captain = false
                cc.is_vice_captain = true
            }
            this.team_data.picks = picks
        },
        select_vice_captain(e) {
            console.log(e)
            let picks = this.team_data.picks
            let cc = picks.find(i => i.is_vice_captain)

            if (cc) {
                let nc = picks.find(i => i.element == e)
                if (cc.element == nc.element) { return } // same player
                this.calculating = true
                cc.is_vice_captain = false
                nc.is_vice_captain = true
                if (nc.multiplier > 1 || nc.is_captain) {
                    let old_mult = nc.multiplier + 0
                    nc.is_captain = false
                    nc.multiplier = 1
                    cc.is_captain = true
                    cc.multiplier = old_mult
                }
            }
            else {
                let nc = picks.find(i => i.element == e)
                if (nc.multiplier > 1 || nc.is_captain) { return }
                this.calculating = true
                nc.is_vice_captain = true
            }

            this.team_data.picks = picks
        },
        select_captain_rival(e) {
            console.log(e)
            let picks = this.rival_data.picks
            let cc = picks.find(i => i.multiplier > 1)
            let nc = picks.find(i => i.element == e)
            if (cc.element == nc.element) { return } // same player
            this.calculating = true
            let old_mult = cc.multiplier + 0
            cc.multiplier = 1
            cc.is_captain = false
            nc.multiplier = old_mult
            nc.is_captain = true
            if (nc.is_vice_captain) {
                nc.is_vice_captain = false
                cc.is_vice_captain = true
            }
            this.rival_data.picks = picks
        },
        select_vice_captain_rival(e) {
            console.log(e)
            let picks = this.rival_data.picks
            let cc = picks.find(i => i.is_vice_captain)
            if (cc) {
                let nc = picks.find(i => i.element == e)
                if (cc.element == nc.element) { return } // same player
                this.calculating = true
                cc.is_vice_captain = false
                nc.is_vice_captain = true
                if (nc.multiplier > 1 || nc.is_captain) {
                    let old_mult = nc.multiplier + 0
                    nc.is_captain = false
                    nc.multiplier = 1
                    cc.is_captain = true
                    cc.multiplier = old_mult
                }
            }
            else {
                let nc = picks.find(i => i.element == e)
                if (nc.multiplier > 1 || nc.is_captain) { return }
                this.calculating = true
                nc.is_vice_captain = true
            }
            this.rival_data.picks = picks
        },
        select_out(e) {
            if (this.picked_out != undefined) {
                $("#replacement_options").DataTable().destroy();
            }
            if (this.picked_out == e) {
                this.picked_out = undefined
                this.player_filter = undefined
            } else {
                this.picked_out = e
                this.player_filter = this.elements.find(i => i.id == e).element_type
                    // replacement_options
                this.$nextTick(() => {
                    let table = $("#replacement_options").DataTable({
                        "order": [4],
                        "lengthChange": false,
                        "pageLength": 15,
                        "searching": true,
                        "info": false,
                        "paging": true,
                        "columnDefs": []
                    });
                    table.cells("td").invalidate().draw();
                    let is_mobile = window.screen.width < 800
                    if (is_mobile) {
                        let table_y = jQuery("#select_portion")[0].getBoundingClientRect().top
                        window.scrollBy({ top: table_y, left: 0, behavior: 'smooth' })
                    }
                })
            }
        },
        select_out_rival(e) {
            if (this.picked_out_rival != undefined) {
                $("#replacement_options_rival").DataTable().destroy();
            }
            if (this.picked_out_rival == e) {
                this.picked_out_rival = undefined
                this.player_filter_rival = undefined
            } else {
                this.picked_out_rival = e
                this.player_filter_rival = this.elements.find(i => i.id == e).element_type
                    // replacement_options
                this.$nextTick(() => {
                    let table = $("#replacement_options_rival").DataTable({
                        "order": [4],
                        "lengthChange": false,
                        "pageLength": 15,
                        "searching": true,
                        "info": false,
                        "paging": true,
                        "columnDefs": []
                    });
                    table.cells("td").invalidate().draw();
                    let is_mobile = window.screen.width < 800
                    if (is_mobile) {
                        let table_y = jQuery("#select_portion_rival")[0].getBoundingClientRect().top
                        window.scrollBy({ top: table_y, left: 0, behavior: 'smooth' })
                    }
                })
            }
        },
        transfer_in(e) {
            if (this.picked_out == undefined) { return }
            // let out_player = this.team_data.picks.find(i => i.element == this.picked_out)
            let out_player_index = this.team_data.picks.findIndex(i => i.element == this.picked_out)
                // let in_player = elements.find(i => i.id == e)

            this.calculating = true

            this.team_data.picks[out_player_index].element = e
            this.select_out(this.picked_out) // clear selection
            this.swap_out = undefined // clear bench swap

            let is_mobile = window.screen.width < 800

            if (is_mobile) {
                let field_pos = jQuery("#field_portion")[0].getBoundingClientRect().top
                window.scrollBy({
                    top: field_pos,
                    left: 0,
                    behavior: 'smooth'
                })
            }
        },
        transfer_in_rival(e) {
            if (this.picked_out_rival == undefined) { return }
            let out_player_index = this.rival_data.picks.findIndex(i => i.element == this.picked_out_rival)
                // let in_player = elements.find(i => i.id == e)

            this.calculating = true

            this.rival_data.picks[out_player_index].element = e
            this.select_out_rival(this.picked_out_rival) // clear selection
            this.swap_out_rival = undefined // clear bench swap

            let is_mobile = window.screen.width < 800

            if (is_mobile) {
                let field_pos = jQuery("#field_portion_rival")[0].getBoundingClientRect().top
                window.scrollBy({
                    top: field_pos,
                    left: 0,
                    behavior: 'smooth'
                })
            }
        },
        select_swap(e) {
            this.swap_operation(e, 'swap_out', this.team_data)
        },
        select_swap_rival(e) {
            this.swap_operation(e, 'swap_out_rival', this.rival_data)
        },
        swap_operation(e, target, data) {
            if (this[target] == e) { // cancel swap
                this[target] = undefined
                data.picks.forEach(p => {
                    p.swap_available = undefined
                })
            } else {
                if (this[target] == undefined) {
                    this[target] = e
                    let picks = data.picks
                    let tp = data.picks.find(i => i.element == e)
                        // TODO check formation legality here!
                    let is_lineup = tp.multiplier > 0
                    let el_type = tp.data.element_type

                    let condition

                    let current_vals = {
                        1: { 'count': picks.filter(i => i.data.element_type == 1 && i.multiplier > 0).length, 'max': 1, 'min': 1 },
                        2: { 'count': picks.filter(i => i.data.element_type == 2 && i.multiplier > 0).length, 'max': 5, 'min': 3 },
                        3: { 'count': picks.filter(i => i.data.element_type == 3 && i.multiplier > 0).length, 'max': 5, 'min': 2 },
                        4: { 'count': picks.filter(i => i.data.element_type == 4 && i.multiplier > 0).length, 'max': 3, 'min': 1 }
                    }

                    if (el_type == 1) {
                        condition = e => Boolean(e.multiplier) != Boolean(tp.multiplier) && e.data.element_type == 1
                    } else {
                        if (is_lineup) {
                            let is_out_at_min = current_vals[el_type].count <= current_vals[el_type].min
                            condition = e => { return e.multiplier == 0 && (e.data.element_type == el_type || (!is_out_at_min && current_vals[e.data.element_type].count < current_vals[e.data.element_type].max)) }
                        } else {
                            let is_in_at_max = current_vals[el_type].count >= current_vals[el_type].max
                            condition = e => { return (e.multiplier > 0 && (e.data.element_type == el_type || (!is_in_at_max && current_vals[e.data.element_type].count > current_vals[e.data.element_type].min))) || (e.multiplier == 0 && e.data.element_type != 1) }
                        }
                    }

                    picks.forEach(p => {
                        p.swap_available = condition(p)
                    })
                } else { // perform swap!

                    this.calculating = true

                    let p_out = data.picks.find(i => i.element == this[target])
                    let p_in = data.picks.find(i => i.element == e)

                    let c = p_out.multiplier * 1
                    p_out.multiplier = 999
                    p_out.multiplier = p_in.multiplier * 1
                    p_in.multiplier = c

                    // Cap replacement
                    let cp = p_out.is_captain
                    p_out.is_captain = p_in.is_captain
                    p_in.is_captain = cp

                    // VC replacement
                    cp = p_out.is_vice_captain
                    p_out.is_vice_captain = p_in.is_vice_captain
                    p_in.is_vice_captain = cp


                    const swapArrayLocs = (arr, index1, index2) => {
                        [arr[index1], arr[index2]] = [arr[index2], arr[index1]]
                    }

                    // position swap
                    let o1 = data.picks.findIndex(i => i.element == this[target])
                    let o2 = data.picks.findIndex(i => i.element == e)
                    swapArrayLocs(data.picks, o1, o2)

                    this[target] = undefined
                    data.picks.forEach(p => {
                        p.swap_available = undefined
                    })

                    this.$nextTick(() => {
                        app.trigger = app.trigger + 1
                    })
                }
            }
        },
        activate_rep(v) {
            this.active_rep_comp = v
            this.refresh_histogram()
        },
        activate_with_link(e) {
            let sim_no = e.currentTarget.dataset.id
            if (sim_no == undefined) { return }
            let idx = this.grouped_scenarios.findIndex(i => i.sim == sim_no)
            this.active_rep_comp = idx

            this.refresh_histogram()

            this.$nextTick(() => {
                // move to sim
                let por_y = jQuery("#sim_portion")[0].getBoundingClientRect().top
                window.scrollBy({
                    top: por_y,
                    left: 0,
                    behavior: 'smooth'
                })
            })

        },
        saveImage(query, filename) {
            // svg fix
            var svgElements = document.body.querySelectorAll("svg")
            svgElements.forEach(function(item) {
                item.setAttribute("width", item.getBoundingClientRect().width);
                item.setAttribute("height", item.getBoundingClientRect().height);
                item.style.width = null;
                item.style.height = null;
            });
            // download
            html2canvas(document.querySelector(query), { allowTaint: true, logging: true, taintTest: false }).then(function(canvas) {
                saveAs(canvas.toDataURL(), filename);
            });
        },
        update_field_values() {
            if (this.active_sample == 'custom') {
                jQuery('#ownershipModal').modal('show')
            }
        },
        saveOwnershipAndClose() {
            let values = jQuery("#ownership_paste").val()
            let val_dict = values.split("\n").slice(3).map(i => i.split('\t')).map(i => [parseInt(i[0]), parseFloat(i[4])])
            this.custom_ownership = val_dict.map(i => { return { 'id': i[0], 'effective_ownership': i[1], 'selected_by_percent': i[1] } })
            this.active_sample = 'custom'
            jQuery("#ownershipModal").modal('hide')
        },
        copy_left_to_right() {
            this.rival_data = _.cloneDeep(this.team_data)
        },
        copy_right_to_left() {
            this.team_data = _.cloneDeep(this.rival_data)
        },
        saveMyTeam() {
            let obj = _.cloneDeep(app.team_data)
            obj.picks.forEach((v) => { delete v.data })
            downloadToFile(JSON.stringify(obj, undefined, 2), 'plan.json', 'application/json')
        },
        loadMyTeam(e) {
            if (!e.target.files) { return }
            let file = e.target.files[0]
            let reader = new FileReader()
            reader.onload = (evt) => {
                try {
                    let content = evt.target.result
                    let v = JSON.parse(decodeURIComponent(escape(content)))
                    app.team_data = v
                } catch {

                }
            }
            reader.readAsText(file)
            e.target.value = null
        },
        saveRivalTeam() {
            let obj = _.cloneDeep(app.rival_data)
            obj.picks.forEach((v) => { delete v.data })
            downloadToFile(JSON.stringify(obj, undefined, 2), 'plan.json', 'application/json')
        },
        loadRivalTeam(e) {
            if (!e.target.files) { return }
            let file = e.target.files[0]
            let reader = new FileReader()
            reader.onload = (evt) => {
                try {
                    let content = evt.target.result
                    let v = JSON.parse(decodeURIComponent(escape(content)))
                    app.rival_data = v
                } catch {

                }
            }
            reader.readAsText(file)
            e.target.value = null
        },
        shareLink() {
            if (_.isEmpty(this.team_data)) { return }
            let team_ids = this.team_data.picks.map(i => i.element).join(',')
            let cap = this.team_data.picks.find(i => i.is_captain == 1 || i.multiplier > 1)
            if (cap !== undefined) { cap = cap.element }
            let vicecap = this.team_data.picks.find(i => i.is_vice_captain == 1)
            if (vicecap !== undefined) { vicecap = vicecap.element }
            this.page_link = window.location.origin + window.location.pathname + '?sorted=1&team=' + team_ids + '&cap=' + cap + (vicecap ? '&vicecap=' + vicecap : '') + '&gw=' + this.current_gw
        },
        refresh_histogram() {
            draw_histogram()
            draw_field_graph()
            draw_diff_graph()
            draw_diff_graph(true) // rival
        },
        savePenalty() {
            let val = parseInt(jQuery("#my-penalty").val())
            this.my_penalty = (val || 0)
        },
        saveRivalPenalty() {
            let val = parseInt(jQuery("#rival-penalty").val())
            this.rival_penalty = (val || 0)
        },
        toggle_bb(key) {
            if (_.isEmpty(this[key])) { return }
            // check number of players
            picks = this[key].picks
            let bench = picks.filter(i => i.multiplier == 0)
            if (_.isEmpty(bench)) {
                // make last 4 people bench players
                let need_fix = false
                picks.slice(11,15).forEach((p) => {
                    if (p.multiplier > 1.5 || p.is_vice_captain) {
                        need_fix = true
                    }
                    p.multiplier = 0
                })
                if (need_fix) {
                    this.suggestTeam(key)
                }
            }
            else {
                picks.slice(11,15).forEach((p) => {
                    p.multiplier = 1
                })
            }
        },
        toggle_tc(key) {
            picks = this[key].picks
            let cap = picks.find(i => i.multiplier > 1.5 || i.is_captain)
            if (cap.multiplier == 2) {
                cap.multiplier = 3
            }
            else {
                cap.multiplier = 2
            }
        },
        plot_player(event) {
            plot_player_graph(event.target.value)
        },
        plot_current() {
            plot_player_graph(this.selected_id)
        }
    }
})

function get_top_three(v) {
    return Object.keys(v).map(i => [app.elements_dict[i], v[i]]).sort((a, b) => b[1] - a[1]).slice(0, 3)
}

function update_sim_values() {
    const order = app.active_sc
    gw = app.sc_files[order][0]
    tasks = [
        read_scenario(order),
        get_latest_sample_data(season, gw)
    ]
    Promise.allSettled(tasks).then(() => {
            if (app.team_id != '') {
                app.fetch_team_picks()
                app.fetch_rival_picks()
            }
        })
        .catch((error) => {
            console.error("An error has occurred: " + error);
        });
}

function read_scenario(order = 0) {
    // 0: gw name
    // 1: file location
    let file = app.sc_files[order][1]
    return read_local_file(file).then(d => {
        app.active_sc = order
        app.sc_details = Object.freeze($.csv.toObjects(d))
        let details_file = file.replace("/scenarios.csv", "/scenario_details.json?ts=" + ts)
        return read_local_file(details_file).then(e => {
            app.sc_game_details = Object.freeze(e)
        }).catch(e => {
            console.log("No details")
            app.sc_game_details = undefined
        })
    })
}

function draw_histogram() {

    if (_.isEmpty(app.scenario_evals)) { return }

    var margin = { top: 15, bottom: 20, left: 10, right: 10 },
        width = 400 - margin.left - margin.right,
        height = 120 - margin.top - margin.bottom

    let is_mobile = window.screen.width < 800

    if (is_mobile) {
        height = 160 - margin.top - margin.bottom
    }

    font_size = '4.5pt'
    title_size = '4.5pt'
    info_size = '3.8pt'

    jQuery("#histogram").empty()

    let cnv = d3.select("#histogram")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .style('display', 'block')

    let svg = cnv.append('g').attr('class', 'svg-actual').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    let content = svg.append('g').attr('id', 'graph-content')
    let grayrect = content.append('g').attr('class', 'brush');
    grayrect.append('rect')
        .attr('fill', '#5a5d5c')
        .attr('width', width)
        .attr('height', height)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    let data = app.scenario_evals

    let field_avg = app.scenario_stats.avg_field
    let your_avg = app.scenario_stats.avg_score

    data.forEach((value, index) => {
        value.y_val = data.slice(0, index).filter(i => i.total_score == value.total_score).length
    })

    let mpts = 0
    if (!app.is_next_gw && app.team_id != '') {
        if (app.team_data.entry_history && app.team_data.entry_history.points) {
            mpts = app.team_data.entry_history.points
        }
    }

    // Min max values
    let pure_values = data.map(i => [i.total_field, i.total_score]).flat()
    let x_high = Math.ceil(Math.max(Math.max(...pure_values), mpts)) + 5
    let x_low = Math.floor(Math.min(Math.min(...pure_values), Math.floor(field_avg))) - 5
    let x_domain = _.range(x_low, x_high)

    // Axis-x
    var x = d3.scaleBand()
        .domain(x_domain)
        .range([0, width])
        .paddingInner(0.3)
        .paddingOuter(0.1);

    let xAxis = svg.append("g")
        .attr("opacity", 1)
        .attr("transform", `translate(0, ${height})`)
        .call(
            d3.axisBottom(x)
            .tickSize(0)
            .tickValues(x_domain.length > 50 ? x_domain.filter(i => i % 5 == 0) : x_domain)
        )

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 18)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Points");

    // Axis-y
    let y_high = Math.max(...data.map(i => i.y_val + 1)) + 2
    let y_low = 0
    let y_domain = _.range(y_low, y_high)
    var y = d3.scaleBand().domain(y_domain).range([height, 0]).paddingInner(0).paddingOuter(0);
    let yAxis = svg.append('g')
        .attr("transform", "translate(" + width + ",0)")
        .call(d3.axisLeft(y).tickSize(width).tickFormat(i => parseInt(i) + 1))
        .call(g => g.selectAll(".tick text"))
        // .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

    svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
        .call(g => g.selectAll(".tick line")
            .attr("stroke-dasharray", "3,1")
            .attr("stroke-width", 0.5)
            .attr("stroke-opacity", 0.1)
            .style('pointer-events', 'none'))
        .call(g => g.selectAll(".domain")
            .attr("opacity", 0))

    // Add y axis label:
    svg.append("text")
        .attr("text-anchor", "left")
        .attr("x", -margin.left)
        .attr("y", -5)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Occurrence");

    svg.call(g => g.selectAll(".tick")
        .style("font-size", font_size))
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))

    let ev_title = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", width / 2)
        .attr("y", -8)
        .attr("font-size", title_size)
        .attr("fill", "white")
        .text("Simulated Total Points")


    // Data plot

    let holder = svg.append('g')

    let clickaction = (d) => {
        app.activate_rep(d.idx)
    }

    let bars = holder.selectAll().data(data)

    let active_rep = app.active_rep

    let find_x = e => x(Math.floor(e)) + x.step() * (e - Math.floor(e)) + x.bandwidth() / 2

    holder.append("line")
        .attr("x1", find_x(field_avg))
        .attr("x2", find_x(field_avg))
        .attr("y1", height)
        .attr("y2", 0)
        .attr("stroke", "white")
    holder.append("text")
        .attr("text-anchor", field_avg <= your_avg ? "end" : "start")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", find_x(field_avg) + (field_avg <= your_avg ? -2 : 2))
        .attr("y", 5)
        .attr("font-size", info_size)
        .attr("fill", "white")
        .text("Field Avg")
    holder.append("text")
        .attr("text-anchor", field_avg <= your_avg ? "end" : "start")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", find_x(field_avg) + (field_avg <= your_avg ? -2 : 2))
        .attr("y", 10)
        .attr("font-size", info_size)
        .attr("fill", "white")
        .text(field_avg.toFixed(1))

    holder.append("line")
        .attr("x1", find_x(your_avg))
        .attr("x2", find_x(your_avg))
        .attr("y1", height)
        .attr("y2", 0)
        .attr("stroke", "#00faff")
    holder.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", find_x(your_avg))
        .attr("y", -3)
        .attr("font-size", info_size)
        .attr("fill", "#00faff")
        .text("Team Avg " + your_avg.toFixed(1))

    bars.enter().append("rect")
        .attr("class", (d, i) => "occurence-bars" + (active_rep == i ? " active-occ-bar" : ""))
        // .attr("fill", d => colors(d.player_no))
        // .attr("fill-opacity", 0.5)
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .attr("x", (d) => x(d.total_score))
        .attr("y", (d) => y(d.y_val))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("cursor", "pointer")
        .on('click', (e, d) => clickaction(d))


    // When plotting old GW: draw a bar!
    if (mpts != 0) {
        let pts = mpts

        // holder.append("rect")
        // .attr("fill", "purple")
        // .attr("fill-opacity", 0.3)
        // .attr("stroke", "white")
        // .attr("stroke-width", 0.5)
        // .attr("x", (d) => x(pts) - x.paddingInner()*x.step()/2)
        // .attr("y", 0)
        // .attr("width", x.step())
        // .attr("height", height)
        // .style("pointer-events", "none")

        holder.append("line")
            .attr("x1", find_x(pts))
            .attr("x2", find_x(pts))
            .attr("y1", height + 6)
            .attr("y2", 0)
            .attr("stroke", "#ff0058")
        holder.append("text")
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "center")
            .attr("dominant-baseline", "center")
            .attr("x", find_x(pts))
            .attr("y", height + 12)
            .attr("font-size", info_size)
            .attr("fill", "#ff669b")
            .text("Actual: " + pts)

    }

}

function draw_field_graph() {
    // initial checks and clear
    if (_.isEmpty(app.scenario_evals)) { return }
    jQuery("#field_histogram").empty()
    if (!app.show_field) { return }

    // beeswarm plot
    var margin = { top: 15, bottom: 20, left: 10, right: 10 },
        width = 400 - margin.left - margin.right,
        height = 120 - margin.top - margin.bottom

    let is_mobile = window.screen.width < 800

    if (is_mobile) {
        height = 160 - margin.top - margin.bottom
    }

    font_size = '4.5pt'
    title_size = '4.5pt'
    info_size = '3.8pt'

    let cnv = d3.select("#field_histogram")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .style('display', 'block')

    let svg = cnv.append('g').attr('class', 'svg-actual')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    let content = svg.append('g')
        .attr('id', 'graph-content-beeswarm')
    let grayrect = content.append('g')
        .attr('class', 'brush');
    grayrect.append('rect')
        .attr('fill', '#5a5d5c')
        .attr('width', width)
        .attr('height', height)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    // data prep
    let data = app.scenario_evals

    let field_data = data.map(i => _.round(i.total_field, 2))
        // let field_min = Math.min(...field_data)
        // let field_max = Math.max(...field_data)

    let mpts = 0
    if (!app.is_next_gw && app.team_id != '') {
        if (app.team_data.entry_history && app.team_data.entry_history.points) {
            mpts = app.team_data.entry_history.points
        }
    }

    let pure_values = data.map(i => [i.total_field, i.total_score]).flat()
    let x_high = Math.ceil(Math.max(Math.max(...pure_values), mpts)) + 5
    let x_low = Math.floor(Math.min(...pure_values)) - 5
    let x_domain = _.range(x_low, x_high)
    let x_range = [x_low, x_high]

    // x-axis
    let x = d3.scaleLinear()
        .domain(x_range)
        .range([0, width])

    let xAxis = svg.append("g")
        .attr("opacity", 1)
        .attr("transform", `translate(0, ${height})`)
        .call(
            d3.axisBottom(x)
            .tickSize(0)
            .tickValues(x_domain.length > 50 ? x_domain.filter(i => i % 5 == 0) : x_domain)
        )


    // single y draw
    let holder = svg.append('g')

    holder.append('line')
        .attr("x1", x(x_low))
        .attr("x2", x(x_high))
        .attr("y1", height / 2)
        .attr("y2", height / 2)
        .attr("stroke", "gray")

    // y-axis
    let y = d3.scaleLinear().domain([0, 100]).range([height, 0])
    let yAxis = svg.append('g')
        .call(d3.axisLeft(y).tickSize(0).tickFormat(i => ""))
        .call(g => g.selectAll(".tick text").style("display", "none"))


    // plot general properties
    svg.call(g => g.selectAll(".tick")
        .style("font-size", font_size))
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))


    data.forEach((d) => {
        d.x = x(d.total_field)
        d.fx = x(d.total_field)
    })

    // simulation
    const r = 3
    const simulation = d3.forceSimulation(data)
        .force('x', d3.forceX(d => x(d.total_field)).strength(1))
        .force('y', d3.forceY(height / 2))
        .force('collide', d3.forceCollide().radius(d => r * 1.1))
        .stop()
        .tick(200)

    // Run the simulation real quick now
    // for(var i = 0; i < 1000; i++){
    //   simulation.tick()
    // }

    let clickaction = (d) => {
        app.activate_rep(d.idx)
    }

    let active_rep = app.active_rep

    holder.selectAll('circle')
        .data(simulation.nodes()).enter()
        .append('circle')
        // .attr('cx', d => x(d.total_field))
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', r)
        .attr("class", (d, i) => "field-occurence-circles" + (active_rep == i ? " active-occ-bar" : ""))
        .style("stroke-width", 0)
        .style("cursor", "pointer")
        .on('click', (e, d) => clickaction(d))

    // title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", width / 2)
        .attr("y", -3)
        .attr("font-size", title_size)
        .attr("fill", "white")
        .text("Simulated Field Average")

    // x-title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 18)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Points")

}

function draw_diff_graph(is_rival=false) {
    // initial checks and clear
    if (_.isEmpty(app.scenario_evals)) { return }

    if (!is_rival && !app.show_diff) { return }
    if (is_rival && (!app.rival_ready || !app.rival_mode || !app.show_diff_rival)) { return }

    let graph_name = '#diff_histogram'
    if (is_rival) { graph_name += '_rival' }

    jQuery(graph_name).empty()


    // scatter plot + dist
    var margin = { top: 25, bottom: 30, left: 35, right: 15 },
        width = 680 - margin.left - margin.right,
        height = 685 - margin.top - margin.bottom

    // let is_mobile = window.screen.width < 800

    // if (is_mobile) {
    //     height = 160 - margin.top - margin.bottom
    // }

    font_size = '8pt'
    title_size = '10pt'
    info_size = '7pt'
    axis_size = '10pt'

    let cnv = d3.select(graph_name)
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .style('display', 'block')

    let svg = cnv.append('g').attr('class', 'svg-actual')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    let content = svg.append('g')
        .attr('id', 'graph-content-scatter')

    let top_height = 150
    let top_gap = 30
    let main_size = 450
    let right_width = 150
    let right_gap = 30

    let grayrect = content.append('g')
        .attr('class', 'brush');
    // main part
    grayrect
        .append('rect')
        .attr('fill', '#5a5d5c')
        .attr("x", 0)
        .attr("y", top_height + top_gap)
        .attr('width', main_size)
        .attr('height', main_size)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    // top part
    grayrect
        .append('rect')
        .attr('fill', '#5a5d5c')
        .attr("x", 0)
        .attr("y", 0)
        .attr('width', main_size)
        .attr('height', top_height)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    // right part
    grayrect
        .append('rect')
        .attr('fill', '#5a5d5c')
        .attr("x", main_size + right_gap)
        .attr("y", top_height + top_gap)
        .attr('width', right_width)
        .attr('height', main_size)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    // data prep
    let data = _.cloneDeep(app.scenario_evals)

    // part 1: main data
    let main_part = svg.append('g')
        .attr('transform', 'translate(' + 0 + ',' + (top_height + top_gap) + ')')

    let team_points = data.map(i => i.total_score)

    if (is_rival) {
        rival_points = app.scenario_evals_rival.map(i => i.total_score)
        data.forEach((d,i) => {
            d.total_field = rival_points[i]
        })
    }

    let field_points = data.map(i => i.total_field)
    
    
    // let all_points = data.map(i => [i.total_score, i.total_field]).flat()

    let padded = (e, p) => { return [e[0] - p, e[1] + p] }

    x_main = d3.scaleLinear()
        .domain(padded(d3.extent(field_points), 5))
        .range([0, main_size])

    let xAxis = main_part.append("g")
        .attr("opacity", 1)
        .call(
            d3.axisBottom(x_main)
            .tickSize(main_size)
            // .tickValues(x_domain.length > 50 ? x_domain.filter(i => i % 5 == 0) : x_domain)
        )

    y_main = d3.scaleLinear()
        .domain(padded(d3.extent(team_points), 5))
        .range([main_size, 0])

    let yAxis = main_part.append("g")
        .attr('transform', 'translate(' + main_size + ', 0)')
        .attr("opacity", 1)
        .call(
            d3.axisLeft(y_main)
            .tickSize(main_size)
            // .tickValues(x_domain.length > 50 ? x_domain.filter(i => i % 5 == 0) : x_domain)
        )

    const r = 5

    let active_rep = app.active_rep

    let clickaction = (d) => {
        app.activate_rep(d.idx)
    }

    // diagonal line
    let min_diag = Math.max(Math.min(...field_points), Math.min(...team_points))
    let max_diag = Math.min(Math.max(...field_points), Math.max(...team_points))

    let diff_ranges = _.concat(
        _.range(-10, Math.min(...team_points) - Math.max(...field_points), -10),
        // [0],
        _.range(10, Math.max(...team_points) - Math.min(...field_points), 10)).map(i => { return { val: i } })

    const min_team = _.min(team_points)
    const max_team = _.max(team_points)
    const min_field = _.min(field_points)
    const max_field = _.max(field_points)

    let bounds = (change) => {
        let left
        let right
        if (min_team + change > min_field) {
            left = [min_field, min_field + change]
        } else {
            left = [min_team - change, min_team]
        }

        if (max_team - change < max_field) {
            right = [max_team - change, max_team]
        } else {
            right = [max_field, max_field + change]
        }
        return { 1: left, 2: right }
    }

    diff_ranges.forEach((d) => {
        d.point = bounds(d.val)
    })

    main_part
        .append("line")
        .attr("x1", x_main(min_diag - 5))
        .attr("x2", x_main(max_diag + 5))
        .attr("y1", y_main(min_diag - 5))
        .attr("y2", y_main(max_diag + 5))
        .attr("stroke", "white")

    // other diagonals
    main_part.selectAll(".diagline")
        .data(diff_ranges)
        .enter()
        .append("line")
        .attr("class", "diagline")
        .attr("x1", d => x_main(d.point[1][0] - 5))
        .attr("x2", d => x_main(d.point[2][0] + 5))
        .attr("y1", d => y_main(d.point[1][1] - 5))
        .attr("y2", d => y_main(d.point[2][1] + 5))
        .attr("stroke", "gray")

    let range_min = _.min(diff_ranges.map(i => i.val))
    let range_max = _.max(diff_ranges.map(i => i.val))

    let tcolor = d3.scaleLinear().domain([range_min, 0, range_max])
        .range(['#ffb5b5', '#ffffff', '#21ffda'])


    main_part.selectAll(".diagtext")
        .data(diff_ranges)
        .enter()
        .append("text")
        .attr("class", "diagtext")
        .attr("text-anchor", "end")
        .attr("alignment-baseline", "hanging")
        .attr("dominant-baseline", "hanging")
        .attr("x", d => x_main(d.point[2][0] + 4))
        .attr("y", d => y_main(d.point[2][1] + 4))
        .attr("font-size", info_size)
        .attr("fill", d => tcolor(d.val))
        .text(d => d.val > 0 ? "+" + _.round(d.val, 0) : _.round(d.val, 0))

    main_part.selectAll(".simcircle")
        .data(data)
        .enter()
        .append("circle")
        .attr('cx', d => x_main(d.total_field))
        .attr('cy', d => y_main(d.total_score))
        .attr('r', r)
        .attr("class", (d, i) => "simcircle" + (active_rep == i ? " active-occ-bar" : ""))
        .style("cursor", "pointer")
        .on('click', (e, d) => clickaction(d))

    // top plot

    let top_part = svg.append('g')
        .attr('transform', 'translate(0,0)')

    let x_top = d3.scaleLinear()
        .domain(padded(d3.extent(field_points), 5))
        .range([0, main_size])

    top_part.append("g")
        .attr("opacity", 1)
        .call(
            d3.axisBottom(x_top)
            .tickSize(top_height)
        )

    var kde = kernelDensityEstimator(kernelEpanechnikov(7), x_top.ticks(60))
    var density =  kde( data.map(d => d.total_field) )
    let d1_closed = fill_density(density)

    let top_y_max = _.max(density.map(i => i[1])) * 1.1

    let y_top = d3.scaleLinear()
        .range([top_height, 0])
        .domain([0, top_y_max]);

    top_part.append("g")
        // .attr('transform', 'translate(' + main_size + ', 0)')
        .attr("opacity", 1)
        .call(
            d3.axisLeft(y_top)
            .ticks(0)
            // .tickSize(main_size)
            // .tickValues(x_domain.length > 50 ? x_domain.filter(i => i % 5 == 0) : x_domain)
        )

    top_part.append("path")
        .datum(d1_closed)
        .attr("fill", is_rival ? "crimson" : "#fff777")
        .attr("fill-opacity", "0.5")
        .attr("stroke", "#000")
        .attr("stroke-width", 1)
        .attr("stroke-linejoin", "round")
        .attr("d",  d3.line()
        .curve(d3.curveBasis)
            .x(function(d) { return x_top(d[0]); })
            .y(function(d) { return y_top(d[1]); })
        );

    // right part

    let right_part = svg.append('g')
        .attr('transform', 'translate(' + (main_size+right_gap) + ',' + (top_height + top_gap) + ')')

    let y_right = d3.scaleLinear()
        .domain(padded(d3.extent(team_points), 5))
        .range([main_size, 0])

    right_part.append("g")
        .attr('transform', 'translate(' + right_width + ', 0)')
        .attr("opacity", 1)
        .call(
            d3.axisLeft(y_right)
            .tickSize(right_width)
        )

    let kde2 = kernelDensityEstimator(kernelEpanechnikov(7), y_right.ticks(60))
    let density2 =  kde2( data.map(d => d.total_score) )
    let d2closed = fill_density(density2)
    let right_x_max = _.max(d2closed.map(i => i[1])) * 1.1

    let x_right = d3.scaleLinear()
    .domain([0, right_x_max])
    .range([0, right_width])

    right_part.append("g")
        .attr("opacity", 1)
        .call(
            d3.axisTop(x_right).ticks(0)
        )

    right_part.append("path")
        .datum(d2closed)
        .attr("fill", "#21ffda")
        .attr("fill-opacity", "0.5")
        .attr("stroke", "#000")
        .attr("stroke-width", 1)
        .attr("stroke-linejoin", "round")
        .attr("d",  d3.line()
        .curve(d3.curveBasis)
            .x(function(d) { return x_right(d[1]); })
            .y(function(d) { return y_right(d[0]); })
        );




    // final fix
    svg.call(g => g.selectAll(".tick line")
        .attr("stroke-dasharray", "3,1")
        .attr("stroke-width", 0.5)
        .attr("stroke-opacity", 0.2)
        .style('pointer-events', 'none'))

    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))


    // titles
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", width / 2)
        .attr("y", -9)
        .attr("font-size", title_size)
        .attr("fill", "white")
        .text(is_rival ? "Team vs Rival Difference" : "Team Points vs Field Average Difference")

    // top title
    svg.append("text")
        .attr("text-anchor", "start")
        .attr("alignment-baseline", "hanging")
        .attr("dominant-baseline", "hanging")
        .attr("x", 2)
        .attr("y", 2)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text(is_rival ? "Rival Points Density" : "Field Average Density")

    // x-title
    main_part.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", main_size/2)
        .attr("y", main_size+25)
        .attr("font-size", axis_size)
        .attr("fill", "white")
        .text(is_rival ? "Rival Average (Points)" : "Field Average (Points)")

    // right title
    svg.append("text")
        .attr("text-anchor", "end")
        .attr("alignment-baseline", "hanging")
        .attr("dominant-baseline", "hanging")
        .attr("x", main_size + right_gap + right_width - 2)
        .attr("y", top_height + top_gap + 2)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Team Points Density")

    // y-title
    main_part.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("transform", `rotate(-90, ${-22}, ${main_size/2})`)
        .attr("x", -22)
        .attr("y", main_size/2)
        .attr("font-size", axis_size)
        .attr("fill", "white")
        .text("Team Score (Points)")


}

function plot_player_graph(pid) {
    console.log(pid)
    // player_plot

    
    var margin = { top: 25, bottom: 25, left: 25, right: 25 },
        width = 600 - margin.left - margin.right,
        height = 250 - margin.top - margin.bottom
    

    let is_mobile = window.screen.width < 800

    let font_size = '7.5pt'
    let title_size = '7.5pt'

    if (is_mobile) {
        // height = 180 - margin.top - margin.bottom
        font_size = '6pt'
        title_size = '6pt'
    }

    jQuery("#player_plot").empty()

    if (pid == undefined) { return }

    let cnv = d3.select("#player_plot")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .style('display', 'block')


    let svg = cnv.append('g').attr('class', 'svg-actual').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    let content = svg.append('g').attr('id', 'graph-content')
    let grayrect = content.append('g').attr('class', 'brush');
    grayrect.append('rect')
        .attr('fill', '#5a5d5c')
        .attr('width', width)
        .attr('height', height)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    let sc = app.sc_details
    let player_data = sc.filter(i => i.ID == pid)
    let sim_pts = player_data.map(i => [i.sim, parseInt(i.Points)])
    let all_points = sim_pts.map(i => i[1])

    let x_max = _.max(all_points)
    let x_min = _.min([_.min(all_points), 0])

    var x = d3.scaleBand()
        .domain(_.range(x_min, x_max+2))
        .range([0, width])
        .paddingInner(0.3)
        .paddingOuter(0.1);
    let xAxis = svg.append("g")
        .attr("opacity", 1)
        .attr("transform", `translate(0, ${height})`)
        .call(
            d3.axisBottom(x)
            .tickSize(0)
        )

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Points");

    let counts = _.countBy(all_points)
    let y_vals = _.values(counts)
    let data = _.map(counts, (v,i) => {return {'points': parseInt(i), 'count': v}})

    // Axis-y
    let y_high = _.max(y_vals) + 2
    let y_low = 0
    var y = d3.scaleLinear().domain([y_low, y_high]).range([height, 0]);
    let yAxis = svg.append('g')
        .attr("transform", "translate(" + width + ",0)")
        .call(d3.axisLeft(y).tickSize(width))
        .call(g => g.selectAll(".tick text"))
        .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

    svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
        .call(g => g.selectAll(".tick line")
            .attr("stroke-dasharray", "3,1")
            .attr("stroke-width", 0.5)
            .attr("stroke-opacity", 0.1)
            .style('pointer-events', 'none'))
        .call(g => g.selectAll(".domain")
            .attr("opacity", 0))
        
    // Add y axis label:
    svg.append("text")
        .attr("text-anchor", "left")
        .attr("x", -margin.left)
        .attr("y", -5)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Occurence");

    svg.call(g => g.selectAll(".tick")
        .style("font-size", font_size))
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))

    let plot_title = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", width / 2)
        .attr("y", -8)
        .attr("font-size", title_size)
        .attr("fill", "white")
        .text("");

    let holder = svg.append('g')

    let bars = holder.selectAll().data(data)
    let points = holder.selectAll().data(data)
    
    let bar_entries = bars.enter().append("rect")
    bar_entries
        .attr("class", "probability-bars")
        .attr("fill", "#40c8de")
        .attr("x", (d) => x(d.points))
        .attr("y", (d) => y(d.count))
        .attr("width", x.bandwidth())
        .attr("height", (d) => y(0)-y(d.count))

    let x_cont = d3.scaleLinear()
        .domain([x_min-0.5, x_max+1.5])
        .range([0, width])

    // density
    // debugger
    var kde = kernelDensityEstimator(kernelEpanechnikov(1), x_cont.ticks(x.domain().length*2))
    var density =  kde(all_points) //kde(data.map(d => d.count) )
    let d1_closed = fill_density(density)

    let y_cont = d3.scaleLinear()
        .range([height, y(_.max(y_vals))])
        .domain([0, _.max(d1_closed.map(i => i[1]))]);

    // holder.append("path")
    //     .datum(d1_closed)
    //     .attr("fill", "#fff777")
    //     .attr("fill-opacity", "0.3")
    //     .attr("stroke", "#000")
    //     .attr("stroke-width", 1)
    //     .attr("stroke-linejoin", "round")
    //     .attr("d",
    //         d3.line().curve(d3.curveCardinal) //curveBasis)
    //             .x(function(d) { return x_cont(d[0]); })
    //             .y(function(d) { return y_cont(d[1]); })
    //     );

    // let point_entries = points.enter().append("text")
    // point_entries
    //     .text((d) => d.count + " Pts")
    //     .attr("class", "prob-bar-values")
    //     .attr("x", (d) => x(d.count) + x.bandwidth()/2)
    //     .attr("text-anchor", "middle")
    //     .attr("y", (d) => y(d.probability) - 2)
    //     .attr("alignment-baseline", "baseline")
    //     .attr("dominant-baseline", "baseline")
    //     .attr("font-size", font_size)
    //     .attr("fill", "white")

    if (app.target_pts) {
        holder.append("line")
        .attr("x1", app.target_pts > x_max + 1 ? width : x(app.target_pts) - x.step() * x.paddingInner()/2)
        .attr("x2", app.target_pts > x_max + 1 ? width : x(app.target_pts) - x.step() * x.paddingInner()/2)
        .attr("y1", height)
        .attr("y2", 0)
        .attr("stroke", "crimson")
        .style("stroke-width", "3px")
    }

}

async function fetch_fpl_fixture() {
    return get_entire_fixture().then((data) => {
        app.fixture_data = Object.freeze(data)
    }).catch((e) => {
        console.log("Error", e)
    })
}


// Function to compute density
function kernelDensityEstimator(kernel, X) {
    return function(V) {
        return X.map(function(x) {
            return [x, d3.mean(V, function(v) { return kernel(x - v); })];
        });
    };
}

function kernelEpanechnikov(k) {
    return function(v) {
        return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
}

function fill_density(d) {
    let first = [[d[0][0], 0]]
    let last = [[d[d.length-1][0], 0]]
    return _.concat(first, d, last)
}


$(document).ready(() => {

    let url = window.location.search
    const params = new URLSearchParams(url)

    calls = [
        read_scenario(),
        get_fpl_main_data().then(d => {
            app.main_data = Object.freeze(d)
        }),
        get_latest_sample_data(season, gw).then(sample => {
            if (sample != undefined) { app.saveSampleData(sample.gw, sample.data) }
        }),
        fetch_fpl_fixture()
    ]

    Promise.allSettled(calls).then(() => {
            if (params.get('team') != null) {
                let sorted = params.get('sorted') == 1
                let picks = params.get('team').split(',').map(i => parseInt(i))
                let captain = params.get('cap')
                let vice_cap = params.get('vicecap')
                let tc = params.get('tc')
                let gw = params.get('gw')
                app.set_team_with_url(sorted, picks, captain, vice_cap, tc, gw)
                    // app.team_id = 1
            }
            if (params.get('gw') != null) {
                app.activate_gw(parseInt(params.get('gw')))
            }
            app.ready = true
        })
        .catch((error) => {
            console.error("An error has occurred: " + error);
        });
})