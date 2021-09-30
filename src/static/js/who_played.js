
let scaled_color = ({
    d,
    min = 0,
    max = 1,
    colors = ["#70f4ff", "#fbfbfb", "#ff8763"], //["#c6311b", "#676767", "#3390f7"]
    revert = false
}) => {
    let dom = [-100, 0, 0.5, 1, 100]
    if (revert) {
        dom = [100, 1, 0.5, 0, -100]
    }
    let v = d3.scaleLinear().domain(dom).range([colors[0], colors[0], colors[1], colors[2], colors[2]])
    return v((d - min) / (max - min))
}

var app = new Vue({
    el: '#app',
    data: {
        season: season,
        next_gw: gw,
        //
        points_data: undefined,
        //
        loading: false,
        ready: false,
        players: [],
        teams: teams_ordered,
        gameweeks: gameweeks,
        elements: elements,
        // selection
        team_selected: undefined,
        gw_selected: undefined,
        scaled_color: scaled_color,
        show_pts: false
    },
    computed: {
        filtered_players() {
            if (this.team_selected == undefined || this.gw_selected == undefined) { return []}
            if (!(this.gw_selected in this.points_data)) { return []}
            let filtered = this.points_data[this.gw_selected]
            let player_ids = this.elements.filter(i => i.team == this.team_selected).map(i => i.id)
            filtered = filtered.filter(i => player_ids.includes(i.id))
            filtered = _.orderBy(filtered, ['player.element_type', 'total_min', 'total_pts'], ['asc', 'desc', 'desc'])
            let lineup_count = _.countBy(filtered, 'player.element_type')
            let ctr = {1: 1, 2: 1, 3: 1, 4: 1}
            filtered.forEach((p) => {
                let pos = p.player.element_type
                let cnt = ctr[pos]
                ctr[pos] += 1
                let pos_tot = lineup_count[pos]
                p.x = 122 / (pos_tot + 1) * cnt - 17;
                p.y = (pos - 1) * 35 + 3;
            })
            return filtered
        },
        filtered_by_season_players() {
            if (this.team_selected == undefined) { return []}
            let players = this.elements.filter(i => i.team == this.team_selected)
            let overall_total = 0
            players.forEach((p) => {
                p.min_data = {}
                p.pts_data = {}
                p.total_min = 0
                p.total_pts = 0
                p.matches_played = 0
                for (let w of this.gameweeks) {
                    let entry = w in this.points_data ? this.points_data[w].find(i => i.id == p.id) : undefined
                    if (entry == undefined) {
                        p.min_data[w] = 0
                        p.pts_data[w] = 0
                    }
                    else {
                        p.matches_played += 1
                        p.min_data[w] = entry.total_min
                        p.total_min += entry.total_min
                        if (w == this.next_gw) {
                            overall_total += entry.total_min
                        }
                        p.pts_data[w] = entry.total_pts
                        p.total_pts += entry.total_pts
                    }
                    
                }
                p.muted = p.total_min == 0
            })
            players.forEach((p) => {
                p.overall_total = overall_total
                p.min_per_game = p.total_min / (p.matches_played > 0 ? p.matches_played : 1)
                p.pts_per_game = p.total_pts / (p.matches_played > 0 ? p.matches_played : 1)
            })
            players = _.orderBy(players, ['element_type', 'total_min', 'id'], ['asc', 'desc', 'asc'])
            return players
        },
        team_played() {
            if (this.team_selected == undefined || _.isEmpty(this.filtered_by_season_players)) { return true}
            return this.filtered_by_season_players[0].overall_total > 0
        },
        team_selected_name() {
            if (this.team_selected == undefined) { return ""}
            return this.teams[this.team_selected-1].name
        },
        team_computed: {
            get: () => {
                return app.team_selected
            },
            set: (v) => {
                app.remove_dt()
                app.team_selected = v
                app.load_dt()
            }
        }
    },
    methods: {
        remove_dt() {
            $("#value_table").DataTable().destroy();
        },
        load_dt() {
            this.$nextTick(() => {
                let table = $("#value_table").DataTable({
                    "order": [],
                    "lengthChange": false,
                    "pageLength": 100,
                    "searching": false,
                    "info": false,
                    "paging": false,
                    "columnDefs": []
                });
                table.cells("td").invalidate().draw();
            })
        },
        invalidate_cache() {
            this.$nextTick(() => {
                var table = $("#value_table").DataTable();
                table.cells("td").invalidate().draw();
            })
        },
        togglePt(e) {
            this.remove_dt()
            this.show_pts = e.currentTarget.checked
            this.load_dt()
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
            Object.values(data).forEach((w) => w.forEach((p) => {
                p.player = elements.find(i => i.id == p.id)
                p.minutes = p.e.map(i => i.stats.find(j => j.identifier == 'minutes').value)
                p.total_min = getSum(p.minutes)
                p.full_time = p.total_min == p.e.length * 90
                p.total_pts = getSum(p.e.map(i => i.stats.map(j => j.points)).flat())
            }))
            app.points_data = data;
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

$(document).ready(() => {
    Promise.all([
            get_points()
        ]).then((values) => {
            app.ready = true
            app.load_dt()
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
})
