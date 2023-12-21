let season_results = [
    // [1, 159801, 324.82],
    // [10, 10322, 289.82],
    // [100, 3089815, 237.82],
    // [200, 316872, 221.82],
    // [500, 3350292, 199.82],
    // [1000, 251719, 181.82],
    // [2000, 40030, 161.82],
    // [5000, 2016845, 131.82],
    // [10000, 1077954, 106.82],
    // [20000, 2006, 77.82],
    // [50000, 1061692, 30.82],
    // [100000, 11584, -14.18],
    // [200000, 4820324, -73.18],
    // [500000, 245679, -180.18],
    // [1000000, 541485, -286.18],
    // [1500000, 1207710, -363.18],
    // [2000000, 1630750, -428.18],
    // [4000000, 237940, -641.18],
    // [6000000, 2858219, -840.18],
    // [9000000, 9092949, -2059.18]
]

var app = new Vue({
    el: '#app',
    data: {
        season: season,
        team_id: '',
        next_gw: gw,
        off_season: off_season,
        max_gw: Math.min(gw, 38),
        points_data: {},
        eo_data: {},
        fixture_data: [],
        fdr_data: [],
        team_info: {},
        team_data: {},
        el_data: [],
        xp_data: undefined,
        ready: false,
        loading: false,
        top_players_table: undefined,
        gw_table: undefined,
        all_picks_table: undefined,
        rival_info: [],
        sample_selection: 0,
        sample_options: [],
        include_hits: true,
        show_xp_totals: false,
        show_diff_totals: false,
        show_all_season: false,
        show_all_transfers: false,
        toty_relative: false,
        season_targets: season_results,
        luck_input: 0,
        maximize: false,
        show_pts_on_ts: true,
        show_info_ts: false,
        use_team_colors: false,
        // exclude_fh_from_age_0: false
        // toty_expected: false,
        caches_enabled: false
    },
    computed: {
        is_ready() {
            return this.ready && (!_.isEmpty(this.team_data)) && (!_.isEmpty(this.points_data))
        },
        completed() {
            return _.size(this.team_data)
        },
        stats_2d() {
            if (!this.is_ready) { return [] }
            let structured_data = Object.entries(this.points_data).map(i => i[1].map(j => [i[0], j.id, j.e]))
            return structured_data.flat()
        },
        points_2d() {
            if (!this.is_ready) { return {} }
            let st_data = this.stats_2d
            let pt_data = st_data.map((e) => {
                let pts = e[2].map(f => f.stats.map(s => s.points)).flat()
                let tot_pts = pts.reduce((a, b) => a + b, 0)
                return { 'gw': e[0], 'id': e[1], 'pts': tot_pts }
            })
            return pt_data
        },
        gw_pid_pts() {
            if (!this.is_ready) { return [] }
            let pts_data = this.points_2d
            let gw_grouped = _.groupBy(pts_data, 'gw')
            Object.keys(gw_grouped).map((key, index) => { gw_grouped[key] = Object.fromEntries(gw_grouped[key].map(i => [i.id, i.pts])) })
            for (let gw of _.range(1, parseInt(app.next_gw))) {
                if (gw_grouped[gw] == undefined) {
                    gw_grouped[gw] = {}
                }
            }
            return gw_grouped
        },
        pid_gw_pts() {
            if (!this.is_ready) { return [] }
            let pts_data = this.points_2d
            let id_grouped = _.groupBy(pts_data, 'id')
            Object.keys(id_grouped).map((key, index) => { id_grouped[key] = Object.fromEntries(id_grouped[key].map(i => [i.gw, i.pts])) })
            return id_grouped
        },
        fpl_element() {
            if (!this.is_ready) { return [] }
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
            let eo_dict = this.parsed_eo_data.dict
            Object.keys(grouped_pick_data).map(key => {
                e = grouped_all_stats[key] = {}
                e['id'] = key
                e['squad_count'] = grouped_pick_data[key].length
                e['lineup_count'] = grouped_pick_data[key].filter(i => i.multiplier > 0).length
                e['points_total'] = grouped_pick_data[key].map(i => (i.points || 0) * i.multiplier).reduce((a, b) => a + b, 0)
                let pt_total = grouped_pick_data[key].map(i => (i.points || 0) * (i.multiplier-(eo_dict[i.gw + '_' + i.element] || 0)/100)).reduce((a, b) => a + b, 0)
                e['points_total_rel'] = _.round(pt_total,1)
                e['cap_count'] = grouped_pick_data[key].filter(i => i.multiplier > 1).length
                e['position'] = grouped_pick_data[key][0].raw.element_type
                e['name'] = grouped_pick_data[key][0].raw.web_name
                e['raw'] = grouped_pick_data[key][0].raw
            })
            let sorted_data = _.orderBy(grouped_all_stats, ['points_total', 'squad_count', 'lineup_count'], ['desc', 'desc', 'desc'])
            return sorted_data
        },
        user_player_relative_sum() {
            if (!this.is_ready) { return [] }
            let picks = this.user_player_stats
            let grouped_pick_data = _(picks).groupBy('element').value()
            let grouped_all_stats = {}
            let eo_dict = this.parsed_eo_data.dict
            Object.keys(grouped_pick_data).map(key => {
                e = grouped_all_stats[key] = {}
                e['id'] = key
                e['squad_count'] = grouped_pick_data[key].length
                e['lineup_count'] = grouped_pick_data[key].filter(i => i.multiplier > 0).length
                eo_dict
                // let eo = eo_dict[]
                let pt_total = grouped_pick_data[key].map(i => (i.points || 0) * (i.multiplier-(eo_dict[i.gw + '_' + i.element] || 0)/100)).reduce((a, b) => a + b, 0)
                e['points_total'] = _.round(pt_total,1)
                e['cap_count'] = grouped_pick_data[key].filter(i => i.multiplier > 1).length
                e['position'] = grouped_pick_data[key][0].raw.element_type
                e['name'] = grouped_pick_data[key][0].raw.web_name
                e['raw'] = grouped_pick_data[key][0].raw
            })
            let sorted_data = _.orderBy(grouped_all_stats, ['points_total', 'squad_count', 'lineup_count'], ['desc', 'desc', 'desc'])
            return sorted_data
        },
        toty_final() {
            if (!this.is_ready) { return [] }
            if (this.toty_relative) { return this.user_toty_relative }
            else { return this.user_toty }
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
        user_toty_relative() {
            if (!this.is_ready) { return [] }
            let player_sum_data = this.user_player_relative_sum
            
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
            if (!this.is_ready) { return [] }
            let stats = this.stats_2d
            let all_data = stats.map(i => i[2].map(j => j.stats.map(k => ({ 'gw': i[0], 'id': i[1], 'fixture': j.fixture, ...k })))).flat().flat()
            return all_data
        },
        user_picks_detailed() {
            if (!this.is_ready) { return [] }
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
        user_picks_with_order() {
            if (!this.is_ready) { return [] }
            if (_.isEmpty(this.user_ownership_gain_loss)) { return [] }
            let td = _.cloneDeep(this.team_data)
            let picks = Object.keys(td).map(i => td[i].picks.map(j => ({ 'gw': parseInt(i), ...j }))).flat()
            // _.cloneDeep(this.user_ownership_gain_loss.picked_players)
            let chips = Object.fromEntries(Object.entries(td).map(i => [i[0], i[1].active_chip]))
            let fpl_el = this.fpl_element
            let rp_dict = this.pid_gw_pts
            
            picks.forEach((el) => {el.element_type = fpl_el[el.element].element_type})
            picks.forEach((el) => {el.rp = _.get(rp_dict, el.element + '.' + el.gw) || 0})

            // calculate viz positions
            let gw_player_dict = {}
            let gw_order_dict = {}
            let eltypes = [1,2,3,4]
            let el_lowest = {1: 1, 2: 3, 3: 8, 4: 13}
            let el_highest = {1: 2, 2: 7, 3: 12, 4: 15}
            // let order = _.range(1,16)

            let gws = _.sortedUniq(picks.map(i => i.gw)).map(i => parseInt(i))
            gws.forEach((gw) => {
                let gw_picks = picks.filter(i => i.gw==gw)
                
                eltypes.forEach((pos) => {
                    let pos_picks = gw_picks.filter(i => i.element_type == pos)
                    let prev_gw = chips[gw-1] == 'freehit' ? gw-2 : gw-1
                    let prev_picks = picks.filter(i => i.gw == prev_gw)

                    let one_before = parseInt(gw)-1
                    let history_picks = picks.filter(i => i.gw == one_before)
                    let one_after = parseInt(gw)+1 // chips[gw+1] == 'freehit' ? gw+2 : gw+1
                    let future_picks = picks.filter(i => i.gw == one_after)
                    
                    // existing ones
                    let existing_players = pos_picks.filter(i => prev_picks.map(i => i.element).includes(i.element))
                    existing_players.forEach((el) => {
                        let previous = _.get(gw_player_dict, prev_gw + '.' + el.element)
                        
                        let prev = history_picks.find(i => i.element == el.element)
                        let next = future_picks.find(i => i.element == el.element)

                        el.sort_order = previous
                        if (prev != undefined) {
                            el.sort_start = prev.sort_start
                        }
                        else {
                            el.sort_start = gw
                        }
                        if (next == undefined) {
                            el.sort_finish = gw
                        }
                        _.set(gw_player_dict, gw + '.' + el.element, previous)
                        _.set(gw_order_dict, gw + '.' + previous, el.element)
                    })
                    // new players
                    let new_players = _.differenceWith(pos_picks, existing_players, _.isEqual)
                    new_players.forEach((el) => {
                        let start_order = el_lowest[el.element_type]
                        let finish_order = el_highest[el.element_type]
                        let posssible =  _.range(start_order, finish_order+1).filter(i => _.get(gw_order_dict, gw + '.' + i) == undefined)
                        el.sort_order = posssible[0]
                        el.sort_start = gw
                        _.set(gw_player_dict, gw + '.' + el.element, posssible[0])
                        _.set(gw_order_dict, gw + '.' + posssible[0], el.element)

                        let next = future_picks.find(i => i.element == el.element)
                        if (next == undefined || chips[gw] == 'freehit') {
                            el.sort_finish = gw
                        }
                    })
                })
            })
            return picks
        },
        pick_stats() {
            if (_.isEmpty(this.user_picks_with_order)) { return {} }
            let data = this.user_picks_with_order
            let blanks = data.filter(i => i.multiplier > 0 && i.rp <= 3).length
            let picked = data.filter(i => i.multiplier > 0).length
            let tens = data.filter(i => i.multiplier > 0 && i.rp >= 10).length
            return {blanks, picked, tens}
        },
        user_grouped_by_fixture() {
            return _(this.user_picks_detailed).groupBy('id').map((i,v) => [v, _(i).groupBy('fixture').value()]).value()
        },
        user_picks_origin() {
            if (!this.is_ready) { return []}
            let rp_dict = this.pid_gw_pts
            data = this.team_data
            let gameweeks = Object.keys(data).map(i => parseInt(i))
            let wc_count = 1
            let fh_count = 1
            gameweeks.forEach((gw) => {
                picks = data[gw].picks
                // if GW 1 or WC: then everyone is WC -  reset
                if (gw == gameweeks[0]) {
                    picks.forEach((p) => {
                        p.gw = gw
                        p.origin = 'initial'
                        p.origin_text = 'initial'
                        p.origin_gw = gw
                        p.age = 0
                        p.age_group = p.age
                    })
                }
                // 2022-2023 special: World Cup Wildcard
                // else if (gw == 17) {
                //     picks.forEach((p) => {
                //         p.gw = gw
                //         p.origin = 'wildcard'
                //         p.origin_text = 'wcb'
                //         p.origin_gw = gw
                //         p.age = 0
                //         p.age_group = p.age
                //     })
                // }
                else if (data[gw].active_chip == 'wildcard') {
                    picks.forEach((p) => {
                        p.gw = gw
                        p.origin = 'wildcard'
                        p.origin_text = 'wc' + wc_count
                        p.origin_gw = gw
                        p.age = 0
                        p.age_group = p.age
                        p.wildcard_cnt = wc_count
                    })
                    wc_count += 1;
                }
                else if (data[gw].active_chip == 'freehit') {
                    picks.forEach((p) => {
                        p.gw = gw
                        p.origin = 'freehit'
                        p.origin_text = 'fh' + fh_count
                        p.origin_gw = gw
                        p.age = 0
                        p.age_group = p.age
                        p.freehit_cnt = fh_count
                    })
                    fh_count += 1;
                }
                else {
                    // check if last gw was FH
                    let target_gw = data[gw-1].active_chip == 'freehit' ? gw-2 : gw-1
                    last_gw_picks = data[target_gw].picks
                    picks.forEach((p) => {
                        last_entry = last_gw_picks.find(i => i.element == p.element)
                        if (last_entry) {
                            p.gw = gw
                            p.origin = last_entry.origin
                            p.origin_text = last_entry.origin_text
                            p.origin_gw = last_entry.origin_gw
                            p.age = gw - p.origin_gw
                            p.age_group = p.age > 10 ? '11+' : p.age
                            p.wildcard_cnt = last_entry.wildcard_cnt
                        }
                        else {
                            p.gw = gw
                            p.origin = 'transfer'
                            p.origin_text = 'transfer'
                            p.origin_gw = gw
                            p.age = 0
                            p.age_group = p.age
                        }
                    })
                }
            })

            gameweeks.forEach((gw) => {
                data[gw].picks.forEach((p) => {
                    p.points = _.get(rp_dict, p.element + '.' + gw) || 0
                    p.eff_points = p.points * p.multiplier
                })
            })

            let all_players = Object.values(data).map(i => i.picks).flat()

            let age_pts = _.map(_.groupBy(all_players, 'age'), (val, key) => [key, _.sumBy(val, 'eff_points')])

            stats = {
                total: _.sum(all_players.map(i => i.eff_points)),
                pts_main: {
                    'initial': _.sum(all_players.filter(i => i.origin == 'initial').map(i => i.eff_points)),
                    'wildcard': _.sum(all_players.filter(i => i.origin == 'wildcard').map(i => i.eff_points)),
                    'freehit': _.sum(all_players.filter(i => i.origin == 'freehit').map(i => i.eff_points)),
                    'transfer': _.sum(all_players.filter(i => i.origin == 'transfer').map(i => i.eff_points)),
                },
                // 'split': {
                //     'total_pts_initial': _.sum(all_players.filter(i => i.real_origin == 'initial').map(i => i.eff_points)),
                //     'total_pts_wildcard_only': _.sum(all_players.filter(i => i.real_origin == 'wildcard').map(i => i.eff_points)),
                //     'total_pts_freehit': _.sum(all_players.filter(i => i.real_origin == 'freehit').map(i => i.eff_points)),
                //     'total_pts_transfer': _.sum(all_players.filter(i => i.real_origin == 'transfer').map(i => i.eff_points)),
                // },
                pts_details: {
                    'initial': _.sum(all_players.filter(i => i.origin == 'initial').map(i => i.eff_points)),
                    'wc1': _.sum(all_players.filter(i => i.origin == 'wildcard' && i.wildcard_cnt == 1).map(i => i.eff_points)),
                    'wc2': _.sum(all_players.filter(i => i.origin == 'wildcard' && i.wildcard_cnt == 2).map(i => i.eff_points)),
                    // 'wcb': _.sum(all_players.filter(i => i.origin == 'wildcard_bonus').map(i => i.eff_points)),
                    'fh1': _.sum(all_players.filter(i => i.origin == 'freehit' && i.freehit_cnt == 1).map(i => i.eff_points)),
                    // 'fh2': _.sum(all_players.filter(i => i.origin == 'freehit' && i.freehit_cnt == 2).map(i => i.eff_points)),
                    'transfer': _.sum(all_players.filter(i => i.origin == 'transfer').map(i => i.eff_points))
                },
                groups: {
                    'initial': all_players.filter(i => i.origin == 'initial'),
                    'wc1': all_players.filter(i => i.origin == 'wildcard' && i.wildcard_cnt == 1),
                    'wc2': all_players.filter(i => i.origin == 'wildcard' && i.wildcard_cnt == 2),
                    // 'wcb': all_players.filter(i => i.origin == 'wildcard_bonus'),
                    'fh1': all_players.filter(i => i.origin == 'freehit' && i.freehit_cnt == 1),
                    // 'fh2': all_players.filter(i => i.origin == 'freehit' && i.freehit_cnt == 2),
                    'transfer': all_players.filter(i => i.origin == 'transfer')
                },
                age_pts
            }

            let group_names = [
                ['Initial', 'initial'],
                ['WC 1', 'wc1'],
                ['WC 2', 'wc2'],
                // ['WC B', 'wcb'],
                ['Transfers', 'transfer'],
                ['FH', 'fh1'],
                // ['FH 2', 'fh2']
            ]
            // let age_groups = _.range(11).concat(['11+'])

            let main_groups = [
                ['Initial', 'initial', 'IN'],
                ['WC', 'wildcard', 'WC'],
                ['Transfers', 'transfer', 'TR'],
                ['FH', 'freehit', 'FH'],
            ]

            let main_coll = m = _(all_players).groupBy('origin').mapValues((val, key) => _(val).groupBy('age_group').value()).value()
            
            let main_sum = _(m).mapValues((val,key) => _(val).mapValues((ival, ikey) => _.sumBy(ival, 'eff_points')).value()).value()
            let main_cnt = _(m).mapValues((val,key) => _(val).mapValues((ival, ikey) => ival.filter(i => i.multiplier > 0).length).value()).value()

            let tabular_values = {}

            let nested_collection = e = _(all_players).groupBy('origin_text').mapValues((val, key) => _(val).groupBy('age_group').value()).value()
            let age_groups = _.uniq(_(e).map((val,key) => _(val).map((ival, ikey) => ikey).value()).value().flat())

            let nested_sum = _(e).mapValues((val,key) => _(val).mapValues((ival, ikey) => _.sumBy(ival, 'eff_points')).value()).value()
            let nested_count = _(e).mapValues((val,key) => _(val).mapValues((ival, ikey) => ival.filter(i => i.multiplier > 0).length).value()).value()
            
            let age_sums = _(all_players).groupBy('age_group').mapValues((val, key) => _(val).sumBy('eff_points')).value()
            let age_cnt = _(all_players).groupBy('age_group').mapValues((val, key) => val.filter(i => i.multiplier > 0).length).value()

            let grp_cnt = _(all_players).groupBy('origin_text').mapValues((val, key) => val.filter(i => i.multiplier > 0).length).value()

            // group_names.forEach((gr) => {
            //     age_groups.forEach((age) => {
            //         if (age.includes('+')) {

            //         }
            //         else {
            //             total_in_cell = _.sum(all_players.filter(i => i.origin == gr[1] && i.age == age).map(i => i.eff_points))

            //         }
            //     })
            // })

            return Object.freeze({
                data: data,
                all_players,
                stats: stats,
                group_names,
                age_groups,
                nested_sum,
                nested_count,
                age_sums,
                age_cnt,
                grp_cnt,
                main_sum,
                main_cnt,
                main_groups
            })
        },
        user_picks_custom_stats() {
            if (!this.is_ready) { return [] }
            // let picked_stats = this.user_picks_detailed
            let team_data = this.team_data
            return get_team_stats_picks(team_data)
        },
        stats_per_gw() {
            if (!this.is_ready) { return [] }
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
            let stat_dict = Object.fromEntries(stats.map(i => [[i.key, i.gw, i.id].join("_"), i]))
                // let picks = this.team_data.map(i => i.picks)
            let user_picks = this.user_player_stats
            let fpl_data = this.fpl_element
            user_picks = user_picks.map(i => ({ 'gw': i.gw, 'id': i.element, 'multiplier': i.multiplier })).filter(i => i.multiplier > 0)
            let stat_types = Object.keys(player_stat_types)

            let picked_stats = []
            for (let st of stat_types) {
                for (let pick of user_picks) {
                    // let m = stats.find(i => i.key == st && i.gw == pick.gw && i.id == pick.id)
                    let m = stat_dict[[st, pick.gw, pick.id].join("_")]
                    if (m != undefined) {
                        picked_stats.push({...m, 'multiplier': pick.multiplier, 'total_points': pick.multiplier * m.points, 'eltype': fpl_data[pick.id].element_type })
                    }
                }
            }

            let total_non_bench = user_picks.filter(i => i.multiplier > 0)

            let gw_grouped = Object.fromEntries(_(picked_stats).groupBy('gw').map((i, k) => [k, _.groupBy(i, 'key')]).value())

            let type_grouped = _(picked_stats).groupBy('key').value()

            let pos_grouped = _(picked_stats).groupBy('eltype').value()

            let pt_data = Object.entries(this.team_data).map(i => ({ 'gw': i[0], 'net_pts': i[1].entry_history.points - i[1].entry_history.event_transfers_cost, 'pts': i[1].entry_history.points, 'hit_pts': i[1].entry_history.event_transfers_cost }))
            for (let pgw of pt_data) {
                let gw = pgw.gw
                let type_sums = {}
                let type_names = {}
                for (let key in gw_grouped[gw]) {
                    let t = gw_grouped[gw][key]
                    type_sums[key] = getSum(t.map(i => i.value))
                    type_names[key] = t.map(ev => this.fpl_element[ev.id].web_name + (ev.value > 1 ? ` (${ev.value})` : '')).join(', ')
                }
                pgw.info = {type_sums, type_names}
            }

            let overall_total = getSum(pt_data.map(i => i.net_pts))

            return {
                'all_stats': picked_stats,
                'gw_grouped': gw_grouped,
                'type_grouped': type_grouped,
                'points': pt_data,
                'total_picks': total_non_bench.length,
                'pos_grouped': pos_grouped,
                overall_total
            }
        },
        user_player_gws() {
            if (!this.is_ready) { return [] }
            let team = this.team_data
            let all_picks = Object.entries(team).map(i => i[1].picks.map(j => ({ 'gw': i[0], 'id': j.element, 'multiplier': j.multiplier }))).flat()
            return all_picks
        },
        user_points_by_eltype() {
            if (!this.is_ready) { return [] }
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

        },
        user_formation_analysis_by_eltype() {
            if (!this.is_ready) { return [] }
            let stats = this.user_picks_detailed
            let gw_count = _.uniq(stats.map(i => i.gw)).length
            stats = stats.filter(i => i.multiplier > 0)
            picked = {}
            for (let p in element_type) {
                let row = picked[p] = {}
                let pos_select = stats.filter(i => i.eltype == p)
                row['picked'] = _.uniqWith(pos_select, (a,b) => ( a.gw == b.gw && a.id == b.id)).length
                row['games'] = _.uniqWith(pos_select, (a,b) => a.id == b.id && a.fixture == b.fixture).length
                row['points'] = getSum(pos_select.map(i => i.total_points))
                row['ppp'] = row['points'] / row['picked']
                row['ppg'] = row['points'] / row['games']
                row['avg_pick'] = row['picked'] / gw_count
            }
            return picked
        },
        user_formation_analysis_by_gw() {
            if (!this.is_ready) { return [] }
            let stats = this.user_picks_detailed
            // let gw_count = _.uniq(stats.map(i => i.gw)).length
            let gameweeks = stats.map(i => i.gw)
            stats = stats.filter(i => i.multiplier > 0)
            gw_vals = {}
            for (let gw of gameweeks) {
                let row = gw_vals[gw] = {}
                let gw_picks = stats.filter(i => i.identifier == 'minutes' && i.gw == gw)
                let filtered_picks = _.uniqBy(gw_picks, 'id')
                let cnt = row['counts'] = _.countBy(filtered_picks, 'eltype')
                row['formation'] = (filtered_picks.length > 11 ? "(BB) " : "") + cnt[2] + '-' + cnt[3] + '-' + cnt[4]
                row['points'] = getSum(stats.filter(i => i.gw == gw).map(i => i.total_points))
                row['total'] = filtered_picks.length
            }
            let summary = Object.values(gw_vals)
            summary = summary.filter(i => i.total >= 11)
            summary = _.groupBy(summary, 'formation')
            let sorted_vals = []
            for (let f in summary) {
                let pts = getSum(summary[f].map(i => i.points))
                sorted_vals.push({
                    'formation': f,
                    'count': summary[f].length,
                    'points': pts,
                    'avg': pts/summary[f].length
                })
            }
            sorted_vals = _.orderBy(sorted_vals, ['count', 'points'], ['desc', 'desc'])
            return {'sorted': sorted_vals, 'summary': summary, 'details': gw_vals}
        },
        parsed_eo_data() {
            let eo_data = this.eo_data
            let key = this.sample_options[this.sample_selection]
            let gws = Object.keys(eo_data)
            let values = []
            let hits = []
            for (let gw of Object.keys(eo_data)) {
                if (key in eo_data[gw]) {
                    let v = Object.keys(eo_data[gw][key]).filter(i => i!= 'meta').map(pid => [gw, pid, eo_data[gw][key][pid].eo])
                    values.push(v)
                    let h = eo_data[gw][key]['meta']
                    hits.push(h)
                }
                else {
                    let v = Object.keys(eo_data[gw]["Overall"]).filter(i => i!= 'meta').map(pid => [gw, pid, eo_data[gw]["Overall"][pid].eo])
                    values.push(v)
                    let h = eo_data[gw]["Overall"]['meta']
                    hits.push(h)
                }
            }
            values = values.flat()
            // let values = Object.keys(eo_data).map(gw => Object.keys(eo_data[gw][key]).map(pid => [gw, pid, eo_data[gw][key][pid].eo])).flat()
            let values_dict = Object.fromEntries(values.map(i => [i[0] + '_' + i[1], i[2]]))
            return {gw: gws, raw_values: values, dict: values_dict, hits: hits}
        },
        user_ownership_gain_loss() {

            if (!this.is_ready) { return {}}

            let ss = this.sample_selection
            let so = this.sample_options[this.sample_selection]

            let xp_dict = this.player_xp_dict

            let gws = this.parsed_eo_data.gw
            let all_pids = Object.keys(this.fpl_element)
            let all_pairs = Object.fromEntries(gws.map(gw => all_pids.map(pid => [gw + '_' + pid, {'gw': gw, 'id': pid}])).flat())
            let eo_data = _.cloneDeep(this.parsed_eo_data.dict)
            let hits = this.parsed_eo_data.hits
            let user_picks = this.user_player_gws.filter(i => i.multiplier > 0)
            let user_team = this.team_data
            let points = this.gw_pid_pts
            for (let pick of user_picks) {
                pick.pts = points?.[pick.gw]?.[pick.id] || 0
                pick.xpts = xp_dict?.[pick.gw + '_' + pick.id] || 0
                pick.total_pts = pick.pts * pick.multiplier
                pick.eo = eo_data[pick.gw + '_' + pick.id] || 0
                pick.owned = true
                pick.own_rate = pick.multiplier * 100 - pick.eo
                pick.net = pick.pts * ((100 * pick.multiplier - pick.eo) /100)
                // table values
                pick.points_gain = pick.pts * pick.multiplier
                pick.relative_gain = pick.net
                pick.pred_gain = pick.xpts * ((100 * pick.multiplier - pick.eo) /100)
                pick.points_loss = pick.pts * pick.eo / 100
                pick.relative_loss = 0
                pick.pred_loss = 0
                pick.exp_diff = pick.pred_gain
                pick.real_diff = pick.relative_gain
                pick.luck = pick.real_diff - pick.exp_diff
                delete all_pairs[pick.gw + '_' + pick.id]
            }
            all_pairs = Object.values(all_pairs)
            for (let pair of all_pairs) {
                pair.pts = points[pair.gw][pair.id] || 0
                pair.xpts = xp_dict[pair.gw + '_' + pair.id] || 0
                pair.total_pts = pair.pts
                pair.eo = eo_data[pair.gw + '_' + pair.id] || 0
                pair.owned = false
                pair.net = -1 * pair.pts * (pair.eo / 100)
                // table values
                pair.points_gain = 0
                pair.relative_gain = 0
                pair.pred_gain = 0
                pair.points_loss = pair.pts * pair.eo / 100
                pair.relative_loss = pair.points_loss
                pair.pred_loss = pair.xpts * pair.eo / 100
                pair.exp_diff = -pair.points_loss
                pair.real_diff = -pair.relative_loss
                pair.luck = pair.real_diff - pair.exp_diff
            }
            let all_data = all_pairs.concat(user_picks)
            let player_gains = _(all_data).groupBy('id')
                .map((i,v) => {
                    let gain = getSum(i.map(j => j.relative_gain))
                    let loss = getSum(i.map(j => j.relative_loss))
                    let pts = getSum(i.map(j => j.pts))
                    let xgain = getSum(i.map(j => j.pred_gain))
                    let xloss = getSum(i.map(j => j.pred_loss))
                    let xpts = getSum(i.map(j => j.xpts))
                    let xdiff = xgain - xloss
                    let diff = gain - loss
                    let luck = diff - xdiff
                    return {
                        'id': v, 
                        gain, loss, 'net': gain - loss, 
                        'magnitude': Math.abs(gain - loss), 'points': pts,
                        xgain, xloss, 'xnet': xgain-xloss,
                        'xmagnitude': Math.abs(xgain - xloss), 'xpoints': xpts,
                        diff, xdiff, luck, 'luckmagnitude': Math.abs(luck)
                    }
                }).value()
            player_gains = _(player_gains).orderBy(['magnitude'], ['desc']).value()
            let max_impact = player_gains[0].magnitude
            player_gains.forEach((e) => {e.impact = e.magnitude / max_impact * 100})

            player_xgains = _(_.cloneDeep(player_gains)).orderBy(['xmagnitude'], ['desc']).value()
            let exp_max_impact = player_xgains[0].xmagnitude
            player_xgains.forEach((e) => {e.ximpact = e.xmagnitude / exp_max_impact * 100})

            player_luck = _(_.cloneDeep(player_gains)).orderBy(['luckmagnitude'], ['desc']).value()
            let max_luck = player_luck[0].luckmagnitude
            player_luck.forEach((e) => {e.luckimpact = e.luckmagnitude / max_luck * 100})

            let combined = Object.entries(_.groupBy(all_data, 'gw'))
            for (let gw_entry of combined) {
                let groups = _.groupBy(gw_entry[1], (entry) => entry.net >0)
                if (!groups.hasOwnProperty('false')) { groups['false'] = []}
                if (!groups.hasOwnProperty('true')) { groups['true'] = []}
                let loss = getSum(groups.false.map(i => i.net))
                let gain = getSum(groups.true.map(i => i.net))
                let xloss = getSum(groups.false.map(i => i.xnet))
                let xgain = getSum(groups.true.map(i => i.xnet))
                let gw_field_hits = hits[parseInt(gw_entry[0])-1]
                if (gw_field_hits == undefined) {
                    gw_field_hits = {'hit_total': 0, 'teams': 0}
                }
                let hit_gain = gw_field_hits.hit_total / Math.max(1,gw_field_hits.teams)
                let gain_with_hit = gain + hit_gain
                let hit_loss = _.get(user_team[gw_entry[0]], 'entry_history.event_transfers_cost') || 0
                let loss_with_hit = loss - hit_loss
                let top_losses = _.orderBy(groups.false, ['net'], ['asc']).slice(0,3)
                let top_gains = _.orderBy(groups.true, ['net'], ['desc']).slice(0,3)
                let gw_picks = gw_entry[1].filter(i => i.owned)
                gw = gw_entry[0]
                let this_gw_own = gw_picks.map(i => i.own_rate)
                // own_perc = getSum(gw_entry[1].filter(i => i.owned).map(i => i.multiplier*100 - i.eo))/1200
                let total_own = getSum(gw_entry[1].map(i => i.eo))
                let risk = getSum(this_gw_own) / total_own * 100
                let top_bets_for = _.orderBy(gw_picks, ['own_rate'], ['desc']).slice(0,3)
                let top_bets_against = _.orderBy(gw_entry[1].filter(i => !i.owned), ['eo'], ['desc']).slice(0,3)
                let net = gain + loss
                let xnet = xgain + xloss
                gw_entry[1] = {net, xnet, loss, gain, xgain, loss_with_hit, gain_with_hit, top_gains, top_losses, gw, risk, this_gw_own, top_bets_for, top_bets_against}
            }
            all_pairs = all_pairs.filter(i => i.eo > 2 && i.total_pts > 3 && i.net <= -1)
            return {'picked_players': user_picks, 'gains': user_picks, 'losses': all_pairs, 'combined_per_gw': combined, 'combined_per_player': player_gains, 'combined_per_player_exp': player_xgains, 'comb_per_player_luck': player_luck}
        },
        user_candlestick_values() {
            if (!this.is_ready) { return [] }
            let values = this.user_ownership_gain_loss.combined_per_gw
            let flat_vals = values.map(i => i[1]).flat()
            let current = 0
            let chart_entries = []
            for (let e of flat_vals) {
                let original = current
                current += e.gain
                chart_entries.push({...e, 'was': original, 'current': current, 'part': 1})
                original = current
                current += e.loss
                chart_entries.push({...e, 'was': original, 'current': current, 'part': 2})
            }
            return chart_entries
        },
        team_fdr_values() {
            let fivethirtyeight_data = this.fdr_data
            let teams = _.cloneDeep(teams_ordered)
            teams.forEach((team, order) => {
                let team_name = team.name;
                let entry = fivethirtyeight_data.find(i => i.name == team_name)
                if (entry == undefined) {
                    let team_long = team.long;
                    entry = fivethirtyeight_data.find(i => i.name == team_long)
                }
                team.offense = parseFloat(entry.off);
                team.defense = parseFloat(entry.def);
                team.strength = parseFloat(entry.off) - parseFloat(entry.def)
                team.raw = entry;
                let keys = Object.keys(team_codes)
                let key = keys.find(i => team_codes[i].name == team_name)
                team.key = key
                team.order = order
            })

            let offense_max = Math.max(...teams.map(i => i.offense))
            let offense_min = Math.min(...teams.map(i => i.offense))
            let defense_max = Math.max(...teams.map(i => i.defense))
            let defense_min = Math.min(...teams.map(i => i.defense))
            let c = (r) => d3.scaleLinear().domain([0, 0.5, 1]).range(["#67ADB2", "#999898", "#C85454"])(r)
            teams.forEach((team, order) => {
                team.offense_ratio = (team.offense - offense_min) / (offense_max - offense_min)
                team.defense_ratio = (defense_max - team.defense) / (defense_max - defense_min)
                team.offense_color = c(team.offense_ratio)
                team.defense_color = c(team.defense_ratio)
            })
            return teams;
        },
        user_fdr_values() {
            if (!this.is_ready) { return [] }
            let fixture = Object.fromEntries(this.fixture_data.map(i => [i.id, i]))
            let picks = this.user_picks_detailed.filter(i => i.identifier == 'minutes' && i.multiplier > 0)
            let fdr_values = this.team_fdr_values
            let fpl_data = this.fpl_element
            let total_points_dict = Object.fromEntries(this.user_grouped_by_fixture)

            picks.forEach((p) => {
                let game = fixture[p.fixture]
                let self_team = fpl_data[p.id].team
                let opposite = self_team == game.team_h ? game.team_a : game.team_h
                let fixture_fdr = fdr_values[opposite-1]
                p.fixture_fdr = fixture_fdr
                let pf = p.player_fdr = p.eltype <= 2 ? fixture_fdr.offense : fixture_fdr.defense

                p.player_fdr_ratio = p.eltype <= 2 ? fixture_fdr.offense_ratio : fixture_fdr.defense_ratio

                p.self_team = fdr_values[self_team-1]
                p.opp_team = fdr_values[opposite-1]
                p.position = element_type[p.eltype].short

                p.self_team_fdr = p.eltype <= 2 ? p.self_team.defense_ratio : p.self_team.offense_ratio

                p.total = getSum(total_points_dict[p.id][p.fixture].map(i => i.points))
                
            })

            picks = _(picks).orderBy(['player_fdr_ratio', 'self_team_fdr', 'total'], ['asc', 'desc', 'desc']).value()

            return picks
        },
        user_fdr_tiers() {
            if (!this.is_ready) {return [] }
            let groups = [.25, .50, .75, 1]
            let picks = this.user_fdr_values
            picks.forEach((p) => {
                for (let i in groups) {
                    if (p.player_fdr_ratio <= groups[i]) {
                        p.tier = i
                        break
                    }
                }
            })
            let tiers = {}
            for (let type of [1,2,3,4]) {
                let ct = tiers[type] = {}
                let group_picks = picks.filter(i => i.eltype==type)
                for (let tier in _.range(groups.length)) {
                    ct[tier] = group_picks.filter(i => i.tier == tier).length
                }
            }
            return {groups, tiers}
        },
        player_xp_dict() {
            if (_.isEmpty(this.xp_data)) { return }
            let e = this.xp_data
            return Object.fromEntries(e.map(i => [i.gw + '_' + i.ID, _.round(parseFloat(i.xp),2)]))
        },
        player_gw_reference() {
            if (_.isEmpty(this.xp_data)) { return }
            let e = this.xp_data
            return Object.fromEntries(e.map(i => [i.gw + '_' + i.ID, i]))
        },
        user_gw_results() {
            if (_.isEmpty(this.team_data) || _.isEmpty(this.xp_data)) { return }
            let xp_dict = this.player_xp_dict
            let rp_dict = this.pid_gw_pts
            let eo_dict = this.parsed_eo_data
            let el_ids = _.uniq(this.el_data.map(i => i.id))
            let gws = Object.keys(this.team_data).map(i => parseInt(i))
            let gw_results = {}
            let total_exp_diff=0, total_real_diff=0, total_xp=0, total_rp=0, total_field_xp=0, total_field_rp=0, total_exp_real_diff=0;

            gws.forEach((gw) => {
                let gw_picks = this.team_data[gw].picks
                let gw_hit = this.include_hits ? _.get(this.team_data[gw], 'entry_history.event_transfers_cost') || 0 : 0
                let gw_field_hits = eo_dict.hits[gw-1]
                if (gw_field_hits == undefined) {
                    gw_field_hits = {'hit_total': 0, 'teams': 0}
                }
                let field_hit = this.include_hits ? gw_field_hits.hit_total / Math.max(1,gw_field_hits.teams) : 0

                let xp = _.round(_.sum(gw_picks.map(i => i.multiplier * (_.get(xp_dict, gw + '_' + i.element) || 0))),2) - gw_hit
                let rp = _.sum(gw_picks.map(i => i.multiplier * (_.get(rp_dict, i.element + '.' + gw) || 0))) - gw_hit
                let diff = _.round(rp-xp,2)

                let field_xp = _.round(_.sum(el_ids.map(i => (_.get(eo_dict, 'dict.' + gw + '_' + i) || 0)/100 * (_.get(xp_dict, gw + '_' + i) || 0))),2) - field_hit
                let field_rp = _.round(_.sum(el_ids.map(i => (_.get(eo_dict, 'dict.' + gw + '_' + i) || 0)/100 * (_.get(rp_dict, i + '.' + gw) || 0))),2) - field_hit
                let field_diff = _.round(field_rp - field_xp, 2)

                let exp_diff = _.round(xp - field_xp, 2)
                let real_diff = _.round(rp - field_rp, 2)

                total_exp_diff += exp_diff
                total_real_diff += real_diff

                total_xp += xp
                total_rp += rp
                total_field_xp += field_xp
                total_field_rp += field_rp

                let luck = real_diff - exp_diff
                total_exp_real_diff += luck

                let skill_ratio = _.round(100 * exp_diff / (Math.abs(exp_diff) + Math.abs(luck)),1)
                let luck_ratio = _.round(100 * luck / (Math.abs(exp_diff) + Math.abs(luck)), 1)

                let total_skill_ratio = _.round(100 * total_exp_diff / (Math.abs(total_exp_diff) + Math.abs(total_exp_real_diff)), 1)
                let total_luck_ratio = _.round(100 * total_exp_real_diff / (Math.abs(total_exp_diff) + Math.abs(total_exp_real_diff)), 1)

                gw_results[gw] = {
                    gw, xp, rp, diff, 
                    field_xp, field_rp, field_diff, 
                    exp_diff, real_diff, 
                    total_exp_diff, total_real_diff, 
                    total_xp, total_rp, 
                    total_field_xp, total_field_rp, 
                    luck, total_exp_real_diff,
                    skill_ratio, luck_ratio,
                    total_skill_ratio, total_luck_ratio
                }
            })

            setTimeout(() => {
                if (gw_results[38] != undefined){
                    app.luck_input = gw_results[38].total_luck_ratio
                }
            }, 100)
            

            return {'start': _.min(gws), 'finish': _.max(gws), 'data': gw_results}
        },
        calculated_luck() {
            if (_.isEmpty(this.final_outcome)) { return undefined}
            let skill = this.final_outcome.total_exp_diff
            if (Math.abs(skill) < 1) { skill = 1}

            if (this.luck_input == 0) {
                return 0
            }
            else if (this.luck_input > 0) {
                return Math.abs(skill) * this.luck_input / (100-this.luck_input)
            }
            else {
                return Math.abs(skill) * this.luck_input / (100+this.luck_input)
            }
        },
        calculated_total() {
            if (_.isEmpty(this.final_outcome)) { return undefined}
            return this.final_outcome.total_exp_diff + this.calculated_luck
        },
        final_outcome() {
            if (_.isEmpty(this.user_gw_results)) { return undefined }
            return this.user_gw_results.data[38]
        },
        potential_result() {
            let score = this.calculated_total
            for (tier of this.season_targets) {
                if (score > tier[2]) {
                    if (tier[0] == 1) { return "1" }
                    else {
                        return "Top " + formatnumber(tier[0])
                    }
                }
            }
            return "9M+"
        },
        transfer_analysis() {
            if (!this.is_ready) { return undefined }
            let team_data = this.team_data
            let all_gws = _.range(1,39)
            let analysis = {'gws': {}}
            let elements = this.fpl_element
            let el_data = this.el_data
            let gw_ref = this.player_gw_reference
            let xp_dict = app.player_xp_dict
            let rp_dict = app.pid_gw_pts

            let xp_val = (el,week) => (_.get(xp_dict, week+"_"+el) || 0)
            let rp_val = (el,week) => (_.get(rp_dict, el + '.' + week) || 0)
            let xp_sum = (el,weeks) => _.sum(weeks.map(i => xp_val(el,i.gw) * i.mult))
            let rp_sum = (el,weeks) => _.sum(weeks.map(i => rp_val(el,i.gw) * i.mult))
            let find_best_xp = (el_type, cost, weeks, exclude, target_week) => {
                if (weeks.length == 0) { return undefined}
                let candidates = el_data.filter(i => i.element_type==el_type).filter(i => gw_ref[target_week + '_' + i.id]).filter(i => parseFloat(gw_ref[target_week + '_' + i.id].price) <= parseFloat(cost))
                    .filter(i => !exclude.includes(i.id))
                let totals = candidates.map(i => { return {...i, 'xp_total': xp_sum(i.id, weeks)}})
                let best = _.cloneDeep(_.maxBy(totals, 'xp_total'))
                best.rp_total = rp_sum(best.id, weeks)
                best.cost = gw_ref[weeks[0].gw + '_' + best.id].price
                return best
            }
            let find_best_rp = (el_type, cost, weeks, exclude, target_week) => {
                if (weeks.length == 0) { return undefined}
                let candidates = el_data.filter(i => i.element_type==el_type).filter(i => gw_ref[target_week + '_' + i.id]).filter(i => parseFloat(gw_ref[target_week + '_' + i.id].price) <= parseFloat(cost))
                    .filter(i => !exclude.includes(i.id))
                let totals = candidates.map(i => { return {...i, 'rp_total': rp_sum(i.id, weeks)}})
                let best = _.cloneDeep(_.maxBy(totals, 'rp_total'))
                best.xp_total = xp_sum(best.id, weeks)
                best.cost = gw_ref[weeks[0].gw + '_' + best.id].price
                return best
            }

            all_gws.forEach((w) => {
                if (team_data[w] == undefined) { return }
                let tr_count = team_data[w].entry_history.event_transfers
                let tr_cost = team_data[w].entry_history.event_transfers_cost
                let chip = team_data[w].active_chip
                if (w == 1 || tr_count == 0 || chip == 'freehit' || chip == 'wildcard') { return }
                let this_gw_team = team_data[w].picks.map(i => i.element)
                let last_gw_team = undefined
                if (team_data[w-1].active_chip == 'freehit') {
                    last_gw_team = team_data[w-2].picks.map(i => i.element)
                }
                else {
                    last_gw_team = team_data[w-1].picks.map(i => i.element)
                }
                let sold = _.cloneDeep(_.difference(last_gw_team, this_gw_team).map(i => elements[i]))
                let bought = _.cloneDeep(_.difference(this_gw_team, last_gw_team).map(i => elements[i]))
                let gw_transfer = []
                sold.forEach((p) => {
                    let match = bought.find(i => i.used==undefined && i.element_type == p.element_type)
                    match.used = true
                    let new_p = match.id
                    // check future GWs for new player
                    future_five = _.range(w, w+5)
                    let future_plays = future_five.filter(j => team_data[j]).map(j => { return {'gw': j, 'play': team_data[j].picks.find(k => k.element == new_p)}}).filter(j => j.play != undefined).filter(j => j.play.multiplier > 0)
                    future_plays.forEach((f) => {f.mult = f.play.multiplier})
                    let bought_player_plays = future_plays.map(i => {return {...i, 'xp': xp_dict[i.gw + '_' + new_p] || 0, 'rp': rp_val(new_p, i.gw)}})
                    let sold_player_plays = future_plays.map(i => {return {gw: i.gw, 'mult': i.play.multiplier}}).map(i => {return {...i, 'xp': xp_dict[i.gw + '_' + p.id] || 0, 'rp': rp_val(p.id, i.gw)}})

                    let sold_xp_total = _.sum(Object.values(sold_player_plays).map(i => i.xp * i.mult))
                    let bought_xp_total = _.sum(Object.values(bought_player_plays).map(i => i.xp * i.mult))
                    let xp_diff = bought_xp_total - sold_xp_total

                    let sold_rp_total = _.sum(Object.values(sold_player_plays).map(i => i.rp * i.mult))
                    let bought_rp_total = _.sum(Object.values(bought_player_plays).map(i => i.rp * i.mult))
                    let rp_diff = bought_rp_total - sold_rp_total

                    let gw_list = future_plays.map(i => i.play.multiplier > 1 ? `${i.gw} (${i.play.multiplier == 2 ? "C" : "TC"})` : i.gw).join(', ')

                    let fs_optimal = false
                    let hs_optimal = false
                    let missed_rp = 0
                    let missed_xp = 0

                    let xp_ratio_raw = undefined
                    let xp_ratio = undefined
                    
                    let best_xp = find_best_xp(elements[p.id].element_type, gw_ref?.[w + '_' + match.id]?.price, future_plays, last_gw_team, w)
                    if (best_xp != undefined) {
                        best_xp.xp_diff = best_xp.xp_total - sold_xp_total
                        best_xp.rp_diff = best_xp.rp_total - sold_rp_total
                        fs_optimal = best_xp.id == match.id
                        missed_xp = best_xp.xp_total - bought_xp_total
                        xp_ratio_raw = bought_xp_total / best_xp.xp_total * 100
                        if (best_xp.xp_total == 0) { xp_ratio_raw = 100 }
                        xp_ratio = rounded(xp_ratio_raw,1) + '%'

                    }
                    let best_rp = find_best_rp(elements[p.id].element_type, gw_ref[w + '_' + match.id].price, future_plays, last_gw_team, w)
                    if (best_rp != undefined) {
                        best_rp.xp_diff = best_rp.xp_total - sold_xp_total
                        best_rp.rp_diff = best_rp.rp_total - sold_rp_total
                        hs_optimal = best_rp.id == match.id
                        missed_rp = best_rp.rp_total - bought_rp_total
                    }
                    gw_transfer.push({
                        'gw': w, 'sold': p.id, 'bought': match.id, 
                        gw_list,
                        future_plays, bought_player_plays, sold_player_plays, 
                        xp_diff, rp_diff,
                        'sold_price': gw_ref[w + '_' + p.id].price,
                        'bought_price': gw_ref[w + '_' + match.id].price,
                        best_xp, best_rp,
                        hs_optimal, fs_optimal,
                        'best_xp_tr': false, 'best_rp_tr': false,
                        missed_xp, missed_rp,
                        xp_ratio_raw, xp_ratio
                    })
                })
                
                analysis.gws[w] = gw_transfer

                

            })

            let all_tr = Object.values(analysis.gws).flat().filter(i => i.best_xp != undefined)
            analysis.fs_ratio = rounded(all_tr.filter(i => i.fs_optimal).length / all_tr.length * 100,1) + '%'
            analysis.hs_ratio = rounded(all_tr.filter(i => i.hs_optimal).length / all_tr.length * 100,1) + '%'

            best_xp_transfer = _.maxBy(all_tr, 'xp_diff')
            if (best_xp_transfer) { best_xp_transfer.best_xp_tr = true}
            best_rp_transfer = _.maxBy(all_tr, 'rp_diff')
            if (best_rp_transfer) { best_rp_transfer.best_rp_tr = true}
            analysis.tr_optimality = _.sum(all_tr.map(i => i.xp_ratio_raw)) / Math.max(all_tr.length,1)

            return analysis
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
            $("#gain_table").DataTable().destroy()
            $("#loss_table").DataTable().destroy()
            $("#total_gain_loss_table").DataTable().destroy()
            $("#total_exp_gain_loss_table").DataTable().destroy()
            $("#total_player_luck_table").DataTable().destroy()
            $("#all_fdr_table").DataTable().destroy()

            this.team_data = {}
            let cache = {};
            let gw = 1;
            let calls = []

            let init_call = get_team_info(this.team_id).then((response) => {
                this.team_info = response
                let cached_info = JSON.parse(localStorage.getItem('team_info'))
                if (cached_info == null) { cached_info = {}}
                _.set(cached_info, `${app.season}.T${app.team_id}`, response)
                if (!this.off_season) {
                    localStorage.setItem('team_info', JSON.stringify(cached_info))
                }
                
            }).catch((e) => {
                // check if localstorage has it
                let cached_info = JSON.parse(localStorage.getItem('team_info'))
                let team_cached_info = _.get(cached_info, app.season + '.T' + app.team_id)
                if (team_cached_info != null) {
                    this.team_info = team_cached_info
                }
            })
            calls.push(init_call)

            let stored_team_picks = JSON.parse(localStorage.getItem('team_picks'))
            let this_season = this.season
            if (stored_team_picks == null) {
                stored_team_picks = {}
                _.set(stored_team_picks, this_season + '.T' + app.team_id, {})
            }
            else if (_.get(stored_team_picks, this_season + '.T' + app.team_id) == undefined) {
                _.set(stored_team_picks, this_season + '.T' + app.team_id, {})
            }
            let season_picks = stored_team_picks[this_season]['T'+app.team_id]

            for (gw = 1; gw <= this.max_gw; gw++) {
                console.log('Fetching GW', gw);
                let current_gw = gw;
                if (app.caches_enabled && current_gw != app.next_gw && season_picks != undefined && current_gw in season_picks) {
                    app.$set(app.team_data, current_gw, season_picks[current_gw])
                }
                else {
                    let call = get_team_picks({
                        gw: current_gw,
                        team_id: app.team_id,
                        force_last_gw: false
                    })
                    .then((response) => {
                        season_picks[current_gw] = response.body
                        app.$set(app.team_data, current_gw, response.body)
                    })
                    .catch((e) => {
                        console.error(e)
                        let empty_gw = {
                            active_chip: null,
                            automatic_subs: [],
                            entry_history: {
                                bank: 0,
                                event: current_gw,
                                event_transfers: 0,
                                event_transfers_cost: 0,
                                overall_rank: 0,
                                points: 0,
                                points_on_bench: 0,
                                rank: 0,
                                rank_sort: 0,
                                total_points: 0,
                                value: 0,
                            },
                            picks: []
                        }
                        // app.$set(app.team_data, current_gw, empty_gw)
                        // ignore
                    })
                    calls.push(call)
                }
            }
            Promise.allSettled(calls).then(() => {
                this.team_data = Object.freeze(this.team_data)
                if (!app.off_season) {
                    localStorage.setItem('team_picks', JSON.stringify(stored_team_picks))
                }
                setTimeout(() => {
                    app.$nextTick(() => {
                        app.ready = true
                        app.loading = false
                        app.$nextTick(() => {
                            app.refresh_table()
                            app.draw_top_5()
                            app.draw_pos_heatmap()
                            app.draw_radar_svg()
                            draw_event_heatmap()
                            draw_gain_loss_candlestick()
                            draw_predicted_realized_diff()
                            draw_risk_reward_plot()
                            draw_tree_map()
                            draw_tree_map_loss()
                            draw_team_season_visual()
                            draw_point_origin_graph()
                        })
                    })
                }, 100)
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
                scrollX: true,
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

            $("#gain_table").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
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

            $("#loss_table").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
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
            

            let tg_table = $("#total_gain_loss_table").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
                scrollX: true,
                // sScrollX: "100%",
                // responsive: true,
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

            tg_table.buttons().container()
                .appendTo('#csv_buttons4');

            let tge_table = $("#total_exp_gain_loss_table").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
                scrollX: true,
                // sScrollX: "100%",
                // responsive: true,
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

            tge_table.buttons().container()
                .appendTo('#csv_buttons_exp');

            let tgl_table = $("#total_player_luck_table").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
                scrollX: true,
                // sScrollX: "100%",
                // responsive: true,
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

            tgl_table.buttons().container()
                .appendTo('#csv_buttons_luck_table');



            

            let fdr_table = $("#all_fdr_table").DataTable({
                "lengthChange": false,
                "order": [],
                "info": true,
                "paging": true,
                "pageLength": 15,
                "searching": true,
                scrollX: true,
                // sScrollX: "100%",
                // responsive: true,
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
            fdr_table.buttons().container()
                .appendTo('#csv_buttons5');


        },
        add_ID_to_compare() {

            let val = document.getElementById("new_id").value
            document.getElementById("new_id").value = ""

            let gw = 1;
            let calls = []
            responses = {}
            let opp_info = {}

            let init_call = get_team_info(val).then((response) => {
                opp_info = response
            })
            calls.push(init_call)

            for (gw = 1; gw < this.max_gw; gw++) {
                console.log('Fetching GW', gw);
                let current_gw = gw;
                let call = get_team_picks({
                        gw: current_gw,
                        team_id: val,
                        force_last_gw: false
                    })
                    .then((response) => {
                        responses[current_gw] = response.body
                    })
                calls.push(call)
            }
            Promise.allSettled(calls).then(() => {
                this.rival_info.push({
                    'info': opp_info,
                    'picks': responses
                })
                draw_radar_map()
            });
        },
        clear_rivals() {
            this.rival_info = []
            draw_radar_map()
        },
        invalidate_cache() {
            this.$nextTick(() => {
                var table = $("#gain_table").DataTable();
                table.cells("td").invalidate().draw();
                table = $("#loss_table").DataTable();
                table.cells("td").invalidate().draw();
                table = $("#total_gain_loss_table").DataTable();
                table = $("#total_exp_gain_loss_table").DataTable();
                table = $("#total_player_luck_table").DataTable();
                table.cells("td").invalidate().draw();

                
            })
        }
    }
})

function get_team_stats_picks(picks) {

    let team_data = picks
    let fpl_data = app.fpl_element
    let stat_detailed = app.stats_per_gw_detailed
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
}

function export_raw_data() {
    let obj = Object.entries(app.$data).filter(i => !i[0].includes("_table"))
    downloadToFile(JSON.stringify(obj, undefined, 2), 'myFPLdata.json', 'application/json')
}

function export_all_data() {
    let raw_data = Object.entries(app.$data).filter(i => !i[0].includes("_table"))
    let comp_data = Object.fromEntries(Object.keys(app.$options.computed).map(i => [i, app[i]]))
    let obj = {...raw_data, ...comp_data}
    downloadToFile(JSON.stringify(obj, undefined, 2), 'myFPLdata_extended.json', 'application/json')
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
    // let max_x = Math.max(Math.max(...pts_data.map(i => i[0])), parseInt(gw))
    let max_x = 39

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
        .attr("dominant-baseline", "bottom")
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr("y", (d) => y(d[2] || 0) - 5)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text((d) => 'x' + d[1]);

    // Plot title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")
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
        .attr("dominant-baseline", "middle")
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
        .attr("dominant-baseline", "middle")
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
        .attr("dominant-baseline", "middle")
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
        .attr("dominant-baseline", "middle")
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
        .attr("dominant-baseline", "middle")
        .attr("x", (d) => x("Total") + x.bandwidth() / 2)
        .attr("y", (d) => y("Total") + y.bandwidth() / 2)
        .attr("dy", 0)
        .attr("fill", "white")
        .attr("font-size", "12pt")
        .text(total);

}

function draw_radar_map() {
    if (!app.is_ready) { return }

    const raw_width = 500;
    const raw_height = 500;

    // bottom will be 40 when added new players
    const margin = { top: 10, right: 0, bottom: 10, left: 0 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;
    let margin_common = 50

    let center = { x: raw_width / 2, y: raw_height / 2 }

    document.getElementById("manager_comparison").innerHTML = ""

    const svg = d3.select("#manager_comparison")
        .insert("svg", ":first-child")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

    let raw_data = app.user_picks_custom_stats
    let data = [Object.entries(app.user_picks_custom_stats).map(i => ({'stat': i[0], 'value': i[1].count / i[1].total*100}))]
    const names = [app.team_info.player_first_name + " " + app.team_info.player_last_name]

    for (let r of app.rival_info) {
        names.push(r.info.player_first_name + " " + r.info.player_last_name)
        let picks = get_team_stats_picks(r.picks)
        data.push(Object.entries(picks).map(i => ({'stat': i[0], 'value': i[1].count / i[1].total*100})))
    }

    const maxvals = { 'Clean Sheet': 60, 'Goal': 60, 'Assist': 40, 'Bonus': 60, 'Captain': 70 }

    data.forEach((d) => { d.forEach((s) => { s.perc = s.value / maxvals[s.stat] }) })

    let axesDomain = data[0].map(i => i.stat)

    let dotRadius = 4
    let axisCircles = 5
    let radius = (height - (margin_common * 2)) / 2
    let axesLength = data[0].length
    let angleSlice = Math.PI * 2 / axesLength
    let axisLabelFactor = 1.15
    let maxValue = 1
    let rScale = d3.scaleLinear()
        .domain([0, maxValue])
        .range([0, radius])
    let radarLine = d3.lineRadial()
        .curve(d3['curveLinearClosed'])
        .radius(d => rScale(d))
        .angle((_, i) => i * angleSlice)
    let color = d3.scaleOrdinal()
        .range(["#EDC951", "#CC333F", "#00A0B0", "#00B055", "#71356D"])

    // let color = d3.scaleOrdinal(d3.schemeCategory10)

    var axisGrid = svg.append("g")
        .attr("class", "axisWrapper");

    axisGrid.selectAll(".levels")
        .data(d3.range(1, (axisCircles + 1)).reverse())
        .enter()
        .append("circle")
        .attr("class", "gridCircle")
        .attr("cx", center.x)
        .attr("cy", center.y)
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
        .attr("class", "legend text-with-shadow")
        .style("font-size", "12px")
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
        .attr("dominant-baseline", "middle")
        .attr("fill", "white")
        .attr("font-size", "8px")
        .attr("class", "text-with-shadow")
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
    let initial_x = (raw_width - (data.length * props.sep)) / 2

    legend
        .append("rect")
        .attr("x", initial_x - 10)
        .attr("y", legend_y - 10)
        .attr("width", data.length * props.sep + 20)
        .attr("height", props.height + 20)
        .attr("fill", "black")
        .attr("opacity", 0.4)

    legend.selectAll()
        .data(names)
        .enter()
        .append("rect")
        .attr("x", (d, i) => props.sep * i + initial_x)
        .attr("y", legend_y)
        .attr("width", props.width)
        .attr("height", props.height)
        .attr("stroke", "white")
        .attr("fill", (d, i) => color(i))

    legend.selectAll()
        .data(names)
        .enter().append("text")
        .attr("x", (d, i) => props.sep * i + initial_x + props.text_margin)
        .attr("y", legend_y + props.height / 2)
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", "white")
        .attr("font-size", "10px")
        .attr("class", "white-shadow")
        .text((d, i) => d)

}

function draw_event_heatmap() {

    if (!app.is_ready) { return }

    const raw_width = 500;
    const raw_height = 200;

    const margin = { top: 20, right: 10, bottom: 20, left: 60 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;

    let raw_data = app.user_stats_per_gw.gw_grouped
    let pt_data = app.user_stats_per_gw.points
    let type_data = app.user_stats_per_gw.type_grouped
    let overall_total = app.user_stats_per_gw.overall_total
    // let gws = Object.keys(raw_data)
    let gws = d3.range(1, 39).map(i => i.toString())
    let stats = Object.values(player_stat_types).map(i => i.name)
    let xvals = gws.concat(["Total"])
    let yvals = stats.concat(["Hits", "Total"])

    const svg = d3.select("#event_heatmap")
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
    svg.append('g').attr('transform', 'translate(0,' + height + ')').attr("class", "x-axis").call(d3.axisBottom(x).tickSize(0)).select(".domain").remove();
    svg.append('g').attr("class", "x-axis").call(d3.axisTop(x).tickSize(0)).select(".domain").remove();

    let y = d3.scaleBand()
        .range([0, height])
        .domain(yvals)
        .padding(0.05);
    svg.append('g').attr("class", "y-axis").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

    svg.call(s => s.selectAll(".x-axis").attr("font-size", "4pt"))
    svg.call(s => s.selectAll(".y-axis").attr("font-size", "5pt"))

    // svg.call(s => s.selectAll(".tick").attr("font-size", "8pt"))

    // var myColor = d3.scaleSequential()
    //     .interpolator(d3.interpolateBlues)
    //     .domain([0, valmax*1.3])

    let stat_names = Object.keys(player_stat_types)

    let data = []
    for (let gw of gws) {
        for (let stat of stat_names) {
            let d = gw in raw_data ? (stat in raw_data[gw] ? raw_data[gw][stat] : [] ) : []
            let sum = getSum(d.map(i => i.total_points))
            data.push([gw, player_stat_types[stat].name, sum])
        }
        data.push([gw, "Hits", gw-1 in pt_data ? - pt_data[gw-1].hit_pts : 0])
        data.push([gw, "Total", gw-1 in pt_data ? pt_data[gw-1].net_pts : 0])
    }
    for (let stat of stat_names) {
        let s = getSum((type_data[stat] || []).map( i=> parseInt(i.points * i.multiplier)))
        data.push(["Total", player_stat_types[stat].name, s])
    }
    // hit total
    let htot = -getSum(pt_data.map(i => i.hit_pts))
    data.push(["Total", "Hits", htot])
    data.push(["Total", "Total", overall_total])

    let valmax = Math.max(Math.max(...data.filter(i => i[1] != 'Total' && i[0] != 'Total').map(i => i[2])) , 1)
    let valmin = Math.min(...data.filter(i => i[1] != 'Total' && i[0] != 'Total').map(i => i[2]))
    let gwmax = Math.max(Math.max(...data.filter(i => i[1] == 'Total' && i[0] != 'Total').map(i => i[2])) , 1)
    let gwmin = Math.min(...data.filter(i => i[1] == 'Total' && i[0] != 'Total').map(i => i[2]))
    let stmax = Math.max(Math.max(...data.filter(i => i[0] == 'Total' && i[1] != 'Total').map(i => i[2])), 1)
    let stmin = Math.min(...data.filter(i => i[0] == 'Total' && i[1] != 'Total').map(i => i[2]))
    
    var sColor = (d) => {
        let p = d3.scaleLinear().domain([0, -valmin/(valmax-valmin), 1, 100]).range(["#e19797", "#ffffff", "#7FD3D9", "#7FD3D9"])
        return p((d-valmin) / (valmax- valmin))
    }
    var gwColor = (d) => {
        let p = d3.scaleLinear().domain([0, 1, 100]).range(["#ffffff", "#7FD3D9", "#7FD3D9"])
        return p((d-gwmin) / (gwmax - gwmin))
    }
    var totColor = (d) => {
        let p = d3.scaleLinear().domain([0, -stmin/(stmax-stmin), 1, 100]).range(["#e19797", "#ffffff", "#7FD3D9", "#7FD3D9"])
        return p((d-stmin) / (stmax - stmin))
    }

    svg.selectAll()
        .data(data)
        .enter()
        .append("rect")
        .attr("x", function(d) { return x(d[0]) })
        .attr("y", function(d) { return y(d[1]) })
        .attr("rx", 2)
        .attr("ry", 2)
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", (d) => {
            if (d[0] == 'Total' && d[1] == 'Total') { return 'orange'}
            else if (d[0] == 'Total') { return totColor(d[2])}
            else if (d[1] ==  'Total') { return gwColor(d[2])}
            else { return sColor(d[2])}
        })
        .style("stroke-width", 4)
        .style("stroke", "none")
        .style("opacity", 1)

    let text = svg.selectAll()
        .data(data)
        .enter()
        .append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")
        .attr("x", (d) => x(d[0]) + x.bandwidth() / 2)
        .attr("y", (d) => y(d[1]) + y.bandwidth() / 2)
        .attr("dy", 0)
        .attr("font-size", "3.5pt")
        .text((d) => d[2]);

    // Plot title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "hanging")
        .attr("dominant-baseline", "hanging")
        .attr("x", width / 2)
        .attr("y", height + 10)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Total points per event type and GW");

}

let refresh_y_axis;

function draw_gain_loss_candlestick() {

    if (!app.is_ready) { return }

    let existing = document.getElementById("candlestick-chart-1")
    if (existing)
        existing.remove()

    const raw_width = 500;
    const raw_height = 200;

    const margin = { top: 20, right: 10, bottom: 20, left: 25 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;

    let data = _.cloneDeep(app.user_candlestick_values)
    let cum_sum = 0
    data.forEach((e) => {
        e['before'] = cum_sum
        e['after'] = cum_sum + e.net
        if (e.part == 2) {cum_sum += e.net;}
    })

    const raw_svg = d3.select("#benefit-candlestick-chart")
    .insert("svg", ":first-child")
    .attr("id", "candlestick-chart-1")
    .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
    .attr('class', 'pull-center').style('display', 'block')
    // basic zoom - disabled
    // .call(d3.zoom().on("zoom", function (event) {
    //     svg.attr("transform", event.transform)
    //  }))
    .style('margin-bottom', '10px')

    raw_svg.append("defs").append("SVG:clipPath")
        .attr("id", "clip")
        .append("SVG:rect")
        .attr("width", width )
        .attr("height", height )
        .attr("x", 0)
        .attr("y", 0);
    
    let svg = raw_svg.append('g')
        .attr("class", "mainbg")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    svg.append("rect")
        .attr("id","rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .attr("clip-path", "url(#clip)")

    let chart_body = svg.append('g')
        .attr('clip-path', 'url(#clip)')

    let xvals = _.range(1, 39)
    let x = d3.scaleBand()
        .range([0, width])
        .domain(xvals)
        .padding(0);
    svg.append('g')
        .attr('transform', 'translate(0,' + height + ')')
        .attr('class', 'x-axis')
        .call(d3.axisBottom(x).tickSize(0));

    let val_sum = [...data.map(i => i.was), ...data.map(i => i.current)]
    let max_y = Math.max(...val_sum) + 5
    let min_y = Math.min(...val_sum) - 5

    let y = d3.scaleLinear().domain([min_y, max_y]).range([height, 0])
    svg.append('g').attr('class', 'y-axis').call(d3.axisRight(y).tickSize(width)
                        //.tickValues(d3.range(min_y, max_y, 4))
    )
    .call(g => g.selectAll(".tick line")
        .attr("stroke-opacity", 0.2)
        .attr("stroke", "#9a9a9a")
        .attr("pointer-events", "none")
    )
    .call(g => g.selectAll(".tick text")
        .attr("x", -10)
        .attr("font-size", "5pt")
        .attr("fill", "#9a9a9a")
        .attr("text-anchor", "end"))

    // axis style
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))
    svg.call(s => s.selectAll(".tick").attr("font-size", "5pt").attr("fill", "white"))
    svg.call(s => s.selectAll(".tick text").attr("fill", "white"))

    

    // gw backgrounds
    chart_body.selectAll()
        .data(xvals)
        .enter()
        .append('rect')
        .attr("width", x.bandwidth()) //x.bandwidth()/2 * 0.95)
        .attr("height", y(min_y)-y(max_y))
        .attr("x", (d) => x(d))
        .attr("y", y(max_y))
        .attr("class", (d) => d % 2 == 0 ? "gw-bg gw-bg-even" : "gw-bg gw-bg-odd")


    // zero line
    let zero_line = chart_body.append('g')
        .append('line')
        .attr('x1', x(0))
        .attr('y1', y(0))
        .attr('x2', width)
        .attr('y2', y(0))
        .style('stroke', 'white')
        .style("stroke-opacity", 0.5)
        .style("stroke-width", 1)
        .style('pointer-events', 'none');

    
    // extent = [[margin.left, margin.top], [width - margin.right, height-margin.top]]
    extent = [[0,0], [width, height]]
    let zoom = d3.zoom()
        .scaleExtent([1, 15])
        .translateExtent(extent)
        .extent(extent)
        .on("zoom", zoomin)
        .on('zoom.end', zoomend);

    let perc_gap = 0.07

    let mouseover = (e,d) => hoverBar(e,d) 
    let mousemove = (e,d) => hoverBar(e,d)
    let mouseleave = (e,d) => clearHover(e,d)

    let candles = chart_body.selectAll()
        .data(data)
        .enter()
        .append('rect')
        .attr("width", (d) => x.bandwidth() * (0.5-2*perc_gap)) //x.bandwidth()/2 * 0.95)
        .attr("height", (d) => Math.abs(y(d.current) - y(d.was)))
        .attr("x", (d) => {
            if (d.part == 1){
                return x(d.gw) + x.bandwidth() * perc_gap
            } else {
                return x(d.gw) + x.bandwidth() * (0.5 + perc_gap)
            }
        })
        .attr("y", (d) => y(Math.max(d.was, d.current)))
        .attr("class", (d) => d.part == 1 ? "candle candle-gain" : "candle candle-loss")
        .attr("opacity", 0.9)
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);
        
    raw_svg.call(zoom)

    function zoomin(event) {
        x.range([0, width].map(d => event.transform.applyX(d)))
        svg.selectAll("rect.candle")
            .attr("x", (d) => {
                if (d.part == 1){
                    return x(d.gw) + x.bandwidth() * perc_gap
                } else {
                    return x(d.gw) + x.bandwidth() * (0.5 + perc_gap)
                }
            })
            .attr("width", (d) => x.bandwidth() * (0.5-2*perc_gap));
        svg.selectAll("rect.gw-bg")
            .attr("x", (d) => x(d))
            .attr("width", x.bandwidth());
        svg.selectAll(".x-axis").call(g => g
            .attr('transform', 'translate(0,' + height + ')')
            .call(d3.axisBottom(x).tickSize(0)
                .tickFormat((d) => x(d) + x.bandwidth()/2 < 0 ? '' : d)))
    }

    let resizeTimer;

    function zoomend(event) {
        var t = event.transform
        clearTimeout(resizeTimer)
        resizeTimer = setTimeout(() => {
            refresh_y_axis()
        }, 300)
    }

    function hoverBar(event, d) {
        document.getElementById("hover_gw").innerHTML = d.gw
        document.getElementById("hover_gw_gain").innerHTML = getWithSign(d.gain)
        document.getElementById("hover_gw_loss").innerHTML = getWithSign(d.loss)
        let tg = '<span class="gain-blue">' + d.top_gains.map(i => app.fpl_element[i.id].web_name + ' (' + rounded(i.net,2) + ')').join('<br/>') + '</span>'
        let tl = '<span class="loss-red">' + d.top_losses.map(i => app.fpl_element[i.id].web_name + ' (' + rounded(i.net,2) + ')').join('<br/>') + '</span>'
        document.getElementById("hover_top_gains").innerHTML = tg
        document.getElementById("hover_top_losses").innerHTML = tl
        if (d.part == 1) {
            document.getElementById("hover_gw_gain").parentElement.classList.add("highlighted-div")
            document.getElementById("hover_top_gains").parentElement.classList.add("highlighted-div")
        }
        else if(d.part == 2) {
            document.getElementById("hover_gw_loss").parentElement.classList.add("highlighted-div")
            document.getElementById("hover_top_losses").parentElement.classList.add("highlighted-div")
        }
    }

    function clearHover(event, d) {
        // document.getElementById("hover_gw").innerHTML = ''
        // document.getElementById("hover_gw_gain").innerHTML = ''
        // document.getElementById("hover_gw_loss").innerHTML = ''
        // document.getElementById("hover_top_gains").innerHTML = ''
        // document.getElementById("hover_top_losses").innerHTML = ''
        document.querySelectorAll(".highlighted-div").forEach((e) => e.classList.remove("highlighted-div"))
    }

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Gameweeks");

    // y-title
    svg.append("text")
        .attr("text-anchor", "start")
        .attr("x", -margin.left + 2)
        .attr("y", -3)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Relative Change");

    function set_new_yaxis() {
        let filtered = data.filter(d => x(d.gw) >= 0 && x(d.gw) <= width);
        let cumulative = document.getElementById("cumulative_switch").checked
        let net_ch = document.getElementById("net_switch").checked
        let new_yvalues, new_max, new_min, y_func, h_func, o_func;

        if (cumulative == true) { // default
            if (net_ch == false) {
                new_yvalues = filtered.map(i => i.was).concat(filtered.map(i => i.current))
                y_func = (d) => y(Math.max(d.was, d.current))
                h_func = (d) => Math.abs(y(d.current) - y(d.was))
                o_func = (d) => 1
            }
            else {
                new_yvalues = filtered.map(i => i.before).concat(filtered.map(i => i.after))
                y_func = (d) => y(Math.max(d.before, d.after))
                h_func = (d) => Math.abs(y(d.after) - y(d.before))
                o_func = (d) => ((d.net >= 0 && d.part == 1) || (d.net < 0 && d.part == 2)) ? 0.9 : 0
            }

            new_max = Math.max(...new_yvalues) + 5
            new_min = Math.min(...new_yvalues) - 5
        }
        else { // individual bars
            if (net_ch == false){
                new_yvalues = filtered.map(i => Math.max(i.current-i.was, 0))
                y_func = (d) => y(Math.abs(d.was-d.current))
                h_func = (d) => Math.abs(y(d.current) - y(d.was))
                o_func = (d) => 1
            }
            else {
                new_yvalues = filtered.map(i => i.net)
                y_func = (d) => y(Math.max(0, d.net))
                h_func = (d) => Math.abs(y(d.after) - y(d.before))
                o_func = (d) => ((d.net >= 0 && d.part == 1) || (d.net < 0 && d.part == 2)) ? 0.9 : 0
            }
            
            new_max = Math.max(...new_yvalues) + 5
            new_min = Math.min(...new_yvalues, 0) - 5
            
        }

        y.domain([new_min, new_max])
        let yt = candles.transition()
            .duration(400)
        yt.attr("y", (d) => y_func(d))
        yt.attr("height", (d) => h_func(d))
        yt.attr("opacity", (d) => o_func(d))
        yt.attr("pointer-events", (d) => o_func(d) > 0.5 ? "auto" : "none" )

        svg.selectAll(".y-axis").transition().duration(400).call(g => g
            .call(d3.axisRight(y).tickSize(width))
        )
        .call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke", "#9a9a9a")
            .attr("pointer-events", "none")
        )
        .call(g => g.selectAll(".tick text")
            .attr("x", -10)
            .attr("font-size", "5pt")
            .attr("fill", "#9a9a9a")
            .attr("text-anchor", "end"))
        zero_line.transition().duration(400)
            .attr('y1', y(0))
            .attr('y2', y(0))

        return yt
    }

    function set_x_by_net(yt) {
        let net_ch = document.getElementById("net_switch").checked
        if (net_ch == true) {
            yt
                .attr("x", (d) => x(d.gw) + x.bandwidth() * perc_gap)
                .attr("width", x.bandwidth() * (1-2*perc_gap))
        } else {
            yt
                .attr("x", (d) => d.part == 1 ? x(d.gw) + x.bandwidth() * perc_gap : x(d.gw) + x.bandwidth() * (0.5 + perc_gap))
                .attr("width", x.bandwidth() * (0.5-2*perc_gap))
        }
    }

    let c_switch_timer = undefined;
    refresh_y_axis = () => {
        clearTimeout(c_switch_timer)
        c_switch_timer = setTimeout(() => {
            let yt = set_new_yaxis();
            set_x_by_net(yt);
        }, 100);
    }

    refresh_y_axis()

}

function draw_risk_reward_plot() {

    if (!app.is_ready) { return }

    let existing = document.getElementById("scatter-plot-1")
    if (existing)
        existing.remove()

    const raw_width = 500;
    const raw_height = 300;

    const margin = { top: 20, right: 10, bottom: 25, left: 25 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;

    let data = _.cloneDeep(app.user_ownership_gain_loss.combined_per_gw)
    let entries = data.map(i => ({'gw': i[0], ...i[1]}))

    // actual svg object
    const raw_svg = d3.select("#gw-risk-chart")
        .insert("svg", ":first-child")
        .attr("id", "scatter-plot-1")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
    
    // clip object for zoom/transition effects
    raw_svg.append("defs").append("SVG:clipPath")
        .attr("id", "clip2")
        .append("SVG:rect")
        .attr("width", width )
        .attr("height", height )
        .attr("x", 0)
        .attr("y", 0);

    // x clip
    // raw_svg.append("clipPath")
    //     .attr('id', 'clip-x-axis')
    //     .append('rect')
    //     .attr('x', 0)
    //     .attr('y', 0)
    //     .attr('width', width)
    //     .attr('height', margin.bottom);
    
    // // y clip
    // raw_svg.append("clipPath")
    //     .attr('id', 'clip-y-axis')
    //     .append('rect')
    //     .attr('x', - margin.left)
    //     .attr('y', 0)
    //     .attr('height', height)
    //     .attr('width', margin.left);

    // main container -- everything lives on top of this
    let svg = raw_svg.append('g')
        .attr("class", "mainbg")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");
    // hidden rect for interactivity
    svg.append("rect")
        .attr("id","rect")
        .attr("width", width)
        .attr("height", height)
        .style("fill", "none")
        .style("pointer-events", "all")
        .attr("clip-path", "url(#clip)")
    // inside group that bars/nodes appear (to get clipped on zoom)
    let chart_body = svg.append('g')
        .attr('clip-path', 'url(#clip2)')

    // x axis
    let max_x = 100
    let min_x = 0
    // let xvals = data.map(i => i.risk)
    let x = d3.scaleLinear()
        .range([0, width])
        .domain([min_x, max_x]);
    let x_group = svg.append('g')
        // .attr('transform', 'translate(0,' + height + ')')
        .attr('class', 'x-axis')
        // .attr('clip-path', 'url(#clip-x-axis)')

    // y axis
    let yvals = entries.map(i => i.net)
    let max_y = Math.ceil(Math.max(...yvals) / 5) * 5 + 5
    let min_y = Math.floor(Math.min(...yvals) / 5) * 5 - 5

    let y = d3.scaleLinear().domain([min_y, max_y]).range([height, 0])
    let y_group = svg.append('g')
        .attr('class', 'y-axis')
        // .attr('clip-path', 'url(#clip-y-axis)')
    
    function setup_axes(x_in, y_in) {

        
        x_group.call(d3.axisBottom(x_in).tickSize(height).tickFormat((d) => d + "%"));

        y_group.call(d3.axisRight(y_in).tickSize(width))
        .call(g => g.selectAll(".tick text")
            .attr("x", -5)
            .attr("text-anchor", "end"))
    
        // axis style
        svg.call(g => g.selectAll(".domain").attr("opacity", 0))
        svg.call(g => g.selectAll(".tick line")
            .attr("stroke-opacity", 0.2)
            .attr("stroke", "#9a9a9a")
            .attr("pointer-events", "none")
        )
        svg.call(s => s.selectAll(".tick").attr("font-size", "6pt").attr("fill", "white"))
        svg.call(s => s.selectAll(".tick text").attr("fill", "white"))
    }
    
    setup_axes(x,y)
    

    // zero line
    let zero_line = chart_body.append('g')
        .append('line')
        .attr('x1', x(0))
        .attr('y1', y(0))
        .attr('x2', width)
        .attr('y2', y(0))
        .style('stroke', 'white')
        .style("stroke-opacity", 0.5)
        .style("stroke-width", 1)
        .style('pointer-events', 'none');
    
    // zero line x
    let zero_line_2 = chart_body.append('g')
        .append('line')
        .attr('x1', x(50))
        .attr('y1', y(min_y))
        .attr('x2', x(50))
        .attr('y2', y(max_y))
        .style('stroke', 'white')
        .style("stroke-opacity", 0.5)
        .style("stroke-width", 1)
        .style('pointer-events', 'none');

    let extent = [[0,0], [width, height]]
    let zoom = d3.zoom()
        .scaleExtent([1, 10])
        .translateExtent(extent)
        .extent(extent)
        .on("zoom", applyZoom)
        // .on('zoom.end', zoomend);

    let mouseover = (e,d) => hoverRiskBar(e,d) 
    let mousemove = (e,d) => hoverRiskBar(e,d)

    let nodes = chart_body.selectAll()
        .data(entries)
        .enter()
        // .append('rect')
        // .attr("width", 6) //x.bandwidth()/2 * 0.95)
        // .attr("height", 6)
        // .attr("x", (d) => x(d.risk)-3)
        // .attr("y", (d) => y(d.net)-3)
        .append('circle')
        .attr('cx', (d) => x(d.risk))
        .attr('cy', (d) => y(d.net))
        .attr('r', 3)
        .attr("class", "risk-nodes")
        .attr("opacity", 0.9)
        .attr("fill", "orange")
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        // .on("mouseleave", mouseleave);

    function hoverRiskBar(event, d) {
        document.getElementById("risk_hover_gw").innerHTML = d.gw
        document.getElementById("risk_hover_diff_rate").innerHTML = rounded(d.risk) +"%"
        document.getElementById("risk_hover_reward").innerHTML = getWithSign(d.net)
        let tg = '<span class="gain-blue">' + d.top_bets_for.map(i => app.fpl_element[i.id].web_name + ' (' + rounded(i.own_rate,2) + '%)').join('<br/>') + '</span>'
        let tl = '<span class="loss-red">' + d.top_bets_against.map(i => app.fpl_element[i.id].web_name + ' (' + rounded(i.eo,2) + '%)').join('<br/>') + '</span>'
        document.getElementById("risk_top_bets_for").innerHTML = tg
        document.getElementById("risk_top_bets_against").innerHTML = tl
    }

    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Risk (Differential) Percentage");

    // y-title
    svg.append("text")
        .attr("text-anchor", "start")
        .attr("x", -margin.left + 2)
        .attr("y", -5)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Relative Change");

    function applyZoom(event) {
        const new_x = event.transform.rescaleX(x)
        const new_y = event.transform.rescaleY(y)
        setup_axes(new_x, new_y)
        nodes.attr("transform", event.transform) // you can redefine "r" if want the same radius
        zero_line.attr("transform", event.transform)
        zero_line_2.attr("transform", event.transform)
    }

    raw_svg.call(zoom)
}

function redraw_graphs() {
    draw_gain_loss_candlestick();
    draw_predicted_realized_diff();
    draw_risk_reward_plot();
    draw_team_season_visual();
    draw_point_origin_graph();
}

let refresh_point_dist;

function draw_tree_map() {
    const raw_width = 500;
    const raw_height = 400;

    const margin = { top: 5, right: 20, bottom: 25, left: 20 },
    width = raw_width - margin.left - margin.right,
    height = raw_height - margin.top - margin.bottom;

    let d1 = app.user_player_sum
    let player_data = d1.filter(i => i['points_total'] > 0)

    let gain = app.user_ownership_gain_loss.gains
    let player_gains = Object.fromEntries(_(gain).groupBy('id').map((i,v) => [v, getSum(i.map(j => j.net))]).value())
    player_data.forEach((e) => {
        e.value = e.points_total;
        e.pos = element_type[e.position].short
        e.gain = player_gains[e.id] || 0
    })
    
    const svg = d3.select("#points_tree_map")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .append('g')
        .attr("transform",
             "translate(" + margin.left + "," + margin.top + ")");

    let color_cat = d3.scaleOrdinal()
        .domain(["GK", "DF", "MD", "FW"])
        .range([ "#ff8811", "#E1A1A7", "#CBC5EA", "#87B37A"])
    var color = (c, e) => d3.interpolateRgb("#ffffff", color_cat(c))(e)  // ff8811

    // var opacity_by_pos = (d) => d3.scaleLinear()
    //     .domain([0, 200])
    //     .range([.4, 1])(d.data.value / d.data.pos)

    // var opacity = d3.scaleLinear()
    //     //.domain([0, 200])
    //     .domain([0, 1])
    //     .range([.5, 1])
    var fontsize = d3.scaleLinear()
        .domain([0, 1])
        .range([2, 6])

    // Plot title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 15)
        .attr("font-size", "6pt")
        .text("Total points by position/player")
        .attr("fill",  'white' )

    refresh_point_dist = () => {

        let gain_switch = document.getElementById("actual_gain_switch").checked || false

        let sorted_data = undefined;
        let text_func, pos_text;
        if (gain_switch) {
            player_data.forEach((e) => {e.value = Math.max(0, e.gain)})
            group_max = Object.fromEntries(_(player_data).groupBy('pos').map((i,v) => [v, Math.max(...i.map(j => j.gain))]).value())
            player_data.forEach((e) => {e.ratio = e.gain / group_max[e.pos]})
            sorted_data = _(player_data).orderBy(['points_total'], ['desc']).value()
            text_func = (d) => `${d.data.name} (${rounded(d.data.value)})`
            pos_text = (d) => `${d.data.name} (${rounded(d.value)})`
        }
        else {
            player_data.forEach((e) => {e.value = e.points_total})
            group_max = Object.fromEntries(_(player_data).groupBy('pos').map((i,v) => [v, Math.max(...i.map(j => j.points_total))]).value())
            player_data.forEach((e) => {e.ratio = e.points_total / group_max[e.pos]})
            sorted_data = _(player_data).orderBy(['points_total'], ['desc']).value()
            text_func = (d) => `${d.data.name} (${rounded(d.data.value)})`
            pos_text = (d) => `${d.data.name} (${rounded(d.value)})`
        }

        let pos_data = _(sorted_data).groupBy("pos").map((i,v) => ({'name': v, 'children': i})).value();
        pos_data = _.cloneDeep({'name': 'main', 'children': pos_data})

        // let pts_data = _(d1).groupBy("gw_no").map((gw,i) => [parseInt(i), gw.map(player => player.Contribution).reduce((a,b) => parseInt(a)+parseInt(b), 0)]).value();
        let newroot = d3.hierarchy(pos_data).sum(d => d.value);

        d3.treemap()
            .size([width, height])
            .paddingTop(10)
            .paddingRight(3)
            .paddingInner(2)
            (newroot);

        let newleaves = svg.selectAll('.tm-leaves')
            .data(newroot.leaves());
        newleaves.exit().remove();
        newleaves
            .enter()
            .append("rect")
            .attr("class", "tm-leaves")
            .style("stroke", "black")
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', 0)
            .attr('height', 0)
            .attr('fill', 'black');
            
        newleaves.transition().duration(500)
            .attr('x', function (d) { return d.x0; })
            .attr('y', function (d) { return d.y0; })
            .attr('width', function (d) { return d.x1 - d.x0; })
            .attr('height', function (d) { return d.y1 - d.y0; })
            .style("fill", function(d){ return color(d.parent.data.name, d.data.ratio)} );
        
        let newtext = svg.selectAll('.tm-text')
            .data(newroot.leaves());
        newtext.exit().attr('opacity', 1).text('').remove().attr('opacity', 0);
        newtext
            .enter()
            .append("text")
            .attr("class", "tm-text")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "hanging")
            .attr("dominant-baseline", "hanging")
            .attr("fill", "black")
            .text((d) => text_func(d));
        newtext.transition().duration(500)
            .attr("x", (d) => d.x0 + 2)
            .attr("y", (d) => d.y0 + 2)
        svg.selectAll('.tm-text').text((d) => text_func(d)).attr("font-size", (d) => fontsize(d.data.ratio)+ "pt");;

        let newpostext = svg.selectAll('.pos-summary')
            .data(newroot.descendants().filter(d => d.depth==1))
        newpostext.exit().remove()
        newpostext
            .enter()
            .append("text")
            .attr("class", "pos-summary")
            .attr("fill",  'white' )
        newpostext.transition().duration(500)
            .attr("x", function(d){ return d.x0})
            .attr("y", function(d){ return d.y0+8})
        svg.selectAll('.pos-summary').text((d) => pos_text(d)).attr("font-size", "6pt")
        
    }

    refresh_point_dist()
    refresh_point_dist()

}


function draw_tree_map_loss() {
    const raw_width = 500;
    const raw_height = 400;

    const margin = { top: 5, right: 20, bottom: 25, left: 20 },
    width = raw_width - margin.left - margin.right,
    height = raw_height - margin.top - margin.bottom;

    let player_data = app.user_ownership_gain_loss.combined_per_player
    player_data = player_data.filter(i => i.loss > 1 || i.gain < 0)
    player_data = _.cloneDeep(player_data)
    let el_dict = app.fpl_element

    player_data.forEach((e) => {
        e.value = e.loss + (e.gain < 0 ? -e.gain : 0)
        e.position = el_dict[e.id].element_type
        e.pos = element_type[e.position].short
        e.name = el_dict[e.id].web_name
    })
    
    const svg = d3.select("#points_tree_map_loss")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')
        .append('g')
        .attr("transform",
             "translate(" + margin.left + "," + margin.top + ")");

    let color_cat = d3.scaleOrdinal()
        .domain(["GK", "DF", "MD", "FW"])
        .range([ "#ff8811", "#E1A1A7", "#CBC5EA", "#87B37A"])
    var color = (c, e) => d3.interpolateRgb("#ffffff", color_cat(c))(e)  // ff8811

    // var opacity_by_pos = (d) => d3.scaleLinear()
    //     .domain([0, 200])
    //     .range([.4, 1])(d.data.value / d.data.pos)

    // var opacity = d3.scaleLinear()
    //     //.domain([0, 200])
    //     .domain([0, 1])
    //     .range([.5, 1])
    var fontsize = d3.scaleLinear()
        .domain([0, 1])
        .range([2, 6])

    // Plot title
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 15)
        .attr("font-size", "6pt")
        .text("Relative loss by position/player")
        .attr("fill",  'white' )

    let sorted_data = undefined;
    let text_func, pos_text;

    plot_now = () => {



        group_max = Object.fromEntries(_(player_data).groupBy('pos').map((i,v) => [v, Math.max(...i.map(j => j.loss))]).value())
        player_data.forEach((e) => {e.ratio = e.loss / group_max[e.pos]})
        sorted_data = _(player_data).orderBy(['loss'], ['desc']).value()
        text_func = (d) => `${d.data.name} (-${rounded(d.data.value)})`
        pos_text = (d) => `${d.data.name} (-${rounded(d.value)})`


        let pos_data = _(sorted_data).groupBy("pos").map((i,v) => ({'name': v, 'children': i})).value();
        pos_data = _.cloneDeep({'name': 'main', 'children': pos_data})

        // let pts_data = _(d1).groupBy("gw_no").map((gw,i) => [parseInt(i), gw.map(player => player.Contribution).reduce((a,b) => parseInt(a)+parseInt(b), 0)]).value();
        let newroot = d3.hierarchy(pos_data).sum(d => d.value);

        d3.treemap()
            .size([width, height])
            .paddingTop(10)
            .paddingRight(3)
            .paddingInner(2)
            (newroot);

        let newleaves = svg.selectAll('.tm-leaves')
            .data(newroot.leaves());
        newleaves.exit().remove();
        newleaves
            .enter()
            .append("rect")
            .attr("class", "tm-leaves")
            .style("stroke", "black")
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', 0)
            .attr('height', 0)
            .attr('fill', 'black');
            
        newleaves.transition().duration(500)
            .attr('x', function (d) { return d.x0; })
            .attr('y', function (d) { return d.y0; })
            .attr('width', function (d) { return d.x1 - d.x0; })
            .attr('height', function (d) { return d.y1 - d.y0; })
            .style("fill", function(d){ return color(d.parent.data.name, d.data.ratio)} );
        
        let newtext = svg.selectAll('.tm-text')
            .data(newroot.leaves());
        newtext.exit().attr('opacity', 1).text('').remove().attr('opacity', 0);
        newtext
            .enter()
            .append("text")
            .attr("class", "tm-text")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "hanging")
            .attr("dominant-baseline", "hanging")
            .attr("fill", "black")
            .text((d) => text_func(d));
        newtext.transition().duration(500)
            .attr("x", (d) => d.x0 + 2)
            .attr("y", (d) => d.y0 + 2)
        svg.selectAll('.tm-text').text((d) => text_func(d)).attr("font-size", (d) => fontsize(d.data.ratio)+ "pt");;

        let newpostext = svg.selectAll('.pos-summary')
            .data(newroot.descendants().filter(d => d.depth==1))
        newpostext.exit().remove()
        newpostext
            .enter()
            .append("text")
            .attr("class", "pos-summary")
            .attr("fill",  'white' )
        newpostext.transition().duration(500)
            .attr("x", function(d){ return d.x0})
            .attr("y", function(d){ return d.y0+8})
        svg.selectAll('.pos-summary').text((d) => pos_text(d)).attr("font-size", "6pt")
        
    }

    plot_now()
    plot_now()


}

function draw_predicted_realized_diff() {
    // season-xp-real-diff-plot

    if (!app.is_ready) { return }

    const raw_width = 500;
    const raw_height = 200;

    const margin = { top: 20, right: 10, bottom: 20, left: 25 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;

    let data = _.cloneDeep(app.user_gw_results)

    jQuery("#season-xp-real-diff-plot").empty()

    const raw_svg = d3.select("#season-xp-real-diff-plot")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')

    let svg = raw_svg.append('g')
        .attr("class", "mainbg")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    let xvals = _.range(1, 39)
    let x = d3.scaleBand()
        .range([0, width])
        .domain(xvals)
        .padding(0);
    svg.append('g')
        .attr('transform', 'translate(0,' + height + ')')
        .attr('class', 'x-axis')
        .call(d3.axisBottom(x).tickSize(0));

    let values = Object.values(data.data)
    let val_sum = [0, ...values.map(i => i.total_exp_diff), ...values.map(i => i.total_real_diff)]
    let max_y = Math.max(...val_sum) + 10
    let min_y = Math.min(...val_sum) - 10

    let y = d3.scaleLinear().domain([min_y, max_y]).range([height, 0])
    svg.append('g').attr('class', 'y-axis').call(d3.axisRight(y).tickSize(width).tickFormat((v) => v > 0 ? '+'+v : v)
                        //.tickValues(d3.range(min_y, max_y, 4))
    )
    .call(g => g.selectAll(".tick line")
        .attr("stroke-opacity", 0.2)
        .attr("stroke", "#9a9a9a")
        .attr("pointer-events", "none")
    )
    .call(g => g.selectAll(".tick text")
        .attr("x", -5)
        .attr("font-size", "5pt")
        .attr("fill", "#9a9a9a")
        .attr("text-anchor", "end"))

    // axis style
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))
    svg.call(s => s.selectAll(".tick").attr("font-size", "5pt").attr("fill", "white"))
    svg.call(s => s.selectAll(".tick text").attr("fill", "white"))

    // gw backgrounds
    svg.selectAll()
        .data(xvals)
        .enter()
        .append('rect')
        .attr("width", x.bandwidth()) //x.bandwidth()/2 * 0.95)
        .attr("height", y(min_y)-y(max_y))
        .attr("x", (d) => x(d))
        .attr("y", y(max_y))
        .attr("class", (d) => d % 2 == 0 ? "gw-bg gw-bg-even" : "gw-bg gw-bg-odd")


    // zero & 100 lines



    let markers = _.range(Math.min(100*Math.ceil(min_y/100), 0),max_y,100).filter(i => i != 0)

    let zero_line = svg.append('g')
        .append('line')
        .attr('x1', x(0))
        .attr('y1', y(0))
        .attr('x2', width)
        .attr('y2', y(0))
        .style('stroke', 'white')
        .style("stroke-opacity", 0.5)
        .style("stroke-width", 1)
        .style('pointer-events', 'none');

    let hundred_lines = svg.append('g')
        .selectAll()
        .data(markers)
        .enter()
        .append('line')
        .attr('x1', x(0))
        .attr('y1', d => y(d))
        .attr('x2', width)
        .attr('y2', d => y(d))
        .style('stroke', '#f32d7a')
        .style("stroke-opacity", 0.2)
        .style("stroke-width", 1)
        .style('pointer-events', 'none');

    if (markers.includes(-100)) {
        svg.append('g')
            .append("text")
            .attr("text-anchor", "end")
            .attr("alignment-baseline", "after-edge")
            .attr("dominant-baseline", "after-edge")
            .attr("x", width)
            .attr("y", y(-100))
            .attr("font-size", "5pt")
            .attr("fill", "#a78694")
            .text("EuroFPL/Formadillo Line")
    }

    // prediction line
    let pred_data = _.orderBy(Object.values(data.data), 'gw', 'asc')

    pred_data = [{'gw': 0, 'total_exp_diff': 0, 'total_real_diff': 0}, ...pred_data]




    // luck regions

    svg.append("clipPath")
      .attr("id", `below-exp`)
        .append("path")
        .datum(pred_data)
        .attr("d", d3.area()
            .x((d) => (d.gw == 38 ? x(d.gw) + x.bandwidth() : x(d.gw+1)))
            .y1(d => y(d.total_exp_diff))
            .y0(d => height)
            );

    svg.append("clipPath")
    .attr("id", `above-exp`)
        .append("path")
        .datum(pred_data)
        .attr("d", d3.area()
            .x((d) => (d.gw == 38 ? x(d.gw) + x.bandwidth() : x(d.gw+1)))
            .y1(d => y(d.total_exp_diff))
            .y0(d => 0)
            );

    svg.append('g')
        .append("path")
        .datum(pred_data)
        .attr("fill", "#ff8da1")
        .attr("fill-opacity", 0.1)
        .attr("clip-path", "url(#below-exp)")
        .attr("d", d3.area()
            .x((d) => (d.gw == 38 ? x(d.gw) + x.bandwidth() : x(d.gw+1)))
            .y1(d => y(d.total_real_diff))  
            .y0(d => 0)
            );

    svg.append('g')
        .append("path")
        .datum(pred_data)
        .attr("fill", "#008b6d")
        .attr("fill-opacity", 0.1)
        .attr("clip-path", "url(#above-exp)")
        .attr("d", d3.area()
            .x((d) => (d.gw == 38 ? x(d.gw) + x.bandwidth() : x(d.gw+1)))
            .y1(d => y(d.total_real_diff))  
            .y0(d => height)
            );

    // expected values line
    svg.append('g')
        .append("path")
        .datum(pred_data)
        .attr("fill", "none")
        .attr("stroke", "#dbf7b4")
        .attr("stroke-opacity", 0.8)
        .style("stroke-dasharray", "2,0.5")
        .attr("stroke-width", 1)
        .style('pointer-events', 'none')
        .attr("d", d3.line()
                .x((d) => (d.gw == 38 ? x(d.gw) + x.bandwidth() : x(d.gw+1)))
                .y((d) => y(d.total_exp_diff))
            );

    // realized values line
    svg.append('g')
        .append('path')
        .datum(pred_data)
        .attr("fill", "none")
        .attr("stroke", "#6fcfd6")
        .attr("stroke-opacity", 0.8)
        .attr("stroke-width", 1)
        .style('pointer-events', 'none')
        .attr("d", d3.line()
                .x((d) => (d.gw == 38 ? x(d.gw) + x.bandwidth() : x(d.gw+1)))
                .y((d) => y(d.total_real_diff))
            );

    // axis titles
    let titles = svg.append('g')
    titles.append('text')
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 17)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Gameweeks");
    
    titles.append('text')
        .attr("text-anchor", "end")
        .attr("x", -5)
        .attr("y", -5)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Diff.");

    titles.append('text')
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", -7)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Difference to Tier Average");

    // titles.append('text')
    //     .attr("text-anchor", "end")
    //     .attr("alignment-baseline", "middle")
    //     .attr("dominant-baseline", "middle")
    //     .attr("x", width-2)
    //     .attr("y", -7)
    //     .attr("font-size", "5pt")
    //     .attr("fill", "#ffc100")
    //     .text(`${app.team_info.name} (${app.team_info.id})`);

    let chips = _.toPairs(app.team_data).map(i => [i[0], i[1].active_chip]).filter(i => i[1]!=null)
    let chip_dict = {'wildcard': 'WC', '3xc': 'TC', 'freehit': 'FH', 'bboost': 'BB'}
    svg.append('g')
        .selectAll()
        .data(chips)
        .enter()
        .append('text')
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "hanging")
        .attr("dominant-baseline", "hanging")
        .attr("x", d => x(d[0]) + x.bandwidth()/2)
        .attr("y", 2)
        .attr("font-size", "4pt")
        .attr("fill", "white")
        .attr("fill-opacity", "0.4")
        .text(d => chip_dict[d[1]]);



}

