var app = new Vue({
    el: '#app',
    data: {
        current_dt: new Date(),
        this_gw: 1,
        fill_width: false,
        original_fixture_data: undefined,
        fixture_data: undefined,
        main_data: undefined,
        season_projections: undefined,
        choice_data_source: [
            { 'name': "Official FPL", 'attribute': 'fdr' },
            { 'name': "Opponent Strength", 'attribute': 'proj_overall' },
            { 'name': "Opponent Defense Strength", 'attribute': 'proj_off' },
            { 'name': "Opponent Offense Strength", 'attribute': 'proj_def' }
        ],
        option_data_source: 1,
        choice_data_type: [
            { name: "FDR", suffix: "" },
            { name: "Difference", suffix: "_diff" },
        ],
        option_data_type: 0,
        choice_table_display: ["Teams", "Raw Value"],
        option_table_display: 0,
        choice_mgw_value: [
            ["Top", (arr) => { return (arr.length > 1 ? -100 - 1 / getSum(arr) : arr[0]) }],
            ["Minimum", getMin],
            ["Maximum", getMax],
            ["Average", getAvg],
            ["Sum", getSum],
        ],
        option_mgw_value: 0,
        option_show_double: true,
        hfa: 0.15,
        timeline: undefined,
        groups: undefined,
        time_left: "",
        range_from: 1,
        range_to: 38,
        include_postponed: false,
        color_scheme: ["#6a0606", "#ffffff", "#105c0a"],
        color_choice: 0,
        gws_exclude: '',
        show_time_chart: false,
        show_earlier_gws: false
    },
    computed: {
        is_all_ready() { return this.is_fixture_ready && this.is_main_ready },
        is_fixture_ready() { return !(this.fixture_data == undefined || _.isEmpty(this.fixture_data)) },
        is_main_ready() { return !(this.main_data == undefined || _.isEmpty(this.main_data)) },
        events() {
            return this.main_data.events
        },
        teams() {
            return teams_ordered
        },
        gameweeks() {
            if (!this.is_all_ready) { return [] }
            let this_gw;
            let now_time = (new Date()).getTime()/1000;
            for (let gw of app.main_data.events) {
                if (gw.deadline_time_epoch > now_time) {
                    this_gw = gw.id;
                    break;
                }
            }
            // try {
            //     this_gw = app.main_data.events.find(i => i.is_next).id;
            // } catch {
            //     this_gw = 38;
            // }
            let weeks = _.range(1,39) //_.uniq(this.fixture_data.map(i => i.event), true)
            if (weeks[0] == null) {
                weeks = [...weeks.slice(1), weeks[0]]
            }
            weeks = weeks.map(i => i == null ? { "no": i, "text": "No date", "this_gw": false } : { "no": i, "text": "GW" + i, "this_gw": false })
            weeks.find(i => i.no == this_gw)['this_gw'] = true;
            weeks.sort((a, b) => {
                if (a.no === null) { return 1; }
                if (b.no === null) { return -1; }
                return a.no - b.no;
            })
            return weeks
        },
        future_gameweeks() {
            if (!this.is_all_ready) { return [] }
            let this_gw = this.this_gw;
            let weeks = _.range(1,39) //_.uniq(this.fixture_data.map(i => i.event), true)
            weeks = _.cloneDeep(weeks)
            if (weeks[0] == null) {
                weeks = [...weeks.slice(1), weeks[0]]
            }
            weeks = weeks.map(i => i == null ? { "no": i, "text": "No date", "this_gw": false } : { "no": i, "text": "GW" + i, "this_gw": false })
            weeks.find(i => i.no == this_gw)['this_gw'] = true;

            weeks = weeks.filter(i => (i.no >= this_gw) || (i.no === null));
            weeks.sort((a, b) => {
                if (a.no === null) { return 1; }
                if (b.no === null) { return -1; }
                return a.no - b.no;
            })
            return weeks
        },
        fdr_season() {
            if (_.isEmpty(this.season_projections)) { return {} }
            let fdr = {};
            let xp_data = _.cloneDeep(this.season_projections)
            let tname_fix = {'Nottingham Forest': "Nott'm Forest", 'Tottenham': 'Spurs'}
            // fix for team names
            for (let e of xp_data) {
                if (tname_fix[e['Team']] != undefined) {
                    e['Team'] = tname_fix[e['Team']]
                }
            }

            // let gw_cols = _.range(1,39).map(i => 'GW' + i)
            let gw_cols = _.range(1,39).map(i => i + '_Pts')
            let sum_xp = (plist) => {
                return _.sum(gw_cols.map(
                    gw => _.sum(plist.map(
                        p => parseFloat(p?.[gw] ?? 0)
                    ))
                ))
            }
            let sum_xmin = (plist) => {
                return _.sum(_.range(1,39).map(
                    gw => _.sum(plist.map(
                        p => parseFloat(p?.[gw + '_xMin'] ?? 0)
                    ))
                ))
            }

            let overall_avg = sum_xp(xp_data) / sum_xmin(xp_data) * 90
            let all_off = xp_data.filter(i => ['M', 'F'].includes(i.Pos))
            let off_avg = sum_xp(all_off) / sum_xmin(all_off) * 90
            let all_def = xp_data.filter(i => ['G', 'D'].includes(i.Pos))
            let def_avg = sum_xp(all_def) / sum_xmin(all_def) * 90


            let teams = app.main_data.teams
            teams.forEach((team) => {
                // find all players from team, sum EV, sum min
                let team_players = xp_data.filter(i => i.Team == team.name)
                let off_players = team_players.filter(i => ['M', 'F'].includes(i.Pos))
                let def_players = team_players.filter(i => ['G', 'D'].includes(i.Pos))
                let f = fdr[team.id - 1] = {};
                
                f['off'] = parseFloat(sum_xp(off_players) / sum_xmin(off_players)) * 90;
                f['def'] = parseFloat(sum_xp(def_players) / sum_xmin(def_players)) * 90;
                f['fdr'] = parseFloat(sum_xp(team_players) / sum_xmin(team_players)) * 90;

                f['fdr_rel'] = f['fdr'] / overall_avg
                f['off_rel'] = f['off'] / off_avg
                f['def_rel'] = f['def'] / def_avg
                // console.log(team.name)
            })

            return fdr;
        },
        // fdr_fte() {
        //     if (_.isEmpty(this.fte_data)) { return {}}
        //     let fdr = {};
        //     let teams = _.uniq(app.fixture_data.map(i => i.team_h));
        //     teams.forEach((team) => {
        //         let f = fdr[team - 1] = {};
        //         let team_name = teams_ordered[team - 1].name;
        //         let entry = app.fte_data.find(i => i.name == team_name)
        //         if (entry == undefined) {
        //             let team_entry = teams_ordered[team - 1]
        //             if (team_entry.long == undefined) {
        //                 console.log("Cannot find", team_entry.name)
        //             }
        //             team_long = team_entry.long
        //             entry = app.fte_data.find(i => i.name == team_long)
        //         }

        //         f['off'] = parseFloat(entry.off);
        //         f['def'] = parseFloat(entry.def);
        //         f['fdr'] = parseFloat(entry.off) - parseFloat(entry.def);
        //     })
        //     return fdr;
        // },
        rivals() {
            let fdr = this.fdr_season; // TODO
            if (_.isEmpty(fdr)) { return {} }
            let fd = this.fixture_data;
            let rivals = {};
            let teams = _.uniq(app.fixture_data.map(i => i.team_h));
            let gameweeks = _.range(1,39) //_.uniq(app.fixture_data.map(i => i.event));
            gameweeks = gameweeks.concat(null)
            teams.forEach((team) => {
                let r = rivals[team] = {}
                gameweeks.forEach((gw) => {
                    r[gw] = [];
                    home_games = fd.filter((i) => { return i.team_h == team && i.event == gw });
                    let data = home_games.map(i => {
                        return {
                            'rival': teams_ordered[i.team_a - 1].short.toUpperCase(),
                            'fdr': i.team_h_difficulty,
                            'fdr_diff': i.team_h_difficulty - i.team_a_difficulty,
                            'proj_overall': fdr[i.team_a - 1].fdr_rel / Math.sqrt(Math.exp(this.hfa)),
                            'proj_overall_diff': fdr[i.team_a - 1].fdr_rel / fdr[i.team_h - 1].fdr_rel / Math.exp(this.hfa),
                            'proj_off': fdr[i.team_a - 1].def_rel / Math.sqrt(Math.exp(this.hfa)),
                            'proj_off_diff': fdr[i.team_a - 1].def_rel / fdr[i.team_h - 1].off_rel / Math.exp(this.hfa),
                            'proj_def': fdr[i.team_a - 1].off_rel / Math.sqrt(Math.exp(this.hfa)),
                            'proj_def_diff': fdr[i.team_a - 1].off_rel / fdr[i.team_h - 1].def_rel / Math.exp(this.hfa),
                            // 'fdr_fte': fdr[i.team_a - 1].fdr,
                            // 'fdr_fte_diff': fdr[i.team_a - 1].fdr - fdr[i.team_h - 1].fdr * Math.exp(this.hfa),
                            // 'fdr_off': fdr?.[i.team_a - 1]?.off ?? 0,
                            // 'fdr_off_diff': ((fdr?.[i.team_a - 1]?.off ?? 0) + (fdr?.[i.team_h - 1]?.def ?? 0)) / Math.exp(this.hfa),
                            // 'fdr_def': -(fdr?.[i.team_a - 1]?.def ?? 0),
                            // 'fdr_def_diff': -((fdr?.[i.team_a - 1]?.def ?? 0) + (fdr?.[i.team_h - 1]?.off ?? 0) * Math.exp(this.hfa)),
                        }
                    })
                    r[gw] = r[gw].concat(data);
                    away_games = fd.filter((i) => { return i.team_a == team && i.event == gw });
                    data = away_games.map(i => {
                        return {
                            'rival': teams_ordered[i.team_h - 1].short.toLowerCase(),
                            'fdr': i.team_a_difficulty,
                            'fdr_diff': i.team_a_difficulty - i.team_h_difficulty,
                            'proj_overall': fdr[i.team_h - 1].fdr_rel * Math.sqrt(Math.exp(this.hfa)),
                            'proj_overall_diff': fdr[i.team_h - 1].fdr_rel / fdr[i.team_a - 1].fdr_rel * Math.exp(this.hfa),
                            'proj_off': fdr[i.team_h - 1].def_rel * Math.sqrt(Math.exp(this.hfa)),
                            'proj_off_diff': fdr[i.team_h - 1].def_rel / fdr[i.team_a - 1].off_rel * Math.exp(this.hfa),
                            'proj_def': fdr[i.team_h - 1].off_rel * Math.sqrt(Math.exp(this.hfa)),
                            'proj_def_diff': fdr[i.team_h - 1].off_rel / fdr[i.team_a - 1].def_rel * Math.exp(this.hfa),
                            // 'fdr_fte': fdr[i.team_h - 1].fdr * Math.exp(this.hfa),
                            // 'fdr_fte_diff': fdr[i.team_h - 1].fdr * Math.exp(this.hfa) - fdr[i.team_a - 1].fdr,
                            // 'fdr_off': (fdr?.[i.team_h - 1]?.off ?? 0) * Math.exp(this.hfa),
                            // 'fdr_off_diff': (fdr?.[i.team_h - 1]?.off ?? 0) * Math.exp(this.hfa) + (fdr?.[i.team_a - 1]?.def ?? 0),
                            // 'fdr_def': -((fdr?.[i.team_h - 1]?.def ?? 0) / Math.exp(this.hfa)),
                            // 'fdr_def_diff': -((fdr?.[i.team_h - 1]?.def ?? 0) / Math.exp(this.hfa) + (fdr?.[i.team_a - 1]?.off ?? 0)),
                        }
                    })
                    r[gw] = r[gw].concat(data);
                    // console.log(gw)
                })
            })
            return rivals;
        },
        team_average() {
            let start = this.range_from;
            let end = this.range_to;
            let with_postponed = this.include_postponed;
            if (!this.is_main_ready) { return {} }
            let team_avg = {};
            let rivals = this.rivals;
            let rival_list = Object.entries(rivals);
            let exc = []
            try {
                exc = this.gws_exclude.split(',').map(i => parseInt(i))
            }
            catch {
                exc = []
            }
            rival_list.forEach((team) => {
                let keys = Object.keys(team[1]).filter(i => ((i >= start && i <= end) && (exc.length == 0 || !exc.includes(parseInt(i))) || (i == "null" && with_postponed)));
                let vals = keys.reduce((arr, key) => {
                    return arr.concat(Object.values(team[1][key].map(i => i[this.fdr_attribute])))
                }, [])
                team_avg[team[0]] = getAvg(vals);
            })
            return team_avg;
        },
        team_actual_average() {
            let start = this.range_from;
            let end = this.range_to;
            let with_postponed = this.include_postponed;
            if (!this.is_main_ready) { return {} }
            let team_avg = {};
            let rivals = this.rivals;
            let rival_list = Object.entries(rivals);
            let exc = []
            try {
                exc = this.gws_exclude.split(',').map(i => parseInt(i))
            }
            catch {
                exc = []
            }
            rival_list.forEach((team) => {
                let keys = Object.keys(team[1]).filter(i => ((i >= start && i <= end) && (exc.length == 0 || !exc.includes(parseInt(i))) || (i == "null" && with_postponed)));
                let vals = keys.reduce((arr, key) => {
                    return arr.concat(Object.values(team[1][key].map(i => i[this.fdr_attribute])))
                }, [])
                team_avg[team[0]] = getAvg(vals) - 100 * vals.length;
            })
            return team_avg;
        },
        fixture_count() {
            let start = this.range_from;
            let end = this.range_to;
            let with_postponed = this.include_postponed;
            if (!this.is_main_ready) { return {} }
            let team_avg = {};
            let rivals = this.rivals;
            let rival_list = Object.entries(rivals);
            let exc = []
            try {
                exc = this.gws_exclude.split(',').map(i => parseInt(i))
            }
            catch {
                exc = []
            }
            rival_list.forEach((team) => {
                let keys = Object.keys(team[1]).filter(i => ((i >= start && i <= end) && (exc.length == 0 || !exc.includes(parseInt(i))) || (i == "null" && with_postponed)));
                let vals = keys.reduce((arr, key) => {
                    return arr.concat(Object.values(team[1][key].map(i => i[this.fdr_attribute])))
                }, [])
                team_avg[team[0]] = vals.length;
            })
            return team_avg;
        },
        color_bounds() {
            let all_vals = Object.values(this.rivals).map(i => Object.values(i).flat()).flat().map(i => i[app.fdr_attribute]);
            return { 'minval': Math.min(...all_vals), 'maxval': Math.max(...all_vals) }
        },
        order_function() {
            return this.choice_mgw_value[this.option_mgw_value][1]
        },
        fdr_attribute() {
            let suffix = this.choice_data_type[this.option_data_type].suffix;
            return (this.choice_data_source[this.option_data_source].attribute) + suffix;
        },
        gameweek_deadlines() {
            if (!this.is_main_ready) { return [] }
            let events = this.main_data.events;
            let points = events.map(i => { return { 'id': i.id, 'name': 'GW' + i.id, 'start': i.deadline_time, 'group': 0, 'contentX': 'GW' + i.id + ' Deadline' } });
            return points;
        },
        gameweek_range() {
            let all_games = this.fixture_data.map(i => { return { 'event': i.event, 'start': i.kickoff_time, 'start_dt': new Date(i.kickoff_time) } }).filter(i => i.event !== null);
            let bounds = _(all_games).groupBy('event').mapValues(a => ({ id: "GW" + a[0].event, content: "GW" + a[0].event, type: "background", start: _.minBy(a, 'start_dt').start_dt, end: new Date(_.maxBy(a, 'start_dt').start_dt.getTime() + (2 * 60 * 60 * 1000)) })).value();
            let bounds_arr = Object.values(bounds);
            bounds_arr.forEach((gw) => {
                if (gw.end.getTime() - gw.start.getTime() <= 24 * 60 * 60 * 1000) {
                    gw.end = new Date(gw.start.getTime() + 2 * 24 * 60 * 60 * 1000)
                }
                let is_finished = (new Date() > gw.end)
                gw['className'] = (new Date() > gw.end) ? "finishedgw" : ((new Date() > gw.start) ? "activegw" : "futuregw")
            })
            return bounds_arr;
        },
        games_as_list() {
            if (!this.is_main_ready) { return [] }
            let games = app.fixture_data.filter(i => i.kickoff_time !== null)
            let game_items = games.map(i => {
                return {
                    'id': "GAME" + i.id,
                    'content': teams_ordered[i.team_h - 1].short + ' vs ' + teams_ordered[i.team_a - 1].short,
                    'start': new Date(i.kickoff_time),
                    'endX': new Date(new Date(i.kickoff_time).getTime() + 105 * 60 * 1000),
                    'group': 2
                }
            })
            return game_items
        },
        next_deadline() {
            let d = this.gameweek_deadlines;
            for (let g of d) {
                let deadline = (new Date(g.start)).getTime()
                let timenow = (new Date()).getTime()
                let diff = deadline - timenow
                if (diff > 0) {
                    return deadline;
                }
            }
            return undefined;
        },
        future_deadlines() {
            let g = _.cloneDeep(this.gameweek_deadlines)
            g = g.filter(i => i.id >= this.this_gw)
            let prev = undefined
            g.forEach((e) => {
                let d = new Date(e.start)
                e.dt_obj = d
                e.dt = d.toLocaleDateString() + ' ' + d.toLocaleDateString(undefined,{'weekday': 'long'}) + ' ' + d.toLocaleTimeString()
                if (prev == undefined) {
                    e.diff = millisecondsToStr(e.dt_obj.getTime() - (new Date()).getTime())
                }
                else {
                    e.diff = millisecondsToStr(e.dt_obj.getTime() - prev)
                }
                prev = e.dt_obj.getTime()
            })

            return g
        },
        range_from_input: {
            get: function() { return this.range_from },
            set: function(e) {
                this.range_from = e;
                if (this.range_to < this.range_from) { this.range_to = this.range_from }
            }
        },
        range_to_input: {
            get: function() { return this.range_to },
            set: function(e) {
                this.range_to = e;
                if (this.range_to < this.range_from) { this.range_from = this.range_to }
            }
        },
        color_options() {
            return [
                { 'title': 'Default', 'func': d3.interpolateRgb("#66c8cf", "#ad2222") },
                { 'title': 'Custom', 'func': d3.piecewise(d3.interpolateRgb, this.color_scheme) },
                { 'title': 'Blue to Red', 'func': (v) => d3.interpolateRdBu(1 - v) },
                { 'title': 'Blue/Green to Brown', 'func': (v) => d3.interpolateBrBG(1 - v) },
                { 'title': 'Green to Purple', 'func': (v) => d3.interpolatePRGn(1 - v) },
                { 'title': 'Green to Pink', 'func': (v) => d3.interpolatePiYG(1 - v) },
                { 'title': 'Purple to Orange', 'func': d3.interpolatePuOr },
                { 'title': 'Gray to Red', 'func': (v) => d3.interpolateRdGy(1 - v) },
                { 'title': 'Blue-Yellow-Red', 'func': (v) => d3.interpolateRdYlBu(1 - v) },
                { 'title': 'Green-Yellow-Red', 'func': (v) => d3.interpolateRdYlGn(1 - v) },
                { 'title': 'Spectral', 'func': (v) => d3.interpolateSpectral(1 - v) },
            ]
        },
    },
    methods: {
        order_by_diff() {
            this.invalidate_cache()
            let table = $("#main_fixture").DataTable();
            table.order([table.columns().header().length - 1, 'asc']).draw()
        },
        saveFixtureData(data) {
            data.forEach((g) => {
                g.original_event = g.event;
            })
            this.original_fixture_data = Object.freeze(_.cloneDeep(data));
            this.fixture_data = Object.freeze(data);
        },
        saveSeasonProjection(data) {
            this.season_projections = Object.freeze(data);
        },
        destroy_table() {
            $("#main_fixture").DataTable().destroy();
        },
        load_table() {
            $("#main_fixture").DataTable().destroy();
            this.$nextTick(() => {
                $("#main_fixture").DataTable({
                    "order": [],
                    "lengthChange": false,
                    "pageLength": 20,
                    "searching": false,
                    "info": false,
                    "paging": false,
                    "columnDefs": [],
                    buttons: [
                        'copy', 'csv'
                    ]
                });
                $("#main_fixture").DataTable().buttons().container()
                    .appendTo('#button-box');
 
                if (this.show_earlier_gws) {
                    let left_offset = document.querySelector("#active_gw").getBoundingClientRect().x - document.querySelector("#col_gw1").getBoundingClientRect().x;
                    // $("#main_fixture").scrollLeft(left_offset);
                    $("#scroller").scrollLeft(left_offset);
                }
                else {
                    $("#scroller").scrollLeft(0);
                }
            })


            $("#edit_fixture").DataTable().destroy();
            this.$nextTick(() => {
                $("#edit_fixture").DataTable({
                    "order": [
                        [1, 'asc'],
                        [0, 'asc']
                    ],
                    "lengthChange": false,
                    // "pageLength": 10,
                    "searching": true,
                    "info": false,
                    // "paging": true,
                    paging: false,
                    scrollY: '50vh',
                    "columnDefs": [
                        { targets: [2], orderable: false },
                    ]
                });
            })
        },
        refresh_with_timeout() {
            this.destroy_table()

            setTimeout(() => {
                app.$nextTick(() => {
                    app.load_table()
                })
            }, 100)
        },
        timelineInteract(e) {
            let timeline = this.timeline;
            let t = e.target.dataset.action;
            switch (t) {
                case "goToday":
                    timeline.moveTo(timeline.getCurrentTime())
                    break;
                case "zoomOut":
                    timeline.zoomOut(0.2);
                    break;
                case "zoomIn":
                    timeline.zoomIn(0.2);
                    break;
                case "reset":
                    timeline.redraw();
                    break;
                case "toggleGames":
                    // this.groups.get(2).visible = !this.groups.get(2).visible;
                    let new_val = !this.groups.get(2).visible;
                    this.groups.update({ id: 2, visible: new_val })
                    break;
                case "goPrevGW":
                    break;
                case "goNextGW":
                    break;
            }
        },
        load_calendar() {

            return

            var container = document.getElementById('visualization');
            var timeline = new vis.Timeline(container);

            var groups = new vis.DataSet([
                { id: 0, content: 'Deadlines', value: 0 },
                { id: 2, content: 'Games', value: 2, visible: false, showNested: true }
            ]);
            timeline.setGroups(groups);
            this.groups = groups;

            let deadlines = this.gameweek_deadlines;
            let ranges = this.gameweek_range;
            let games = this.games_as_list

            let items = deadlines.concat(ranges)
            items = items.concat(games)
            timeline.setItems(items);

            var options = {
                start: new Date((new Date()).valueOf() - 1000 * 60 * 60 * 24 * 2),
                end: new Date((new Date()).valueOf() + 1000 * 60 * 60 * 24 * 12),
            };
            timeline.setOptions(options);

            this.timeline = timeline;

        },
        invalidate_cache() {
            this.$nextTick(() => {
                var table = $("#main_fixture").DataTable();
                table.cells("td").invalidate().draw();
                var table = $("#edit_fixture").DataTable();
                table.cells("td").invalidate().draw();
            })
        },
        get_color(e) {
            let cb = this.color_bounds;
            const len = e.length;
            let range = cb.maxval - cb.minval;
            let minval = cb.minval;
            if (len == 0) { return "#00000024" } else {
                // var colors = d3.piecewise(d3.interpolateRgb.gamma(this.gamma), [this.color_scheme[0], "white", this.color_scheme[1]]);
                var colors = this.color_options[this.color_choice].func;
                if (len == 1) {
                    let score = e[0][this.fdr_attribute];
                    let color = colors((score - minval) / range);
                    return color;
                } else {
                    let score0 = e[0][this.fdr_attribute];
                    let color0 = colors((score0 - minval) / range);
                    let score1 = e[1][this.fdr_attribute];
                    let color1 = colors((score1 - minval) / range);
                    return `linear-gradient(90deg, ${color0} 0%, ${color1} 100%)`;
                }
            }
        },
        order_value(e, r = false) {
            let vals = e.map(j => j[this.fdr_attribute])
            if (vals.length == 0) {
                return 999;
            } else {
                if (r) {
                    return this.order_function(vals).toFixed(2)
                } else {
                    return this.order_function(vals)
                }
            }
        },
        order_as_list(e, r = false) {
            let vals = e.map(j => j[this.fdr_attribute])
            if (vals.length == 0) {
                return "";
            } else {
                if (r) {
                    if (vals.length == 1) {
                        return this.order_function([vals[0]]).toFixed(2)
                    } else {
                        return vals.map(i => this.order_function([i]).toFixed(2)).join(', ')
                    }
                } else {
                    return this.order_function(vals)
                }
            }
        },
        countDown() {
            this.time_left = millisecondsToStr(this.next_deadline - (new Date()).getTime())
        },
        startTimer() {
            this.countDown();
            // setInterval(this.countDown, 1000);
        },
        saveFixtureToFile() {
            downloadToFile(JSON.stringify(this.fixture_data), 'fixture.json', 'json');
        },
        loadFixtureFromFile(event) {
            let self = this;
            if (event.target.files == undefined) {
                return;
            }
            let file = event.target.files[0]
            event.target.value = '';
            if (file.type == "application/json") {
                const reader = new FileReader()
                reader.onload = (event) => {
                    this.fixture_data = JSON.parse(event.target.result)
                };
                reader.onerror = error => reject(error);
                reader.readAsText(file);
            }
            console.log(event.target.files);
        },
        resetFixture() {
            this.fixture_data = _.cloneDeep(this.original_fixture_data);
            this.invalidate_cache();
        },
        openModalIfCustom(v) {
            if (v === 1) {
                $("#customColorModal").modal('show');
            }
        }
    }
});

