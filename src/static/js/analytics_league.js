
var app = new Vue({
    el: '#app',
    data: {
        gw: gw,
        active_gw: parseInt(gw.slice(2)),
        static_data: undefined,
        season: "2021-22",
        league_data: [],
        rp_data: [],
        xp_data: [],
        fixture_data: [],
        autosub_dict: {},
        rp_by_id: {}
    },
    computed: {
        this_gw_dynamic() {
            if (this.gw !== undefined || _.isEmpty(this.static_data)) { return parseInt(this.gw.slice(2)) }
            let events_data = this.static_data['events']
            for (let e of events_data) {
                if (e['is_current']) {
                    return e['id']
                }
                if (e['is_next']) {
                    return e['id']-1
                }
            }
            return 38
        },
        el_data() {
            return this.static_data['elements']
        },
        el_data_by_id() {
            return Object.fromEntries((this.static_data['elements']).map(i => [i.id, i]))
        },
        xp_by_id() {
            let xp_data = this.xp_data.map(i => [i.player_id, {xp: i.points_md, xmin: i.xmins_md}])
            return Object.fromEntries(xp_data)
        },
        processed_league_data() {
            if (_.isEmpty(this.league_data) || _.isEmpty(this.xp_data) || _.isEmpty(this.rp_data) || _.isEmpty(this.rp_by_id)) { return []}

            let t = this.league_data
            t.forEach((t) => {
                t.info = {}
                let picks = t[1].picks
                let penalty = t[1].entry_history.event_transfers_cost


                let pre_xp = getSum(picks.map(i => i.multiplier * (parseFloat(this.xp_by_id[i.element].xp) || 0) )) - parseInt(penalty)
                let post_gw_picks = autosubbed_team(picks, this.autosub_dict).team
                let post_xp = getSum(post_gw_picks.map(i => i.multiplier * (parseFloat(this.xp_by_id[i.element].xp) || 0) )) - parseInt(penalty)
                let rp = getSum(post_gw_picks.map(i => i.multiplier * (parseFloat(this.rp_by_id[i.element].stats.total_points) || 0))) - parseInt(penalty)
                let luck = rp - post_xp

                let team_value = getSum(picks.map(i => this.el_data_by_id[i.element].now_cost))/10

                t.info = {pre_xp, post_xp, post_gw_picks, picks, rp, luck, team_value}
            })
            
            t = _.orderBy(t, ['info.pre_xp', 'info.post_xp', 'info.rp'], ['desc', 'desc', 'desc'])
            let last_rank = 1
            let last_pts = 0
            t.forEach((t,i) => {
                if (rounded(t.info.pre_xp,3) == last_pts) {
                    t.info.rank = last_rank + 0;
                }
                else {
                    t.info.rank = i+1;
                    last_rank = i+1;
                }
                last_pts = rounded(t.info.pre_xp,3)
            })

            return t
        }
    },
    methods: {
        active_gw_update(val) {
            
            $("#league_table").DataTable().destroy()
            this.league_data = []

            this.active_gw = this.active_gw + parseInt(val)

            let cgw = this.active_gw


            Promise.all([
                get_fpl_main_data().then((data) => {
                    app.static_data = data
                }),
                get_analytics_data({gw: cgw, season}).then((data) => {
                    app.league_data = data
                }),
                get_fixture(cgw).then((data) => {
                    app.fixture_data = prepare_fixture_data(data);
                }),
                getRPData(cgw).then((data) => {
                    app.rp_data = data
                }),
                getXPData_Fernet({season, gw, date}).then((data) => {
                    app.xp_data = data
                })
            ]).then(() => {
                app.rp_by_id = rp_by_id_dict(app.fixture_data, app.rp_data)
                app.autosub_dict = generate_autosub_dict(app.el_data, app.rp_by_id)
        
                app.$nextTick(() => {
                    app.refresh_table()
                })
            })

        },
        refresh_table() {

            $("#league_table").DataTable().destroy();
            this.$nextTick(() => {
                $("#league_table").DataTable({
                    "order": [
                        [0, 'asc']
                    ],
                    // "lengthChange": true,
                    "lengthMenu": [5, 10, 25, 50, 100],
                    "pageLength": 10,
                    "searching": true,
                    "info": false,
                    "paging": true,
                    // paging: false,
                    // scrollY: '50vh',
                    "columnDefs": [
                        { targets: [1], orderable: false },
                    ],
                    // responsive: true,
                    "scrollX": true
                });
            })
        }
    }
});

$(document).ready(() => {
    let cgw = parseInt(gw.slice(2))
    Promise.all([
        get_fpl_main_data().then((data) => {
            app.static_data = data
        }),
        get_analytics_data({gw: cgw, season}).then((data) => {
            app.league_data = data
        }),
        get_fixture(cgw).then((data) => {
            app.fixture_data = prepare_fixture_data(data);
        }),
        getRPData(cgw).then((data) => {
            app.rp_data = data
        }),
        getXPData_Fernet({season, gw, date}).then((data) => {
            app.xp_data = data
        })
    ]).then(() => {
        app.rp_by_id = rp_by_id_dict(app.fixture_data, app.rp_data)
        app.autosub_dict = generate_autosub_dict(app.el_data, app.rp_by_id)

        app.$nextTick(() => {
            app.refresh_table()
        })
    })
})

