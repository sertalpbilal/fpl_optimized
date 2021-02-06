var app = new Vue({
    el: '#app',
    data: {
        current_dt: new Date(),
        fill_width: false,
        fixture_data: undefined,
        main_data: undefined,
        fte_data: undefined,
        choice_data_source: [
            { 'name': "FiveThirtyEight", 'attribute': 'fdr_fte' },
            { 'name': "Official FPL", 'attribute': 'fdr' }
        ],
        option_data_source: 0,
        choice_data_type: ["FDR", "Difference"],
        option_data_type: 0,
        choice_table_display: ["Teams", "Raw Value"],
        option_table_display: 0,
        choice_mgw_value: [
            ["Top", (arr) => { return (arr.length > 1 ? 0 - 1 / getSum(arr) : arr[0]) }],
            ["Minimum", getMin],
            ["Maximum", getMax],
            ["Average", getAvg],
            ["Sum", getSum],
        ],
        option_mgw_value: 0,
        option_show_double: true,
        hfa: 0.15
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
            // if (!this.is_all_ready) { return [] }
            let this_gw = app.main_data.events.find(i => i.is_next).id;
            let weeks = _.uniq(this.fixture_data.map(i => i.event), true)
            if (weeks[0] == null) {
                weeks = [...weeks.slice(1), weeks[0]]
            }
            weeks = weeks.map(i => i == null ? { "no": i, "text": "No date", "this_gw": false } : { "no": i, "text": "GW" + i, "this_gw": false })
            weeks.find(i => i.no == this_gw)['this_gw'] = true;
            return weeks
        },
        fdr() {
            let fdr = {};
            let teams = _.uniq(app.fixture_data.map(i => i.team_h));
            teams.forEach((team) => {
                let team_name = teams_ordered[team - 1].name;
                let entry = app.fte_data.find(i => i.name == team_name)
                if (entry == undefined) {
                    let team_long = teams_ordered[team - 1].long;
                    entry = app.fte_data.find(i => i.name == team_long)
                }

                if (this.option_data_source == 0) { // FTE
                    fdr[team - 1] = parseFloat(entry.off) - parseFloat(entry.def);
                } else if (this.option_data_source == 1) { // FPL
                    fdr[team - 1] = 1;
                }
            })
            return fdr;
        },
        rivals() {
            let fdr = this.fdr;
            let fd = this.fixture_data;
            let rivals = {};
            let teams = _.uniq(app.fixture_data.map(i => i.team_h));
            let gameweeks = _.uniq(app.fixture_data.map(i => i.event));
            teams.forEach((team) => {
                let r = rivals[team] = {}
                gameweeks.forEach((gw) => {
                    r[gw] = [];
                    home_games = fd.filter((i) => { return i.team_h == team && i.event == gw });
                    let data = home_games.map(i => {
                        return {
                            'rival': teams_ordered[i.team_a - 1].short.toUpperCase(),
                            'fdr': i.team_h_difficulty,
                            'fdr_fte': fdr[i.team_a - 1],
                            'fdr_diff': i.team_h_difficulty - i.team_a_difficulty,
                            'fdr_fte_diff': fdr[i.team_a - 1] - fdr[i.team_h - 1] * Math.exp(this.hfa)
                        }
                    })
                    r[gw] = r[gw].concat(data);
                    away_games = fd.filter((i) => { return i.team_a == team && i.event == gw });
                    data = away_games.map(i => {
                        return {
                            'rival': teams_ordered[i.team_h - 1].short.toLowerCase(),
                            'fdr': i.team_a_difficulty,
                            'fdr_fte': fdr[i.team_h - 1] * Math.exp(this.hfa),
                            'fdr_diff': i.team_a_difficulty - i.team_h_difficulty,
                            'fdr_fte_diff': fdr[i.team_h - 1] * Math.exp(this.hfa) - fdr[i.team_a - 1]
                        }
                    })
                    r[gw] = r[gw].concat(data);
                })
            })
            return rivals;
        },
        color_bounds() {
            let all_vals = Object.values(this.rivals).map(i => Object.values(i).flat()).flat().map(i => i[app.fdr_attribute]);
            return { 'minval': Math.min(...all_vals), 'maxval': Math.max(...all_vals) }
        },
        order_function() {
            return this.choice_mgw_value[this.option_mgw_value][1]
        },
        fdr_attribute() {
            let suffix = ""
            if (this.option_data_type == 1) { suffix = "_diff" }
            return (this.choice_data_source[this.option_data_source].attribute) + suffix;
        }
    },
    methods: {
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
                });

                let left_offset = document.querySelector("#active_gw").getBoundingClientRect().x - document.querySelector("#col_gw1").getBoundingClientRect().x;
                $("#main_fixture").scrollLeft(left_offset);
            })
        },
        invalidate_cache() {
            this.$nextTick(() => {
                var table = $("#main_fixture").DataTable();
                table.cells("td").invalidate().draw();
            })
        },
        get_color(e) {
            let cb = this.color_bounds;
            const len = e.length;
            let range = cb.maxval - cb.minval;
            let minval = cb.minval;
            if (len == 0) { return "#00000024" } else {
                var colors = d3.interpolateRgb("#66c8cf", "#ad2222");
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
                return 0;
            } else {
                if (r) {
                    return this.order_function(vals).toFixed(2)
                } else {
                    return this.order_function(vals)
                }

            }
        },
    }
});

async function fetch_fpl_fixture() {
    return get_entire_fixture().then((data) => {
        app.fixture_data = data;
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_fpl_main() {
    return get_fpl_main_data().then((data) => {
        app.main_data = data;
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_fivethirtyeight() {
    return read_local_file(data_target).then((data) => {
        let tablevals = data.split('\n').map(i => i.split(','));
        let keys = tablevals[0];
        let values = tablevals.slice(1);
        let final_data = values.map(i => _.zipObject(keys, i));
        app.fte_data = final_data;
    })
}

$(document).ready(() => {
    Promise.all([
            fetch_fpl_fixture(),
            fetch_fpl_main(),
            fetch_fivethirtyeight()
        ]).then((values) => {
            app.$nextTick(() => {
                app.load_table()
            })
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
})