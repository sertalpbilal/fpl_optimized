
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
        gw_selected: undefined
    },
    computed: {
        filtered_players() {
            if (this.team_selected == undefined || this.gw_selected == undefined) { return []}
            let filtered = this.points_data[this.gw_selected]
            let player_ids = this.elements.filter(i => i.team == this.team_selected).map(i => i.id)
            filtered = filtered.filter(i => player_ids.includes(i.id))
            filtered = _.orderBy(filtered, ['player.element_type', 'total_min', 'total_pts'], ['asc', 'desc', 'desc'])
            debugger
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
        }
    },
    methods: {
        
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
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
})
