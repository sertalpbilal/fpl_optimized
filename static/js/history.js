
var app = new Vue({
    el: '#app',
    data: {
        seasons: seasons,
        selected_season: '',
        season_data: undefined,
        player_gw_dict: undefined,
        player_sums: undefined,
        players_sorted: undefined,
        table_ready: false,
        pos_dict: {1: 'G', 2: 'D', 3: 'M', 4: 'F'}
    },
    computed: {
        player_dict() {
            if (!this.season_data) { return undefined }
            let elements = this.season_data.elements
            return _.fromPairs(elements.map(i => [i.id, i]))
        }
    },
    methods: {
        update_season() {

            let pts_table = $("#pts_table")
            if (pts_table) {
                pts_table.DataTable().destroy();
            }
            this.table_ready = false;
            
            let s = this.selected_season
            if (s == '') {
                this.season_data = undefined
                this.player_gw_dict = undefined
                this.player_sums = undefined
                this.players_sorted = undefined
                return
            }

            read_local_file(`data/${s}/points.json`).then((points_data) => {
                read_local_file(`data/${s}/static.json`).then((static_data) => {
                    let final_dict = {}
                    _.each(points_data, (entries, gw) => { // (val, key)
                        _.forEach(entries, entry => {
                            let player = {
                                'id': entry.id,
                                'total': _.sum(entry.e.map(i => i.stats.map(j => j.points)).flat())
                            }
                            _.set(final_dict, `${entry.id}.${gw}`, player)
                        })
                    })

                    this.player_gw_dict = Object.freeze(final_dict)
                    this.player_sums = Object.freeze(_(final_dict).mapValues((val,key) => _.sumBy(val, 'total')).value())
                    this.players_sorted = Object.freeze(_(this.player_sums).toPairs().orderBy([1], ['desc']).value())

                    this.season_data = Object.freeze(static_data)

                    this.$nextTick(() => {
                        let table = $("#pts_table").DataTable({
                            "order": [4],
                            // "lengthChange": true,
                            // // "pageLength": 100,
                            "searching": true,
                            // "info": false,
                            "paging": true,
                            "columnDefs": [],
                            scrollX: true,
                            buttons: [
                                'copy', 'csv'
                            ]
                        });
                        table.cells("td").invalidate().draw();
                        table.buttons().container()
                            .appendTo('#buttons');
                        
                        this.table_ready = true;
                    })
                })
            })
        },
        pts_color(pid, gw) {
            let pts = _.get(this.player_gw_dict, `${pid}.${gw}.total`, undefined)
            if (pts == undefined) { return "none" }
            let colors = d3.scaleLinear().domain([-100, -1, 0, 3, 15]).range(["#e19797", "#e19797", "#ffffff", "#ffffff", "#7FD3D9"])
            return colors(pts)
        }
    }
})

$(document).ready(() => {
    
})