function draw_team_season_visual() {

    if (!app.is_ready) { return }

    const raw_width = 600;
    const raw_height = 20 * (parseInt(app.next_gw) + 1);//400;

    const margin = { top: 20, right: 10, bottom: 20, left: 15 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;

    let data = _.cloneDeep(app.user_picks_with_order)

    let gws = _.sortedUniq(data.map(i => parseInt(i.gw)))

    jQuery("#team_season_visual").empty()

    const raw_svg = d3.select("#team_season_visual")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')

    let svg = raw_svg.append('g')
        .attr("class", "mainbg")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    let p2_left = 0
    if (app.show_info_ts) {
        p2_left = width/8
    }

    let use_team_colors = app.use_team_colors
    if (use_team_colors) {
        let fpl_dict = app.fpl_element
        data.forEach((p) => {
            let team = team_codes[fpl_dict[p.element].team_code].short
            p.bg_color = pl_team_colors[team][0]
            p.fg_color = pl_team_colors[team][1]
        })
    }

    let xvals = _.range(1, 16)
    let x = d3.scaleBand()
        .range([p2_left, width])
        .domain(xvals)
        .paddingInner(0.1)
        .paddingOuter(0);
    svg.append('g')
        // .attr('transform', 'translate(0,' + height + ')')
        .attr('class', 'x-axis')
        .call(
            d3.axisTop(x)
            .tickSize(0))
        .call(g => g.selectAll(".tick text")
            .attr("opacity", 0)
            .style("display", "none"))

    let x2;
    if (app.show_info_ts) {
        let x2vals = ['Chip', 'Pts', 'OR']
        x2 = d3.scaleBand()
            .range([0, p2_left])
            .domain(x2vals)
            .paddingInner(0.1)
            .paddingOuter(0);
        svg.append('g')
            // .attr('transform', 'translate(0,-8)')
            .attr('class', 'x-axis-2')
            .call(
                d3.axisTop(x2)
                .tickSize(0));
        svg.call(g => g.selectAll(".x-axis-2")
                .style("transform", 'translate(0px, -3px)'))
    }
    
        // .call(g => g.selectAll(".tick text")
        //     .attr("opacity", 0)
        //     .style("display", "none")
        // )


    let y_vals = gws
    let y = d3.scaleBand()
        .domain(_.reverse(y_vals))
        .range([height, 0])
        .paddingInner(0.1)
        .paddingOuter(0)
    svg.append('g').attr('class', 'y-axis')
        .call(
            d3.axisLeft(y)
            .tickSize(0))
    .call(g => g.selectAll(".tick line")
        .attr("stroke-opacity", 0.2)
        .attr("stroke", "#9a9a9a")
        .attr("pointer-events", "none")
    )
    .call(g => g.selectAll(".tick text")
        .attr("x", -5)
        .attr("font-size", "5pt")
        .attr("fill", "#9a9a9a")
        .attr("text-anchor", "end"));

    // svg settings
    svg.call(g => g.selectAll(".domain")
        .attr("opacity", 0))
    svg.call(s => s.selectAll(".tick").attr("font-size", "5pt").attr("fill", "white"))
    svg.call(s => s.selectAll(".tick text").attr("fill", "white"))


    let body = svg.append('g')

    // pos plot

    let pos_data = [
        {'name': 'GK', 'start': 1, 'finish': 2},
        {'name': 'DF', 'start': 3, 'finish': 7},
        {'name': 'MD', 'start': 8, 'finish': 12},
        {'name': 'FW', 'start': 13, 'finish': 15},
    ]

    let pos_grp = body.append('g')
        .selectAll()
        .data(pos_data)
        .enter()
    
    pos_grp
        .append('rect')
        .attr("width", d => x(d.finish) - x(d.start) + x.bandwidth())
        .attr("height", d => y.bandwidth())
        .attr("x", d => x(d.start))
        .attr("y", -y.bandwidth() - 4 )
        .attr("class", "team_pos_box");

    pos_grp
        .append('text')
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")
        .attr("x", d => (x(d.start) + x(d.finish)) / 2 + x.bandwidth()/2)
        .attr("y", d => -y.bandwidth()/2 - 4 + 1 )
        .attr("font-size", "4pt")
        .attr("class", "team_pos_name")
        .text(d => d.name)

        

    // data plot

    let actual_markers = data.filter(i => i.sort_finish)

    let markers= body
        .append('g')
        .selectAll()
        .data(actual_markers)
        .enter();

    markers
        .append('rect')
        .attr("width", x.bandwidth()) //x.bandwidth()/2 * 0.95)
        .attr("height", d => y(d.sort_finish) - y(d.sort_start) + y.bandwidth())
        .attr("x", (d) => x(d.sort_order))
        .attr("y", d => y(d.sort_start))
        .attr("class", "team_visual_box")
        .style("fill", (d) => use_team_colors ? d.bg_color : "")
        .style("stroke", (d) => use_team_colors ? d.fg_color : "")
        .style("stroke-width", (d) => use_team_colors ? "0.5px" : "")
        ;

    let gw_markers = body
        .append('g')
        .selectAll()
        .data(data)
        .enter();

    if (app.show_pts_on_ts) {
        let bColor = (v) => {
            if (!use_team_colors) {
                let p = d3.scaleLinear()
                .domain([-100, 3, 4, 20, 100])
                .range(["#ff9c99", "#ff9c99", "#2cf5ff", "#49c6ff", "#49c6ff"])
                return p(v)
            }
            else {
                let p = d3.scaleLinear()
                .domain([-100, 3, 4, 20, 100])
                .range(["#ffc5c5", "#ffc5c5", "#ddfbff", "#ddfbff", "#ddfbff"])
                return p(v)
            }
            
        }
            
        gw_markers.append('rect')
            .attr("width", x.bandwidth()/6)
            .attr("height", d => y.bandwidth())
            .attr("x", (d) => x(d.sort_order) + x.bandwidth()*5/6)
            .attr("y", d => y(d.gw))
            .attr("class", "gw_visual_box")
            .attr("fill", (d) => d.multiplier == 0 ? "none" : bColor(d.rp));
    }
        
    let text_group = body
        .append('g')
        .selectAll()
        .data(actual_markers)
        .enter();
        
    text_group
        .append('text')
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")
        .attr("x", d => x(d.sort_order) + (app.show_pts_on_ts ? x.bandwidth()*5/12 : x.bandwidth()/2))
        .attr("y", d => (y(d.sort_finish) + y(d.sort_start))/2 + y.bandwidth()/2 + 1)
        .attr("font-size", "4pt")
        // .attr("fill", "black")
        // .attr("fill", "#ffc100")
        .attr("class", "team_box_player_name")
        .style("fill", (d) => use_team_colors ? d.fg_color : "")
        .text(d => long_name_str(app.fpl_element[d.element].web_name))

    if (!use_team_colors) {
        text_group
            .append('rect')
            .attr("width", x.bandwidth()) //x.bandwidth()/2 * 0.95)
            .attr("height", d => y(d.sort_finish) - y(d.sort_start) + y.bandwidth())
            .attr("x", (d) => x(d.sort_order))
            .attr("y", d => y(d.sort_start))
            .attr("class", "team_visual_border");
    }

    if (app.show_pts_on_ts) {

        // captain square
        body
            .append('g')
            .selectAll()
            .data(data.filter(i => i.multiplier > 1))
            .enter()
            .append('rect')
            .attr("width", x.bandwidth()/6)
            .attr("height", d => y.bandwidth())
            .attr("x", (d) => x(d.sort_order) + x.bandwidth()*5/6)
            .attr("y", d => y(d.gw))
            .attr("class", "team_captain_border")
    
        body
            .append('g')
            .selectAll()
            .data(data)
            .enter()
            .append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", d => x(d.sort_order) + x.bandwidth()*11/12)
            .attr("y", d => y(d.gw) + y.bandwidth()/2 + 1)
            .attr("font-size", "4pt")
            // .attr("fill", "black")
            .attr("fill", d => d.multiplier == 0 ? "#bbbbbb" : "#000000")
            .attr("class", "team_box_pts")
            .text(d => d.rp || 0)

        
    }

    if (app.show_info_ts) {
        let td = app.team_data
        let chips = Object.entries(td).map(i => [i[0], i[1].active_chip]).filter(j => j[1])
        
        let chip_dict = {'wildcard': 'WC', '3xc': 'TC', 'freehit': 'FH', 'bboost': 'BB'}

        body.append('g')
            .selectAll()
            .data(chips)
            .enter()
            .append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", d => x2('Chip') + x2.bandwidth() / 2)
            .attr("y", d => y(d[0]) + y.bandwidth()/2 + 1)
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => chip_dict[d[1]])

        let gw_pts_text = (e) => {
            if (e.entry_history && e.entry_history.event_transfers_cost && e.entry_history.event_transfers_cost > 0) {
                return e.entry_history.points + ' (-' + e.entry_history.event_transfers_cost + ')'
            }
            else if (e.entry_history) {
                return e.entry_history.points
            }
            else {
                return '-'
            }
        }

        let pts_vals = Object.entries(td).map(i => [i[0], gw_pts_text(i[1])])

        body.append('g')
            .selectAll()
            .data(pts_vals)
            .enter()
            .append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", d => x2('Pts') + x2.bandwidth() / 2)
            .attr("y", d => y(d[0]) + y.bandwidth()/2 + 1)
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => d[1])

        let rank_vals = Object.entries(td).map(i => [i[0], _.get(i[1], 'entry_history.overall_rank')])

        // formatted_rank

        body.append('g')
            .selectAll()
            .data(rank_vals)
            .enter()
            .append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", d => x2('OR') + x2.bandwidth() / 2)
            .attr("y", d => y(d[0]) + y.bandwidth()/2 + 1)
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => formatnumber(d[1]))

    }
    
    
}

