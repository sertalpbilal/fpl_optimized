var app = new Vue({
    el: '#app',
    data: {
        ready: false,
        team_id: '',
        loading: false,
        calculating: false,
        sc_files: sc_files,
        active_sc: 0,
        sc_details: undefined,
        main_data: undefined,
        team_data: undefined,
        // lineup: [],
        // bench: [],
        picked_out: undefined,
        player_filter: undefined,
        swap_out: undefined,
        trigger: 0,
        active_rep: undefined
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
        elements_dict() {
            if (_.isEmpty(this.elements)) { return {} }
            let els = this.elements
            let el_dict = Object.fromEntries(els.map(i => [i.id, i]))
            return el_dict
        },
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
        grouped_scenario_with_field() {
            if (_.isEmpty(this.sc_details)) { return [] }
            if (_.isEmpty(this.grouped_scenarios)) { return [] }
            let grouped_scenarios = this.grouped_scenarios
            let elements = this.elements
            grouped_scenarios.forEach((s,i) => {
                let field = 0
                elements.forEach(p => {
                    let player_score = (s.values[p.id] && s.values[p.id].Points) || 0
                    field += parseInt(player_score) * (parseFloat(p.selected_by_percent)/100)
                })
                s.total_field = field
            })
            console.log("CALC")
            return grouped_scenarios
        },
        scenario_evals() {
            if (_.isEmpty(this.team_data)) { return [] }
            if (_.isEmpty(this.sc_details)) { return [] }
            if (_.isEmpty(this.team_picks)) { return {} }
            let picks = this.team_picks
            let grouped_scenarios = this.grouped_scenario_with_field
            let position_bounds = {
                1: {'min': 1, 'max': 1},
                2: {'min': 3, 'max': 5},
                3: {'min': 2, 'max': 5},
                4: {'min': 1, 'max': 3}
            }
            grouped_scenarios.forEach((s,i) => {
                let sc_picks = picks.map(i => {return {...i}})
                let score = 0
                sc_picks.forEach(p => {
                    if (p.element in s.values && p.multiplier > 0) {
                        let player_score = (s.values[p.element] && s.values[p.element].Points) || 0
                        score += parseInt(player_score) * p.multiplier
                        p.played = true
                    }
                    else {
                        if (p.multiplier > 0) {
                            p.played = false
                            p.autosub_out = true
                            p.multiplier = 0
                        }
                    }
                    
                })
                s.lineup_score = score + 0
                // Autosub
                sc_picks.filter(i => i.autosub_out).forEach(p => {
                    let pos = p.data.element_type
                    let pos_playing = sc_picks.filter(i => i.data.element_type == pos && i.played).length
                    if (pos_playing < position_bounds[pos].min) {
                        // can only replace with same type
                        let match = sc_picks.find(i => i.multiplier == 0 && i.data.element_type == pos && i.element in s.values)
                        if (match) {
                            match.multiplier = 1
                            match.played = true
                            match.autosub_in = true
                            let player_score = s.values[match.element].Points
                            score += parseInt(player_score) * match.multiplier
                        }
                    }
                    else {
                        // next available bench player
                        let match = sc_picks.find(i => i.multiplier == 0 && i.data.element_type > 1 && i.element in s.values) // no gk
                        if (match) {
                            match.multiplier = 1
                            match.played = true
                            match.autosub_in = true
                            let player_score = s.values[match.element].Points
                            score += parseInt(player_score) * match.multiplier
                        }
                    }
                })
                s.total_score = score
                s.autosub_score = score - s.lineup_score
                s.diff = score-s.total_field
                s.idx = i
                s.picks = sc_picks
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
            let step = jStat.studentt.inv((1-(1-0.95)/2),sample_values.length-1) * Math.sqrt(variance) / Math.sqrt(sample_values.length)
            let conf_interval = [avg_score - step, avg_score + step]
            let quantiles = jStat.quantiles(sample_values, [0, 0.25, 0.5, 0.75, 1])

            let diff_values = evals.map(i => i.diff)
            let diff_quantiles = jStat.quantiles(diff_values, [0, 0.25, 0.5, 0.75, 1])
            let avg_diff = jStat.mean(diff_values)

            let probs = {
                '20+': sample_values.filter(i => i >= 20).length / sample_values.length,
                '30+': sample_values.filter(i => i >= 30).length / sample_values.length,
                '40+': sample_values.filter(i => i >= 40).length / sample_values.length,
                '50+': sample_values.filter(i => i >= 50).length / sample_values.length,
                '60+': sample_values.filter(i => i >= 60).length / sample_values.length,
                '70+': sample_values.filter(i => i >= 70).length / sample_values.length
            }

            let diff_probs = {
                'm10': diff_values.filter(i => i <= -10).length / diff_values.length,
                'm5': diff_values.filter(i => i <= -5).length / diff_values.length,
                'm0': diff_values.filter(i => i <= 0).length / diff_values.length,
                'p0': diff_values.filter(i => i >= 0).length / diff_values.length,
                'p5': diff_values.filter(i => i >= 5).length / diff_values.length,
                'p10': diff_values.filter(i => i >= 10).length / diff_values.length
            }

            setTimeout(() => {
                app.$nextTick(() => {
                    app.calculating = false
                })
            }, 100)

            let lineup_avg = jStat.mean(evals.map(i => i.lineup_score))
            let autosub_avg = jStat.mean(evals.map(i => i.autosub_score))

            return {
                avg_score, 
                best_one: {'sim': best_one.sim, 'total_score': best_one.total_score}, 
                worst_one: {'sim': worst_one.sim, 'total_score': worst_one.total_score},
                best_diff: {'sim': best_diff_field.sim, 'diff': best_diff_field.diff},
                worst_diff: {'sim': worst_diff_field.sim, 'diff': worst_diff_field.diff},
                total_scores: sample_values,
                quantiles,
                conf_interval,
                diff_quantiles,
                avg_diff,
                probs,
                diff_probs,
                lineup_avg,
                autosub_avg
            }
        },
        team_ids() {
            if (_.isEmpty(this.team_data)) { return [] }
            return this.team_data.picks.map(i => i.element)
        },
        graph_update_watch() {
            draw_histogram()
            let t = this.scenario_evals
            return []
        },
        current_rep_dict() {
            if (_.isEmpty(this.grouped_scenarios)) { return {} }
            if (this.active_rep == undefined) { return [] }
            return this.grouped_scenarios[this.active_rep].values
        },
        current_rep_players() {
            if (_.isEmpty(this.grouped_scenarios)) { return [] }
            if (this.active_rep == undefined) { return [] }
            let el_dict = this.elements_dict
            let players = _.cloneDeep(Object.values(this.current_rep_dict))
            players.forEach(p => {
                p.data = el_dict[parseInt(p.ID)]
            })
            players = players.filter(i => i.data !== undefined)
            return players
        },
        current_rep_team() {
            if (_.isEmpty(this.scenario_evals)) { return [] }
            if (this.active_rep == undefined) { return [] }
            return this.scenario_evals[this.active_rep].picks
        },
        current_rep_values() {
            if (_.isEmpty(this.scenario_evals)) { return [] }
            if (this.active_rep == undefined) { return [] }
            return this.scenario_evals[this.active_rep]
        },
        active_rep_comp: {
            get() {
                return this.active_rep
            },
            set(v) {
                $("#top_players").DataTable().destroy()
                this.active_rep = v
                this.$nextTick(() => {
                    let table = $("#top_players").DataTable({
                        "order": [5],
                        "lengthChange": false,
                        "pageLength": 15,
                        "searching": true,
                        "info": false,
                        "paging": true,
                        "columnDefs": []
                    });
                    table.cells("td").invalidate().draw();
                })
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
                app.team_data.picks.forEach(p => {
                    if (p.multiplier > 2) {
                        p.multiplier = 2 // triple captain fix
                    }
                })
                app.loading = false
                draw_histogram()
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
            let picks = this.team_data.picks
            let cc = picks.find(i => i.multiplier > 1)
            let nc = picks.find(i => i.element == e)
            if (cc.element == nc.element) { return } // same player
            this.calculating = true
            cc.multiplier = 1
            nc.multiplier = 2
            this.team_data.picks = picks
            // this.$nextTick(() => {
            //     app.trigger = app.trigger + 1
            // })
        },
        select_out(e) {
            if (this.picked_out != undefined) {
                $("#replacement_options").DataTable().destroy();
            }
            if (this.picked_out == e) {
                this.picked_out = undefined
                this.player_filter = undefined
            }
            else {
                this.picked_out = e
                this.player_filter = this.elements.find(i => i.id == e).element_type

                // replacement_options
                this.$nextTick(() => {
                    let table = $("#replacement_options").DataTable({
                        "order": [4],
                        "lengthChange": false,
                        "pageLength": 15,
                        "searching": true,
                        "info": false,
                        "paging": true,
                        "columnDefs": []
                    });
                    table.cells("td").invalidate().draw();

                    let is_mobile = window.screen.width < 800
                    if (is_mobile) {
                        let table_y = jQuery("#select_portion")[0].getBoundingClientRect().top
                        window.scrollBy({
                            top: table_y,
                            left: 0,
                            behavior: 'smooth'
                        })
                    }
                    
                })
            }
        },
        transfer_in(e) {
            if (this.picked_out == undefined) { return }
            // let out_player = this.team_data.picks.find(i => i.element == this.picked_out)
            let out_player_index = this.team_data.picks.findIndex(i => i.element == this.picked_out)
            // let in_player = elements.find(i => i.id == e)

            this.calculating = true

            this.team_data.picks[out_player_index].element = e
            this.select_out(this.picked_out) // clear selection
            this.swap_out = undefined // clear bench swap

            let is_mobile = window.screen.width < 800

            if (is_mobile) {
                let field_pos = jQuery("#field_portion")[0].getBoundingClientRect().top
                window.scrollBy({
                    top: field_pos,
                    left: 0,
                    behavior: 'smooth'
                })
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

                    this.calculating = true

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
        },
        activate_rep(v) {
            this.active_rep_comp = v
            draw_histogram()
        },
        activate_with_link(e) {
            let sim_no = e.currentTarget.dataset.id
            if (sim_no == undefined) { return }
            let idx = this.grouped_scenarios.findIndex(i => i.sim == sim_no)
            this.active_rep_comp = idx

            draw_histogram()

            this.$nextTick(() => {
                // move to sim
                let por_y = jQuery("#sim_portion")[0].getBoundingClientRect().top
                window.scrollBy({
                    top: por_y,
                    left: 0,
                    behavior: 'smooth'
                    })
            })
            
        },
        saveImage(query, filename) {
            // svg fix
            var svgElements = document.body.querySelectorAll("svg")
            svgElements.forEach(function(item) {
                item.setAttribute("width", item.getBoundingClientRect().width);
                item.setAttribute("height", item.getBoundingClientRect().height);
                item.style.width = null;
                item.style.height= null;
            });
            // download
            html2canvas(document.querySelector(query), {allowTaint: true, logging: true, taintTest: false}).then(function(canvas) {
                saveAs(canvas.toDataURL(), filename);
            });
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

function draw_histogram() {

    if (_.isEmpty(app.scenario_evals)) { return }

    var margin = { top: 15, bottom: 20, left: 10, right: 10 },
            width = 400 - margin.left - margin.right,
            height = 120 - margin.top - margin.bottom

    let is_mobile = window.screen.width < 800

    let font_size = '3pt'
    let title_size = '4.5pt'

    if (is_mobile) {
        height = 160 - margin.top - margin.bottom
        font_size = '6.5pt'
        title_size = '7pt'
    }

    jQuery("#histogram").empty()

    let cnv = d3.select("#histogram")
        .append("svg")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .style('display', 'block')

    let svg = cnv.append('g').attr('class', 'svg-actual').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    let content = svg.append('g').attr('id', 'graph-content')
    let grayrect = content.append('g').attr('class', 'brush');
    grayrect.append('rect')
        .attr('fill', '#5a5d5c')
        .attr('width', width)
        .attr('height', height)
        .attr("stroke", "white")
        .attr("stroke-width", "0.5");

    let data = app.scenario_evals

    data.forEach((value, index) => {
        value.y_val = data.slice(0,index).filter(i => i.total_score == value.total_score).length  
     })

    // Min max values
    let x_high = Math.max(...data.map(i=>i.total_score))+2
    let x_low = Math.min(...data.map(i=>i.total_score))-1
    let x_domain = _.range(x_low, x_high)

    // Axis-x
    var x = d3.scaleBand()
        .domain(x_domain)
        .range([0, width])
        .paddingInner(0.3)
        .paddingOuter(0.1);

    let xAxis = svg.append("g")
        .attr("opacity", 1)
        .attr("transform", `translate(0, ${height})`)
        .call(
            d3.axisBottom(x)
            .tickSize(0)
            .tickValues(x_domain.length > 50 ? x_domain.filter(i => i%5==0) : x_domain)
        )

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 18)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Points");

    // Axis-y
    let y_high = Math.max(...data.map(i => i.y_val+1))+1
    let y_low = 0
    let y_domain = _.range(y_low, y_high)
    var y = d3.scaleBand().domain(y_domain).range([height, 0]).paddingInner(0).paddingOuter(0);
    let yAxis = svg.append('g')
        .attr("transform", "translate(" + width + ",0)")
        .call(d3.axisLeft(y).tickSize(width))
        .call(g => g.selectAll(".tick text"))
        // .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

    svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
        .call(g => g.selectAll(".tick line")
            .attr("stroke-dasharray", "3,1")
            .attr("stroke-width", 0.5)
            .attr("stroke-opacity", 0.1)
            .style('pointer-events', 'none'))
        .call(g => g.selectAll(".domain")
            .attr("opacity", 0))
        
    // Add y axis label:
    svg.append("text")
        .attr("text-anchor", "left")
        .attr("x", -margin.left)
        .attr("y", -5)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Occurrence");

    svg.call(g => g.selectAll(".tick")
            .style("font-size", font_size))
    svg.call(g => g.selectAll(".domain")
            .attr("opacity", 0))

    let ev_title = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", width / 2)
        .attr("y", -8)
        .attr("font-size", title_size)
        .attr("fill", "white")
        .text("Total Point Occurrence")

    // Data plot

    let holder = svg.append('g')

    let clickaction = (d) => {
        app.activate_rep(d.idx)
    }

    let bars = holder.selectAll().data(data)

    let active_rep = app.active_rep
    
    bars.enter().append("rect")
        .attr("class", (d,i) => "occurence-bars" +  (active_rep == i ? " active-occ-bar" : ""))
        // .attr("fill", d => colors(d.player_no))
        // .attr("fill-opacity", 0.5)
        .attr("stroke", "white")
        .attr("stroke-width", 1)
        .attr("x", (d) => x(d.total_score))
        .attr("y", (d) => y(d.y_val))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("cursor", "pointer")
        .on('click', (e,d) => clickaction(d))


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
        console.error("An error has occurred: " + error);
    });
})