async function fetch_fpl_fixture() {
    return get_entire_fixture().then((data) => {
        app.saveFixtureData(data);
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_fpl_main() {
    return get_fpl_main_data().then((data) => {
        app.main_data = Object.freeze(data);
        let this_gw = data.events.find(i => i.is_next).id;
        app.this_gw = this_gw;
        app.range_from = this_gw;
    }).catch((e) => {
        console.log("Error", e)
    })
}

// async function fetch_fivethirtyeight() {
//     return read_local_file(data_target).then((data) => {
//         let tablevals = data.split('\n').map(i => i.split(','));
//         let keys = tablevals[0];
//         let values = tablevals.slice(1);
//         let final_data = values.map(i => _.zipObject(keys, i));
//         app.fte_data = final_data;
//     })
// }

// getDetailedData

async function fetch_season_projection() {
    return getSeasonProjection({ season: season })
        .then((data) => {
            app.saveSeasonProjection(data);
        })
        .catch(error => {
            console.error(error);
        });
}

$(document).ready(() => {
    Promise.all([
            fetch_fpl_fixture(),
            fetch_fpl_main(),
            fetch_season_projection()
            // fetch_fivethirtyeight()
        ]).then((values) => {
            app.$nextTick(() => {
                app.load_table()
                app.load_calendar()
                app.startTimer()
            })
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });

    $('#editFixtureModal').on('shown.bs.modal', function(e) {
        $("#edit_fixture").DataTable().columns.adjust()
    })
})