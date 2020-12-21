var app = new Vue({
    el: '#app',
    data: {
        season: season,
        gw: gw,
        date: date,
        listdates: listdates,
        solutions: []
    },
    methods: {
        refresh_results() {
            season = this.season;
            gw = this.gw;
            date = this.date;
            load_all();
        },
        close_date() {
            $("#dateModal").modal('hide');
        },
        setSolutions(values) {
            this.solutions = _.cloneDeep(values);
        }
    },
    computed: {
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
        parsed_solutions: function() {
            let solutions = this.solutions;
            solutions.forEach(
                function(i) {
                    i.AO = (i.ownership.squad.reduce((sume, el) => sume + el, 0) / 15).toFixed(2);
                    i.SO = (i.ownership.sum).toFixed(2);
                    let weeks = Object.keys(i.lineup);
                    let week_returns = Object.fromEntries(weeks.map(w => [w, Object.fromEntries(i.squad.map((j, k) => [j, i.xP[w][k]]))]));


                    let lineup_points = Object.fromEntries(weeks.map(w => [w, i.lineup[w].map(p => week_returns[w][p])]));
                    let pts_lineup = Object.values(lineup_points).map(w => w.reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
                    let pts_captain = Object.entries(i.captain).map(v => week_returns[v[0]][v[1]]).reduce((a, b) => a + b, 0);
                    i.LxP = (pts_lineup + pts_captain).toFixed(2);

                    let bench_points = Object.fromEntries(weeks.map(w => [w, Object.entries(i.bench[w]).map(k => week_returns[w][k[1]])]))
                    let weighted_bench_pts = Object.values(bench_points).map(v => v.map((p, x) => 10 ** Math.min(-x, -1) * p));
                    let pts_bench = Object.values(weighted_bench_pts).map(v => v.reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
                    i.WxP = (pts_lineup + pts_captain + pts_bench).toFixed(2);

                    let pts_bb = Object.values(bench_points).map(v => v.reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
                    i.BBxP = (pts_lineup + pts_captain + pts_bb).toFixed(2);

                    let squad_with_type = _.zip(i.squad, i.element_type)
                    i.sorted_squad = squad_with_type.sort(function(a, b) {
                        if (a[1] == b[1]) { return a[0] - b[0]; }
                        return a[1] - b[1];
                    })
                    i.player_names = _.zipObject(i.squad, i.players);

                })
            return solutions;
        }
    }
})

function load_all() {
    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/output/iterative_model.json`,
        dataType: "json",
        success: function(data) {
            app.setSolutions(data);
            $(document).ready(function() {
                $('#top_squads_table').DataTable({
                    searchBuilder: {},
                    dom: 'Qfrtip',
                    responsive: {
                        details: {
                            display: $.fn.dataTable.Responsive.display.modal({
                                header: function(row) {
                                    var data = row.data();
                                    return 'Details for ' + data[0] + ' ' + data[1];
                                }
                            }),
                            renderer: $.fn.dataTable.Responsive.renderer.tableAll({
                                tableClass: 'table'
                            })
                        }
                    }
                });
            });
        },
        error: function(xhr, status, error) {
            // app.setSolution(name, []);
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

$(document).ready(function() {
    load_all();
});