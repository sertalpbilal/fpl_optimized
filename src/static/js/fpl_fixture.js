var app = new Vue({
    el: '#app',
    data: {
        current_dt: new Date(),
        fixture_data: undefined,
        main_data: undefined
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
        rivals() {
            let fd = this.fixture_data;
            let rivals = {};
            let teams = _.uniq(app.fixture_data.map(i => i.team_h));
            let gameweeks = _.uniq(app.fixture_data.map(i => i.event));
            teams.forEach((team) => {
                let r = rivals[team] = {}
                gameweeks.forEach((gw) => {
                    r[gw] = [];
                    home_games = fd.filter((i) => { return i.team_h == team && i.event == gw });
                    let data = home_games.map(i => { return { 'rival': teams_ordered[i.team_a - 1].short.toUpperCase(), 'fdr': i.team_h_difficulty - i.team_a_difficulty * 0.1 - 0.1 } })
                    r[gw] = r[gw].concat(data);
                    away_games = fd.filter((i) => { return i.team_a == team && i.event == gw });
                    data = away_games.map(i => { return { 'rival': teams_ordered[i.team_h - 1].short.toLowerCase(), 'fdr': i.team_a_difficulty - i.team_h_difficulty * 0.1 } })
                    r[gw] = r[gw].concat(data);
                })
            })
            return rivals;
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
        get_color(e) {
            let score = getSum(e.map(i => i.fdr));
            if (score == 0) { return "#00000024" }
            debugger;
            var i = d3.interpolateRgb("#66c8cf", "#ad2222");
            // var i = d3.interpolateRdYlGn;
            let color = i((score - 0.4) / 4.5);
            return color;
        }
    }
});

async function fetch_fpl_fixture() {
    return get_entire_fixture().then((data) => {
        console.log(data)
        app.fixture_data = data;
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_fpl_main() {
    return get_fpl_main_data().then((data) => {
        console.log(data);
        app.main_data = data;
    }).catch((e) => {
        console.log("Error", e)
    })
}

$(document).ready(() => {
    Promise.all([
            fetch_fpl_fixture(),
            fetch_fpl_main()
        ]).then((values) => {
            app.$nextTick(() => {
                app.load_table()
            })
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
})