function draw_point_origin_graph() {

    if (!app.is_ready) { return }

    const raw_width = 620;
    const raw_height = 620;

    const margin = { top: 10, right: 10, bottom: 10, left: 10 },
        width = raw_width - margin.left - margin.right,
        height = raw_height - margin.top - margin.bottom;
    
    let data = _.cloneDeep(app.user_picks_origin)

    let gws = Object.keys(data.data)

    jQuery("#point_origin_visual").empty()

    const raw_svg = d3.select("#point_origin_visual")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center').style('display', 'block')
        .style('margin-bottom', '10px')

    let svg = raw_svg.append('g')
        .attr("class", "mainbg")
        .attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    // let x = d3.scaleLinear().domain([0, data.stats.total]).range([0, width])
    // svg.append('g').attr('transform', 'translate(0,' + height + ')').call(d3.axisBottom(x).tickSize(0));
    

    // section 1
    // total points earned
    let s1_top = 0
    let s1_end = 0
    let s1 = svg.append('g').attr("transform", "translate(0, 0)")
    if (true) {

        let local_data = data.stats.pts_main

        // title
        s1.append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "hanging")
            .attr("dominant-baseline", "hanging")
            .attr("x", width/2)
            .attr("y", 0)
            .attr("font-size", "8pt")
            .attr("fill", "white")
            .text("Total Points Earned by Acquisition Type")

        let categories = {
            'Initial': 'initial',
            'Wildcard': 'wildcard',
            'Transfers': 'transfer',
            'Free Hit': 'freehit'
        }
        let cat_keys = Object.keys(categories)

        let all_values = []

        let box_value = 10
        let row_count = 4
        let col_start = 0

        cat_keys.forEach((c) => {
            let t_value = local_data[categories[c]]
            let col_count = Math.ceil(t_value/box_value/row_count)
            entry = {
                'cat': c,
                'total_score': t_value,
                'cat_tag': categories[c],
                'cols': col_count,
                'col_start': col_start,
                'col_end': col_start + col_count
            }
            col_start += col_count;
            let col_boxes = []
            let score = t_value
            _.range(entry.cols).forEach((col) => {
                col_values = []
                while (col_values.length < row_count && score > 0) {
                    let e_score = score > box_value ? box_value : score
                    col_values.push(e_score)
                    score -= e_score;
                }
                col_boxes.push(col_values)
            })
            entry.col_boxes = col_boxes
            all_values.push(entry)
        })

        let xdomain = _.range(0,_.maxBy(all_values, 'col_end').col_end+1)
        if (app.next_gw != '39') {
            xdomain = _.range(0,60)
        }

        let x = d3.scaleBand().domain(xdomain).range([0, width]).paddingInner(0.15)
        let y = d3.scaleBand().domain(_.range(row_count)).range([0, x.step()*row_count]).paddingInner(0.15)

        let y_end = s1_end = x.step()*row_count

        let group_holder = s1.append('g').attr("transform", "translate(0, 20)")
            .selectAll()
            .data(all_values)
            .enter()
            .append('g')
            .attr("transform", (d) => `translate(${x(d.col_start)}, 0)`)
        
        let box_holders = group_holder.selectAll()
            .data((d,g) => d.col_boxes.map((val, inner_col) => {return {'val': val, 'inner_col': inner_col, 'group': g}}))
            .enter()

        type_cols = ['#d65544', '#48baff', '#93dea6', '#ffdc31']

        let single_node = box_holders.selectAll()
            .data(d => d.val.map((k,r) => {return {'val': k, 'row': r, 'col': d.inner_col, 'group': d.group}}) )
            .enter()
        
        // gray box
        single_node.append("rect")
            .attr("x", d => x(d.col))
            .attr("y", d => y(d.row))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("fill", "#686868")
            .attr("stroke", "none")

        // color box
        single_node.append("rect")
            .attr("x", d => x(d.col))
            .attr("y", d => y(d.row))
            .attr("width", d => x.bandwidth() * d.val/box_value)
            .attr("height", y.bandwidth())
            .attr("fill", d => type_cols[d.group])
            .attr("stroke", "none")
            .attr("data-val", (d) => d.val)
            .attr("data-col", (d) => d.col)
            .attr("data-row", (d) => d.row)

        // legend box
        let single_width = 100

        let legend_box = s1.append('g')
            .attr("transform", `translate(${(width - cat_keys.length * single_width)/2}, ${y_end + 30})`)

        let legend_entry = legend_box.selectAll()
            .data(all_values)
            .enter()

        let single_entry = legend_entry.append('g')
            .attr("transform", (d,i) => `translate(${i * single_width}, 0)`)

        single_entry
            .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", 10)
            .attr("height", 10)
            .attr("fill", (d,i) => type_cols[i])
            .attr("stroke", "none")

        single_entry
            .append("text")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", 15)
            .attr("y", 6)
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => d.cat)

        single_entry
            .append("text")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", 15)
            .attr("y", 16)
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => d.total_score + " pts")

        single_entry
            .append("text")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", 15)
            .attr("y", 26)
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => _.round(d.total_score / data.stats.total * 100,0) + "%")


        // svg.append('rect').attr('x', 0).attr('y', y_end + 70).attr('width', 100).attr('height', 100)
        
        
    }

    let s2_top = Math.ceil(s1_end + 75)
    let s2 = svg.append('g').attr("transform", `translate(0, ${s2_top})`)
    if (true) {
        // work rect:
        // s2.append("rect")
        // .attr("x", 0)
        // .attr("y", 0)
        // .attr("width", width)
        // .attr("height", 390)
        // .attr("fill", "red")
        // .attr("fill-opacity", 0)
        // .attr("stroke", "white")
        // .attr("stroke-opacity", 0.1)

        let age_groups = data.age_groups
        let group_names = data.group_names
        let total = data.nested_sum
        let count = data.nested_count

        // title
        s2.append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "hanging")
            .attr("dominant-baseline", "hanging")
            .attr("x", width/2)
            .attr("y", 0)
            .attr("font-size", "8pt")
            .attr("fill", "white")
            .text("Total Points, Counts, Points per Pick by Decision Age and Acquisition Type")

        let graph_inner = s2.append('g').attr("transform", "translate(0, 35)")

        let x = d3.scaleBand()
            .range([0, width])
            .domain(['Age'].concat(group_names.map(i => i[0])).concat(['Total', 'Perc.']))
            .padding(0.05);
        graph_inner.append('g').attr('transform', 'translate(0,0)').call(d3.axisTop(x).tickSize(0));
        let y = d3.scaleBand()
            .range([0, 340])
            .domain(age_groups.concat(['Total']))
            .padding(0.1);
        // graph_inner.append('g').call(d3.axisLeft(y).tickSize(0));
            //.select(".domain").remove();

        graph_inner.call(g => g.selectAll(".domain").attr("opacity", 0))

        

        let values_as_list = age_groups.map(
            (age) => group_names.map((gr) => {
                    return {
                        'age': age,
                        'group': gr,
                        'group_text': gr[0],
                        'val': _.get(total, gr[1] + '.' + age) || 0,
                        'total': _.get(total, gr[1] + '.' + age) || "",
                        'count': _.get(count, gr[1] + '.' + age) || "",
                        'ppp': _.round((_.get(total, gr[1] + '.' + age) || 0) / (_.get(count, gr[1] + '.' + age) || 1),1)
                    }
                })).flat()
        console.log(values_as_list)

        let color_range = d3.scaleLinear().range(["#ffffff", "#00fff8"]).domain([0, d3.max(values_as_list.map(i => i.total))])

        // y labels
        y_labels = graph_inner.append('g')
            .selectAll()
            .data(age_groups.concat("Total"))
            .enter()
        y_labels.append('text')
            .attr("x", x("Age") + x.bandwidth()/2)
            .attr("y", d => y(d) + y.bandwidth()/2 + 1)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => d)
        
        // data cells

        let cell = graph_inner.append('g')
                .selectAll()
                .data(values_as_list)
                .enter()
        
        cell.append('rect')
            .attr("x", d => x(d.group[0]))
            .attr("y", d => y(d.age))
            .attr("width", x.bandwidth())
            .attr("height", y.bandwidth())
            .attr("rx", "2px")
            .attr("ry", "2px")
            // .attr("fill", d => color_range(d.total))
            .attr("fill", "#686868")
            .attr("fill-opacity", 0.5)

        cell.append('text')
            .attr("x", d => x(d.group[0]) + x.bandwidth()/2)
            .attr("y", d => y(d.age) + y.bandwidth()*3.5/10)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7pt")
            .attr("fill", d => color_range(d.total)) // "#abf8f9")
            .text(d => d.total != "" ? d.total + " pts" : "")

        cell.append('text')
            .attr("x", d => x(d.group[0]) + x.bandwidth()/2)
            .attr("y", d => y(d.age) + y.bandwidth()*8.5/10)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => d.count != "" ? d.count + " picks / " + d.ppp + " ppp" : "")

        let total_cells = graph_inner.append('g')
            .selectAll()
            .data(Object.entries(data.age_sums))
            .enter()

        total_cells.append('text')
            .attr("x", x("Total") + x.bandwidth()/2)
            .attr("y", d => y(d[0]) + y.bandwidth()*3.5/10)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => d[1] + " pts")

        total_cells.append('text')
            .attr("x", x("Total") + x.bandwidth()/2)
            .attr("y", d => y(d[0]) + y.bandwidth()*8.5/10)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => (data.age_cnt[d[0]] || 0) + " picks / " + _.round(d[1]/(data.age_cnt[d[0]] || 1), 1) + " ppp" )

        let overall_sum = data.stats.total

        total_cells.append('text')
            .attr("x", x("Perc.") + x.bandwidth()/2)
            .attr("y", d => y(d[0]) + y.bandwidth()/2 + 1)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => _.round(100*d[1]/overall_sum,0) + "%")

        // total for y
        let gr_dict = Object.fromEntries(data.group_names)
        let gr_sums = _(values_as_list).groupBy('group_text').map((val, key) => [key, _.sum(val.map(i => parseInt(i.val))), data.grp_cnt[gr_dict[key]] || 0]).value()
        
        let total_groups = graph_inner.append('g')
            .selectAll()
            .data(gr_sums)
            .enter()

        total_groups.append('text')
            .attr("x", d => x(d[0]) + x.bandwidth()/2)
            .attr("y", d => y("Total") + y.bandwidth()*3.5/10 + 1)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(d => d[1] + " pts")

        total_groups.append('text')
            .attr("x", d => x(d[0]) + x.bandwidth()/2)
            .attr("y", d => y("Total") + y.bandwidth()*8.5/10 + 1)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => d[2] + " picks / " + _.round(d[1]/(d[2] || 1), 1) + " ppp")

        graph_inner.append('text')
            .attr("x", d => x("Total") + x.bandwidth()/2)
            .attr("y", d => y("Total") + y.bandwidth()/2 + 1)
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("font-size", "7pt")
            .attr("fill", "white")
            .text(overall_sum + " pts")


    }

    let s3_top = Math.ceil(s2_top + 390)
    let s3 = svg.append('g').attr("transform", `translate(0, ${s3_top})`)
    if(true) {
        
        s3.append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "hanging")
            .attr("dominant-baseline", "hanging")
            .attr("x", width/2)
            .attr("y", 0)
            .attr("font-size", "8pt")
            .attr("fill", "white")
            .text("Team Composition")

        let gws = _.range(1,39)

        let x = d3.scaleBand()
            .range([30, width])
            .domain(gws)
            .padding(0.1);
        let y = d3.scaleBand()
            .range([0, 150])
            .domain(_.range(15))
            .paddingInner(0.1);

        let gw_chips = _(data.data).mapValues((val, key) => val.active_chip).value()
        let all_players = data.all_players
        let nodes = [];
        let links = [];
        gws.forEach((gw) => {
            let gw_picks = all_players.filter(i => i.gw == gw)
            let gw_acq = _.uniq(gw_picks.map(i => i.origin_text))
            let picked_groups = data.group_names.filter(i => gw_acq.includes(i[1]))
            let cnt = 0;
            let lineup_cnt = 0;
            picked_groups.forEach((group) => {
                let picks = gw_picks.filter(i => i.origin_text == group[1])
                let val = picks.length
                let lineup_val = picks.filter(i => i.multiplier > 0).length
                nodes.push({
                    'type': 'regular',
                    'x0': x(gw),
                    'x1': x(gw)+x.bandwidth(),
                    'y0': y(cnt),
                    'y1': y(cnt+val-1) + y.bandwidth(),
                    'group': group,
                    'val': val,
                    'pts': _.sum(picks.map(i => i.eff_points)),
                    'lineup': lineup_val,
                    'bench': picks.filter(i => i.multiplier == 0).length,
                    'ly0': y(lineup_cnt),
                    'ly1': y(lineup_cnt+lineup_val-1) + y.bandwidth()
                })
                cnt += val;
                lineup_cnt += lineup_val;
            })
            if (lineup_cnt < 15) {
                nodes.push({
                    'type': 'bench',
                    'x0': x(gw),
                    'x1': x(gw)+x.bandwidth(),
                    'group': ['', 'bench', ''],
                    'bench': picks.filter(i => i.multiplier == 0).length,
                    'lineup': 15-lineup_cnt,
                    'ly0': y(lineup_cnt),
                    'ly1': y(14) + y.bandwidth()
                })
            }
        })


        let s3_p1 = s3.append('g').attr("transform", "translate(0,20)")

        type_cols = {
            'bench': 'gray',
            'initial': '#d65544',
            'wildcard': '#48baff',
            'wc1': '#48baff',
            'wc2': '#48baff',
            // 'wcb': '#48baff',
            'transfer': '#93dea6',
            'freehit': '#ffdc31',
            'fh1': '#ffdc31',
            'fh2': '#ffdc31'
        }
        gr_text_color = {'bench': 'white', 'initial': 'white', 'wildcard': 'black', 'wc1': 'black', 'wc2': 'black', 'transfer': 'black', 'fh1': 'black', 'fh2': 'black', 'freehit': 'black'}

        {
            
            // points
            s3_p1.append("text")
                .attr("text-anchor", "start")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", 0)
                .attr("y", 0)
                .attr("font-size", "6pt")
                .attr("fill", "#7fd3d9")
                .text("Points")

            s3_p1.selectAll().data(gws).enter().append('text')
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", d => x(d) + x.bandwidth()/2)
                .attr("y", 0)
                .attr("font-size", "4pt")
                .attr("fill", "white")
                .text(d => d)
            
            let main_colors = {'IN': '#d65544', 'WC': '#48baff', 'TR': '#93dea6', 'FH': '#ffdc31'}
            let ymain = d3.scaleBand()
                .range([0, 48])
                .domain(data.main_groups.map(i => i[1]))
                .paddingInner(0.1);

            let point_holder = s3_p1.append('g')
                .attr("transform", "translate(0, 10)")

            let leg_box = point_holder.selectAll()
                .data(data.main_groups)
                .enter()
                .append('g')
            
            leg_box.append("rect")
                .attr("x", 15)
                .attr("y", (d,i) => ymain(d[1]))
                .attr("width", 10)
                .attr("height", ymain.bandwidth())
                .attr("fill", d => main_colors[d[2]])
                .attr("stroke", "none")

            leg_box.append("text")
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", 20)
                .attr("y", (d,i) => ymain(d[1]) + ymain.bandwidth()/2)
                .attr("font-size", "5pt")
                .attr("fill", d => gr_text_color[d[1]])
                .text(d => d[2])
            
            let type_vals = _(data.all_players).groupBy('origin').map((val, key) => _(val).groupBy('gw').map((ival, ikey) => { return {cnt: ival.filter(i => i.multiplier > 0).length, val: _.sum(ival.map(i => i.eff_points)), gw: ikey, group: key}}).value()).value().flat()

            let type_box = point_holder.append('g')
                .selectAll()
                .data(type_vals)
                .enter()

            type_box.append("text")
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", d => x(d.gw) + x.bandwidth()/2)
                .attr("y", d => ymain(d.group) + ymain.bandwidth()/2)
                .attr("font-size", "5pt")
                .attr("fill", d => type_cols[d.group])
                .text(d => d.val)

        }

        // data part

        let s3_p2 = s3.append('g').attr("transform", "translate(0,90)")

        {
            
            // points
            s3_p2.append("text")
                .attr("text-anchor", "start")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", 0)
                .attr("y", 85)
                .attr("font-size", "6pt")
                .attr("fill", "#7fd3d9")
                .text("Squad")

            s3_p2.selectAll().data(gws).enter().append('text')
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", d => x(d) + x.bandwidth()/2)
                .attr("y", 0)
                .attr("font-size", "4pt")
                .attr("fill", "white")
                .text(d => d)

            let boxes = s3_p2.append('g')
                .attr("transform", "translate(0,10)")
                .selectAll()
                .data(nodes.filter(i => i.type == 'regular'))
                .enter()
            
            boxes.append("rect")
                .attr("x", d => d.x0)
                .attr("y", d => d.y0)
                .attr("width", d => d.x1-d.x0)
                .attr("height", d => d.y1-d.y0)
                .attr("fill", d => type_cols[d.group[1]])
                // .attr("fill-opacity", 0.1)
                .attr("stroke", "none")

            // boxes.append("text")
            //     .attr("text-anchor", "middle")
            //     .attr("alignment-baseline", "middle")
            //     .attr("dominant-baseline", "middle")
            //     .attr("x", d => (d.x0 + d.x1)/2)
            //     .attr("y", d => (d.y0+d.y1)/2 - 6)
            //     .attr("font-size", "5pt")
            //     .attr("fill", d => gr_text_color[d.group[1]])
            //     .text(d => d.pts + " P")

            boxes.append("text")
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", d => (d.x0 + d.x1)/2)
                .attr("y", d => (d.y0 + d.y1)/2)
                .attr("font-size", "5pt")
                .attr("fill", d => gr_text_color[d.group[1]])
                .text(d => d.val)

            // boxes.append("text")
            //     .attr("text-anchor", "middle")
            //     .attr("alignment-baseline", "middle")
            //     .attr("dominant-baseline", "middle")
            //     .attr("x", d => (d.x0 + d.x1)/2)
            //     .attr("y", d => (d.y0+d.y1)/2 + 0)
            //     .attr("font-size", "5pt")
            //     .attr("fill", d => gr_text_color[d.group[1]])
            //     .text(d => 'L: ' + d.lineup)

            // boxes.append("text")
            //     .attr("text-anchor", "middle")
            //     .attr("alignment-baseline", "middle")
            //     .attr("dominant-baseline", "middle")
            //     .attr("x", d => (d.x0 + d.x1)/2)
            //     .attr("y", d => (d.y0+d.y1)/2 + 6)
            //     .attr("font-size", "5pt")
            //     .attr("fill", d => gr_text_color[d.group[1]])
            //     .text(d => 'B: ' + d.bench)
        }

        let s3_p3 = s3.append('g').attr("transform", "translate(0,260)")

        {
            // 
            s3_p3.append("text")
                .attr("text-anchor", "start")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", 0)
                .attr("y", 85)
                .attr("font-size", "6pt")
                .attr("fill", "#7fd3d9")
                .text("Lineup")

            s3_p3.selectAll().data(gws).enter().append('text')
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", d => x(d) + x.bandwidth()/2)
                .attr("y", 0)
                .attr("font-size", "4pt")
                .attr("fill", "white")
                .text(d => d)

            let lineup_boxes = s3_p3.append('g')
                .attr("transform", "translate(0,10)")
                .selectAll()
                .data(nodes.filter(i => i.lineup != 0))
                .enter()
            
            lineup_boxes.append("rect")
                .attr("x", d => d.x0)
                .attr("y", d => d.ly0)
                .attr("width", d => d.x1-d.x0)
                .attr("height", d => d.ly1-d.ly0)
                .attr("fill", d => type_cols[d.group[1]])
                .attr("stroke", "none")

            lineup_boxes.append("text")
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "middle")
                .attr("dominant-baseline", "middle")
                .attr("x", d => (d.x0 + d.x1)/2)
                .attr("y", d => (d.ly0 + d.ly1)/2)
                .attr("font-size", "5pt")
                .attr("fill", d => gr_text_color[d.group[1]])
                .text(d => d.lineup)
        }

    }


    // final height update

    let n_height = Math.ceil(s3_top + 420)
    raw_svg.attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(n_height + margin.top + margin.bottom)}`)

}

var unitlist = ["","K","M","G"];
function formatnumber(number){
    let sign = Math.sign(number);
    let unit = 0;
    
    while(Math.abs(number) >= 1000)
    {
      unit = unit + 1; 
      number = Math.floor(Math.abs(number) / 100)/10;
    }
    return sign*Math.abs(number) + unitlist[unit];
 }


async function get_points() {
    return read_cached_rp(app.season).then((data) => {
        app.points_data = Object.freeze(data);
    }).catch((e) => {
        debugger
        console.log(e)
        return getSeasonRPData(parseInt(gw)).then((data) => {
            app.points_data = Object.freeze(data);
        })
    })
    
    // return $.ajax({
    //     type: "GET",
    //     url: `data/${season}/points.json`,
    //     async: true,
    //     dataType: "json",
    //     success: (data) => {
    //         app.points_data = data;
    //     },
    //     error: (xhr, status, error) => {
    //         console.log(error);
    //         console.error(xhr, status, error);
    //     }
    // });
}

async function get_eo() {
    return $.ajax({
        type: "GET",
        url: `data/${season}/eo.json`,
        async: true,
        dataType: "json",
        success: (data) => {
            app.eo_data = Object.freeze(data);
            let target_key = Math.max(...Object.keys(data).map(i => parseInt(i)));
            app.sample_options = Object.keys(data[target_key])
            // default 10K
            // app.sample_selection = 0 //Object.keys(data[1]).length - 1
            if (app.sample_options.length > 1) {
                app.sample_selection = app.sample_options.length-1;
            }
            else {
                app.sample_selection = 0;
            }
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

async function get_fixture_data() {
    return $.ajax({
        type: "GET",
        url: `data/${season}/fixture.json`,
        async: true,
        dataType: "json",
        success: (data) => {
            app.fixture_data = Object.freeze(data);
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

async function get_538_data() {
    return $.ajax({
        type: "GET",
        url: `data/${season}/fivethirtyeight_spi.csv`,
        async: true,
        success: (data) => {
            let tablevals = data.split('\n').map(i => i.split(','));
            let keys = tablevals[0];
            let values = tablevals.slice(1);
            let final_data = values.map(i => _.zipObject(keys, i));
            app.fdr_data = Object.freeze(final_data.filter(i => i.league == "Barclays Premier League"));
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

async function fetch_main_data() {
    return read_cached_static(app.season).then((data) => {
        app.el_data = Object.freeze(data['elements']);
    }).catch((e) => {
        console.log(e)
        return get_fpl_main_data().then((data) => {
            app.el_data = Object.freeze(data['elements']);
        })
    })
}

async function fetch_xp_data() {
    return read_cached_xp(app.season).then((data) => {
        let xp_data = jQuery.csv.toObjects(data);
        xp_data = xp_data.filter(i => parseFloat(i.price) < 20) // && parseFloat(i.xp) + parseFloat(i.rp) != 0)
        app.xp_data = Object.freeze(xp_data)
    })
}

let name_dict = {
    'Alexander-Arnold': 'TAA',
    'Ward-Prowse': 'JWP',
    'Calvert-Lewin': 'DCL'
}

let long_name_str = n => {
    return name_dict[n] || (n.length > 10 ? n.slice(0,8) + '...' : n)
}

$(document).ready(() => {
    Promise.all([
            get_points(),
            get_eo(),
            get_fixture_data(),
            // get_538_data(),
            fetch_main_data(),
            fetch_xp_data()
        ]).then((values) => {
            Vue.$cookies.config('120d')

            app.$nextTick(() => {
                let cached_team = Vue.$cookies.get('team_id')
                if (cached_team !== null) {
                    app.team_id = parseInt(cached_team);
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