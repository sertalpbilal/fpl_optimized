var app = new Vue({
    el: '#app',
    data: {
        ready: false,
        team_id: '',
        loading: false,
        sc_files: sc_files,
        active_sc: 0,
        sc_details: undefined,
        main_data: undefined,
        team_data: undefined,
        // lineup: [],
        // bench: [],
        picked_out: undefined,
        swap_out: undefined,
        trigger: 0
    },
    computed: {
        grouped_sc() {
            if (_.isEmpty(this.sc_details)) { return {}}
        },
        picks() {
            if (_.isEmpty(this.team_data)) { return []}
            return this.team_data.picks
        },
        elements() {
            if (_.isEmpty(this.main_data)) { return undefined }
            return this.main_data.elements
        },
        // elements_dict() {
        //     if (_.isEmpty(this.elements)) { return {} }
        //     let els = this.elements
        //     let el_dict = Object.fromEntries(els.map(i => [i.id, i]))
        //     return el_dict
        // },
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
                p.img = "https://resources.premierleague.com/premierleague/photos/players/110x140/p" + p.data.photo.replace(".jpg", ".png")
            })
            let lineup = picks.filter(i => i.multiplier > 0)
            let bench = picks.filter(i => i.multiplier == 0)
            lineup.forEach((p,idx) => {
                p.x = this.get_lineup_x(lineup, p, idx)
                p.y = (p.data.element_type - 1) * 34 + 5
                
            })
            bench.forEach((p,idx) => {
                p.x = this.get_bench_x(idx)
                p.y = 4 * 35 + 2
            })
            return picks
        },
        grouped_scenarios() {
            if (_.isEmpty(this.sc_details)) { return {} }
            return _(this.sc_details).groupBy('sim').map((value,key) => {return {'sim': key, 'values': Object.fromEntries(value.map(i => [i.ID, i]))}}).value()
        },
        scenario_evals() {
            if (_.isEmpty(this.team_data)) { return [] }
            if (_.isEmpty(this.sc_details)) { return [] }
            if (_.isEmpty(this.team_picks)) { return {} }
            let picks = this.team_picks
            let grouped_scenarios = this.grouped_scenarios
            let elements = this.elements
            // let el_dict = this.elements_dict
            // let t = this.trigger
            // console.log(t)
            grouped_scenarios.forEach(s => {
                let score = 0
                let field = 0
                picks.forEach(p => {
                    let player_score = (s.values[p.element] && s.values[p.element].Points) || 0
                    score += parseInt(player_score) * p.multiplier
                    // field += parseInt(player_score) * p.data.
                })
                s.total_score = score
                elements.forEach(p => {
                    let player_score = (s.values[p.id] && s.values[p.id].Points) || 0
                    field += parseInt(player_score) * (parseFloat(p.selected_by_percent)/100)
                })
                s.total_field = field
                s.diff = score-field
            })

            return grouped_scenarios
        },
        scenario_stats() {
            if (_.isEmpty(this.team_picks)) { return {} }
            if (_.isEmpty(this.scenario_evals)) { return {} }
            let evals = this.scenario_evals
            let sample_values = evals.map(i => i.total_score)
            let avg_score = sample_values.reduce((a,b) => a+b, 0) / evals.length
            let best_one = _.maxBy(evals, 'total_score')
            let worst_one = _.minBy(evals, 'total_score')
            let best_diff_field = _.maxBy(evals, 'diff')
            let worst_diff_field = _.minBy(evals, 'diff')
            
            let variance = jStat.variance(sample_values)
            let step = jStat.studentt.inv(0.95,sample_values.length-1) * Math.sqrt(variance) / Math.sqrt(sample_values.length)
            let conf_interval = [avg_score - step, avg_score + step]
            let quantiles = jStat.quantiles(sample_values, [0, 0.25, 0.5, 0.75, 1])
            return {
                avg_score, 
                best_one: {'sim': best_one.sim, 'total_score': best_one.total_score}, 
                worst_one: {'sim': worst_one.sim, 'total_score': worst_one.total_score},
                best_diff: {'sim': best_diff_field.sim, 'diff': best_diff_field.diff},
                worst_diff: {'sim': worst_diff_field.sim, 'diff': worst_diff_field.diff},
                total_scores: sample_values,
                quantiles,
                conf_interval
            }
        }
    },
    methods: {
        current_gw() {
            let name = this.sc_files[this.active_sc]
            return parseInt(name.split('/').filter(i => i.includes("GW"))[0].split("GW")[1])
        },
        fetch_team_picks() {
            this.team_data = undefined
            this.lineup = []
            this.bench = []
            let target_gw = this.current_gw() - 1
            this.loading = true
            get_team_picks({ gw: target_gw, team_id: this.team_id, force_last_gw: false }).then((response) => {
                app.team_data = response.body
                app.loading = false
            }).catch(error => {
                console.error(error)
            })
        },
        submitTeam(e) {
            if (e.keyCode === 13) {
                this.fetch_team_picks()
            }
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
            let picks = _.cloneDeep(this.team_data.picks)
            let cc = picks.find(i => i.multiplier > 1)
            cc.multiplier = 1
            let nc = picks.find(i => i.element == e)
            nc.multiplier = 2
            this.team_data.picks = picks
            this.$nextTick(() => {
                app.trigger = app.trigger + 1
            })
        },
        select_out(e) {
            if (this.picked_out == e) {
                this.picked_out = undefined
            }
            else {
                this.picked_out = e
            }
        },
        select_swap(e) {
            if (this.swap_out == e) { // cancel swap
                this.swap_out = undefined
                this.team_data.picks.forEach(p => {
                    p.swap_available = undefined
                })
            }
            else {
                if (this.swap_out == undefined) {
                    this.swap_out = e
                    let picks = this.team_data.picks
                    let tp = this.team_data.picks.find(i => i.element == e)
                    // TODO check formation legality here!
                    let is_lineup = tp.multiplier > 0
                    let el_type = tp.data.element_type

                    let condition

                    let current_vals = {
                        1: {'count': picks.filter(i => i.data.element_type == 1 && i.multiplier > 0).length, 'max': 1, 'min': 1},
                        2: {'count': picks.filter(i => i.data.element_type == 2 && i.multiplier > 0).length, 'max': 5, 'min': 3},
                        3: {'count': picks.filter(i => i.data.element_type == 3 && i.multiplier > 0).length, 'max': 5, 'min': 2},
                        4: {'count': picks.filter(i => i.data.element_type == 4 && i.multiplier > 0).length, 'max': 3, 'min': 1}
                    }

                    if (el_type == 1) {
                        condition = e => Boolean(e.multiplier) != Boolean(tp.multiplier) && e.data.element_type == 1
                    }
                    else {
                        if (is_lineup) {
                            let is_out_at_min = current_vals[el_type].count <= current_vals[el_type].min
                            condition = e => { return e.multiplier == 0 && (e.data.element_type == el_type || (!is_out_at_min && current_vals[e.data.element_type].count < current_vals[e.data.element_type].max)) }
                        }
                        else {
                            let is_in_at_max = current_vals[el_type].count >= current_vals[el_type].max
                            condition = e => { return (e.multiplier > 0 && (e.data.element_type == el_type || (!is_in_at_max && current_vals[e.data.element_type].count > current_vals[e.data.element_type].min))) || (e.multiplier == 0 && e.data.element_type != 1) }
                        }
                    }

                    picks.forEach(p => {
                        p.swap_available = condition(p)
                    })
                }
                else { // perform swap!
                    let p_out = this.team_data.picks.find(i => i.element == this.swap_out)
                    let p_in = this.team_data.picks.find(i => i.element == e)
                    
                    let c = p_out.multiplier * 1
                    p_out.multiplier = 999
                    p_out.multiplier = p_in.multiplier * 1
                    p_in.multiplier = c

                    const swapArrayLocs = (arr, index1, index2) => {
                        [arr[index1], arr[index2]] = [arr[index2], arr[index1]]
                      }

                    // position swap
                    let o1 = this.team_data.picks.findIndex(i => i.element == this.swap_out)
                    let o2 = this.team_data.picks.findIndex(i => i.element == e)
                    swapArrayLocs(this.team_data.picks, o1, o2)

                    this.swap_out = undefined
                    this.team_data.picks.forEach(p => {
                        p.swap_available = undefined
                    })
                    
                    this.$nextTick(() => {
                        app.trigger = app.trigger + 1
                    })

                }
                
            }
        }
    }
})


function read_scenario(order=0) {
    let file = app.sc_files[order]
    return read_local_file(file).then(d => {
        app.active_sc = order
        app.sc_details = $.csv.toObjects(d)
    })
}


$(document).ready(() => {
    Promise.all([
        read_scenario(),
        get_fpl_main_data().then(d => {
            app.main_data = d
        })
    ]).then((values) => {
        app.ready = true
    })
    .catch((error) => {
        console.error("An error has occured: " + error);
    });
})
