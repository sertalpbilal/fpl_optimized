
var app = new Vue({
    el: '#app',
    data: {
        first_draw: true,
        player_count: 1,
        players: [{
            oid: 0,
            name: 'Player 1',
            position: 3,
            play: 100,
            goal: 40,
            assist: 28,
            cs: 39
        }],
        players_cached: [],
        // player_name: '',
        // player_position: 3,
        // player_play: 100,
        // player_goal: 40,
        // player_assist: 28,
        // player_cs: 39,
        colors: ["#40c8de", "#ff9650", "#97b070"], // goal, assist, cs
        point_rates: {
            1: {'goal': 6, 'assist': 3, 'cs': 4, '2gc': -1},
            2: {'goal': 6, 'assist': 3, 'cs': 4, '2gc': -1},
            3: {'goal': 5, 'assist': 3, 'cs': 1, '2gc': 0},
            4: {'goal': 4, 'assist': 3, 'cs': 0, '2gc': 0},
        },
        expected_points: [0],
        goal_rate: [0],
        assist_rate: [0],
        gc_rate: [0],
        goal_probs: [[]],
        assist_probs: [[]],
        gc_probs: [[]],
        goal_points: [0],
        assist_points: [0],
        cs_points: [0],
        gc_points: [0],
        csgc_points: [0], // Clean sheet + GC
        active_rates: [{}],
        point_probs: [{}],
        graph_updates: {},
        printed_name: {},
        point_combinations: [[]],
        graph_data: [],
        player_colors: d3.scaleOrdinal(d3.schemeTableau10),
        counter: 2,
        comparison: [],
        show_rates: false
        // bet_fraction: undefined,
        // bet_decimal: undefined,
        // bet_american: undefined,
        // bookmaker_margin: 7,
        // bet_implied: undefined
    },
    computed: {
    },
    methods: {
        calculate() {
            // clear existing data
            this.printed_name = {}
            this.goal_rate = {}
            this.assist_rate = {}
            this.gc_rate = {}
            this.goal_probs = {}
            this.assist_probs = {}
            this.gc_probs = {}
            this.active_rates = {}
            this.goal_points = {}
            this.assist_points = {}
            this.cs_points = {}
            this.gc_points = {}
            this.csgc_points = {}
            this.expected_points = {}
            this.point_combinations = []
            this.graph_data = []

            this.players.forEach((p,i) => {
                this.calculate_single(i)
            })
            this.plot_graphs()

            this.comparison = []
            if (this.player_count == 2) {
                this.compare_two()
            }

        },
        calculate_single(idx) {

            let player = this.players[idx]

            if (player.goal >= 100) { player.goal = 99 }
            if (player.goal < 0) { player.goal = 0 }

            if (player.assist >= 100) { player.assist = 99 }
            if (player.assist < 0) { player.assist = 0 }

            if (player.cs > 100) { player.cs = 100 }
            if (player.cs <= 0) { player.cs = 1 }

            let p_n = this.printed_name[idx] = player.name

            // then
            let g_r = this.goal_rate[idx] = this.percentage_to_lambda(player.goal/100)
            let a_r = this.assist_rate[idx] = this.percentage_to_lambda(player.assist/100)
            let gc_r = this.gc_rate[idx] = this.percentage_to_lambda((100-player.cs)/100)

            let g_p = this.goal_probs[idx] = this.get_poisson_probs(g_r)
            let a_p = this.assist_probs[idx] = this.get_poisson_probs(a_r)
            let gc_p = this.gc_probs[idx] = this.get_poisson_probs(gc_r)

            let point_rates = this.point_rates[player.position]
            this.active_rates[idx] = point_rates

            let goal_pts = this.goal_points[idx] = g_r * point_rates['goal']
            let assist_pts = this.assist_points[idx] = a_r * point_rates['assist']
            let cs_pts = this.cs_points[idx] = gc_p[0] * point_rates['cs']
            let gc_pts = this.gc_points[idx] = gc_p.map((v,i) => point_rates['2gc'] * v * Math.floor(i/2)).reduce((a,b) => a+b,0)
            let csgc_pts = this.csgc_points[idx] = cs_pts + gc_pts

            let ep = this.expected_points[idx] = goal_pts + assist_pts + csgc_pts

            let goal_data = _.range(0,11).map(g => { return {'count': g, 'points': point_rates['goal']*g, 'probability': g_p[g] * 100}})
            let assist_data = _.range(0,11).map(g => { return {'count': g, 'points': point_rates['assist']*g, 'probability': a_p[g] * 100}})
            let cs_data = [
                {'count': 'Yes', 'points': point_rates['cs'], 'probability': gc_p[0] * 100},
                {'count': 'No', 'points': 0, 'probability': (1-gc_p[0]) * 100}
            ]
            let gc_data = _.range(0,11).map(g => { return {'count': g, 'points': point_rates['2gc']*(Math.floor(g/2)), 'probability': gc_p[g] * 100}})

            this.graph_data[idx] = {goal_data, assist_data, cs_data, gc_data, ep, p_n}

            // if (this.first_draw) {
            //     this.graph_updates['goal'] = draw_generic({selector: "#goal_prob_graph", title: "Goal Probability vs Count" , x_title: "Goals Scored", y_title: "Probability %", data: goal_data, color: this.colors[0]})
            //     this.graph_updates['assist'] = draw_generic({selector: "#assist_prob_graph", title: "Assist Probability vs Count", x_title: "Assists Made", y_title: "Probability %", data: assist_data, color: this.colors[1]})
            //     this.graph_updates['cs'] = draw_generic({selector: "#cs_prob_graph", title: "Clean Sheet Probability", x_title: "Clean Sheet", y_title: "Probability %", data: cs_data, color: this.colors[2]})
            //     this.graph_updates['gc'] = draw_generic({selector: "#gc_prob_graph", title: "Goals Conceded Probability vs Count", x_title: "Goals Conceded", y_title: "Probability %", data: gc_data, color: this.colors[2]})
            // }
            // else {
            //     this.graph_updates['goal'](goal_data, p_n)
            //     this.graph_updates['assist'](assist_data, p_n)
            //     this.graph_updates['cs'](cs_data, p_n)
            //     this.graph_updates['gc'](gc_data, p_n)
            // }

            let all_combinations = {}
            for (let g of goal_data) {
                for (let a of assist_data) {
                    for (let gc of gc_data) {
                        let entry = {
                            'probability': (g.probability/100)*(a.probability/100)*(gc.probability/100),
                            'points': g.points + a.points + gc.points + (gc.count == 0 ? cs_data[0].points : cs_data[1].points),
                            // 'values': {'goal': g.points, 'assist': a.points, 'gc': gc.points, 'cs': (gc.count == 0 ? cs_data[0].points : cs_data[1].points)}
                        }
                        if (entry.points in all_combinations) {
                            all_combinations[entry.points].probability += entry.probability
                        }
                        else {
                            all_combinations[entry.points] = entry
                        }
                    }
                }
            }
            all_combinations = _.filter(all_combinations, (o) => o.probability > 1e-4)
            all_combinations.forEach(e => {
                e.probability = e.probability*100
            });
            
            // if (this.first_draw) {
            //     this.graph_updates['total'] = draw_ev_graph(all_combinations, ep, p_n)
            // }
            // else {
            //     this.graph_updates['total'](all_combinations, ep, p_n)
            // }

            this.point_combinations[idx] = all_combinations

            this.players_cached = _.cloneDeep(this.players)

            this.$forceUpdate()

        },
        plot_graphs() {

            let idx = 0

            let {goal_data, assist_data, cs_data, gc_data, ep, p_n} = this.graph_data[idx]

            if (this.first_draw) {
                this.graph_updates['goal'] = draw_generic({selector: "#goal_prob_graph", title: "Goal Probability vs Count" , x_title: "Goals Scored", y_title: "Probability %", data: goal_data, color: this.colors[0]})
                this.graph_updates['assist'] = draw_generic({selector: "#assist_prob_graph", title: "Assist Probability vs Count", x_title: "Assists Made", y_title: "Probability %", data: assist_data, color: this.colors[1]})
                this.graph_updates['cs'] = draw_generic({selector: "#cs_prob_graph", title: "Clean Sheet Probability", x_title: "Clean Sheet", y_title: "Probability %", data: cs_data, color: this.colors[2]})
                this.graph_updates['gc'] = draw_generic({selector: "#gc_prob_graph", title: "Goals Conceded Probability vs Count", x_title: "Goals Conceded", y_title: "Probability %", data: gc_data, color: this.colors[2]})
            }
            else {
                this.graph_updates['goal'](goal_data, p_n)
                this.graph_updates['assist'](assist_data, p_n)
                this.graph_updates['cs'](cs_data, p_n)
                this.graph_updates['gc'](gc_data, p_n)
            }

            let all_combinations = this.point_combinations
            let ep_values = this.graph_data.map(i => i.ep)
            let player_names = this.graph_data.map(i => i.p_n)

            if (this.first_draw) {
                this.graph_updates['total'] = draw_ev_graph(all_combinations, ep_values, player_names, this.player_colors)
            }
            else {
                this.graph_updates['total'](all_combinations, ep_values, player_names)
            }

            this.first_draw = false

        },
        percentage_to_lambda(p) {
            // converts P(k>0) info to Poisson lambda
            return -Math.log(1-p)
        },
        lambda_to_percentage(lambda) {
            // converts P(k>0) info to Poisson lambda
            return Math.exp(-lambda)
        },
        get_poisson_probs(lambda, k_max=10) {
            // converts Poisson lambda into probabilities for each k
            let rates = []
            let current_rate = Math.exp(-lambda)
            rates.push(current_rate)
            for (let k=1; k<=k_max; k++) {
                current_rate = current_rate * lambda / k
                rates.push(current_rate)
            }
            return rates
        },
        add_player() {
            this.players.push({
                oid: this.counter,
                name: 'Player ' + this.counter,
                position: 3,
                play: 100,
                goal: 40,
                assist: 28,
                cs: 39
            })
            this.player_count += 1
            this.counter += 1
            this.$forceUpdate()
        },
        remove_player(i) {
            this.players = this.players.filter(j => j.oid != i.oid)
            this.player_count = this.player_count - 1
            this.$forceUpdate()
        },
        compare_two() {
            let p1 = this.point_combinations[0]
            let p2 = this.point_combinations[1]

            let p1_better = 0
            let p2_better = 0
            let players_equal = 0

            p1.forEach(c1 => {
                // p1 better
                let c2 = p2.filter(i => i.points < c1.points)
                p1_better += c2.map(i => i.probability/100 * c1.probability/100).reduce((a,b) => a+b,0)
                // p2 better
                c2 = p2.filter(i => i.points > c1.points)
                p2_better += c2.map(i => i.probability/100 * c1.probability/100).reduce((a,b) => a+b,0)
                // players are equal
                c2 = p2.filter(i => i.points == c1.points)
                players_equal += c2.map(i => i.probability/100 * c1.probability/100).reduce((a,b) => a+b,0)
            })

            this.comparison = {}
            this.comparison = {p1_better, p2_better, players_equal}

            this.$forceUpdate()
        },
        toggle_rate() {
            this.show_rates = !this.show_rates
            this.$nextTick(() => {
                let goal_values = this.players.map(i => this.percentage_to_lambda(i.goal/100))
                jQuery(".goal_rates").each((i,v) => {
                    v.value = parseFloat((goal_values[i]).toFixed(4))
                })
                let assist_values = this.players.map(i => this.percentage_to_lambda(i.assist/100))
                jQuery(".assist_rates").each((i,v) => {
                    v.value = parseFloat((assist_values[i]).toFixed(4))
                })
                let gc_values = this.players.map(i => this.percentage_to_lambda((100-i.cs)/100))
                jQuery(".gc_rates").each((i,v) => {
                    v.value = parseFloat((gc_values[i]).toFixed(4))
                })
            })
        }, 
        // update_bet(type, value) {
        //     if(type == 'bet_fraction') {
        //         if ("/" in value) {
        //             let v = value.split("/")
        //             this.bet_base = parseFloat(v[0]) / parseFloat(v[1])
        //         }
        //     }
        //     else if(type == 'bet_decimal') {
        //         this.bet_base = parseFloat(value)
        //     }
        //     else if(type == 'bet_american') {
        //         if (value < 0) {
        //             this.bet_base = 100/(-value)+1
        //         }
        //         else {
        //             this.bet_base = value/100+1
        //         }
        //     }
        // }
        update_goal(e) {
            let order = e.currentTarget.dataset.order
            let rate = e.currentTarget.value
            let val = this.lambda_to_percentage(rate)
            this.players[order].goal = parseFloat((100-100*val).toFixed(3))
            this.$forceUpdate()
        },
        update_assist(e) {
            let order = e.currentTarget.dataset.order
            let rate = e.currentTarget.value
            let val = this.lambda_to_percentage(rate)
            this.players[order].assist = parseFloat((100-100*val).toFixed(3))
            this.$forceUpdate()
        },
        update_gc(e) {
            let order = e.currentTarget.dataset.order
            let rate = e.currentTarget.value
            let val = this.lambda_to_percentage(rate)
            this.players[order].cs = parseFloat((100*val).toFixed(3))
            this.$forceUpdate()
        }
    }
})

function draw_ev_graph(data, avg_value, player_names, colors) {

    var margin = { top: 15, bottom: 20, left: 20, right: 50 },
            width = 400 - margin.left - margin.right,
            height = 150 - margin.top - margin.bottom

    let is_mobile = window.screen.width < 800

    let font_size = '4pt'
    let title_size = '4.5pt'

    if (is_mobile) {
        height = 180 - margin.top - margin.bottom
        font_size = '6.5pt'
        title_size = '7pt'
    }

    let cnv = d3.select("#ev_graph")
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

    data.forEach((d,i) => {
        d.forEach(j => {
            j.player_no = i
        })
    })

    // Min max values
    let x_high = Math.max(...data.map(i=>i.map(j => j.points)).flat())
    let x_low = Math.min(...data.map(i=>i.map(j => j.points)).flat())
    let x_domain = _.range(x_low, x_high+1)

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
        )

    let players = _.range(data.length)

    var x_sub = d3.scaleBand()
        .domain(players)
        .range([0, x.bandwidth()])
        .paddingInner(0)
        .paddingOuter(0);

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Points");

    // Axis-y
    let y_high = Math.max(Math.max(...data.map(i => i.map(j => j.probability)).flat()) * 1.1, 0.5)
    let y_low = 0
    var y = d3.scaleLinear().domain([y_low, y_high]).range([height, 0]);
    let yAxis = svg.append('g')
        .attr("transform", "translate(" + width + ",0)")
        .call(d3.axisLeft(y).tickSize(width))
        .call(g => g.selectAll(".tick text"))
        .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

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
        .text("Probability %");

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
        .text("Point Probability Distribution") // + (name != '' ? ` (${name})` : ''));

    // Data plot

    let holder = svg.append('g')

    let flat_data = data.flat()

    let bars = holder.selectAll()
        .data(flat_data)
    // let points = holder.selectAll().data(data)
    
    let bar_entries = bars.enter().append("rect")
    bar_entries
        .attr("class", "probability-bars")
        .attr("fill", d => colors(d.player_no))
        // .attr("fill-opacity", 0.5)
        .attr("stroke", "white")
        .attr("stroke-width", 0.5)
        .attr("x", (d) => x(d.points) + x_sub(d.player_no))
        .attr("y", (d) => y(d.probability))
        .attr("width", x_sub.bandwidth())
        .attr("height", (d) => y(0)-y(d.probability))


    let avg_grp = svg.append('g').selectAll('.avg_lines').data(avg_value).enter()
    let together = avg_grp.append('g').attr('class', 'avg_lines')
    let avg_place = e => x(Math.floor(e)) + x.step()*(e-Math.floor(e)) + x.bandwidth()/2
    let avg_line = together.append('line')
            .attr("x1", d => avg_place(d))
            .attr("x2", d => avg_place(d))
            .attr("y1", y(y_high))
            .attr("y2", y(y_low))
            .attr("stroke", "white")
    let avg_text = together.append('text')
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "baseline")
        .attr("dominant-baseline", "baseline")
        .attr("x", d => avg_place(d))
        .attr("y", -1)
        .attr("font-size", title_size)
        .attr("fill", (d,i) => colors(i))
        .text(d => d.toFixed(2));

    let legend = svg.append('g')
            .attr("transform", "translate(" + (width+5) + ',0)')
    let legend_box = legend.append('rect')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', 40)
            .attr('height', 7*(player_names.length+0.5))
            .attr("fill", "#5a5d5c")
            .attr("stroke", "white")
            .attr("stroke-width", 0.5)
    let  legend_entry = legend.selectAll().data(player_names).enter().append('g')
    legend_entry.append("rect")
            .attr("class", "legend-rect")
            .attr('x', 2)
            .attr('y', (d,i) => 3.5 + 7 * i)
            .attr('width', 10)
            .attr('height', 3)
            .attr('fill', (d,i) => colors(i))
            .attr('stroke', 'white')
            .attr('stroke-width', 0.5)
    legend_entry.append('text')
        .attr("class", "legend-text")
        .attr("text-anchor", "start")
        .attr("alignment-baseline", "middle")
        .attr("dominant-baseline", "middle")
        .attr("x", 14)
        .attr("y", (d,i) => 2 + 7*i + 3)
        .attr("font-size", "4pt")
        .attr("fill", "white")
        .text(d => d)


    let update_func = (new_data, new_avg, new_names) => {

        new_data.forEach((d,i) => {
            d.forEach(j => {
                j.player_no = i
            })
        })

        let new_x_high = Math.max(...new_data.map(i=>i.map(j => j.points)).flat())
        let new_x_low = Math.min(...new_data.map(i=>i.map(j => j.points)).flat())
        let new_x_domain = _.range(new_x_low, new_x_high+1)

        // ev_title.text("Point Probability Distribution")

        legend_box
            .attr('height', 7*(new_names.length+0.5))
        let new_legend_rect = legend.selectAll(".legend-rect").data(new_names)
        new_legend_rect.exit().remove()
        new_legend_rect.enter().append("rect")
            .attr("class", "legend-rect")
            .attr('x', 2)
            .attr('y', (d,i) => 3.5 + 7 * i)
            .attr('width', 10)
            .attr('height', 3)
            .attr('fill', (d,i) => colors(i))
            .attr('stroke', 'white')
            .attr('stroke-width', 0.5)
        let new_legend_text = legend.selectAll(".legend-text").data(new_names)
        new_legend_text.exit().remove()
        new_legend_text
            .attr("x", 14)
            .attr("y", (d,i) => 2 + 7*i + 3)
            .text(d => d)
        new_legend_text.enter().append('text')
            .attr("class", "legend-text")
            .attr("text-anchor", "start")
            .attr("alignment-baseline", "middle")
            .attr("dominant-baseline", "middle")
            .attr("x", 14)
            .attr("y", (d,i) => 2 + 7*i + 3)
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text(d => d)

        x.domain(new_x_domain)
        xAxis.transition().duration(1000)
            .call(d3.axisBottom(x).tickSize(0))

        let new_y_high = Math.max(Math.max(...new_data.map(i => i.map(j => j.probability)).flat()) * 1.1, 0.5)
        y.domain([0, new_y_high])
        yAxis.transition().duration(1000)
            .call(d3.axisLeft(y).tickSize(width))
            .call(g => g.selectAll(".tick text"))
            .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));


        let new_players = _.range(new_data.length)

        x_sub.domain(new_players)
            .range([0, x.bandwidth()])
            .paddingInner(0)
            .paddingOuter(0);

            // bar_entries
            // .data(new_data)
            // .transition().duration(1000)
            // .attr('y', (d) => y(d.probability))
            // .attr("height", (d) => y(0)-y(d.probability))

            // bar_entries.remove()

        let flat_new_data = new_data.flat()

        let new_bars = svg.selectAll(".probability-bars").data(flat_new_data)
        new_bars.exit().remove()

        new_bars.transition().duration(1000)
            .attr("fill", d => colors(d.player_no))
            .attr("x", (d) => x(d.points) + x_sub(d.player_no))
            .attr("y", (d) => y(d.probability))
            .attr("width", x_sub.bandwidth())
            .attr("height", (d) => y(0)-y(d.probability))

        new_bars.enter().append("rect")
            .attr("x", (d) => x(d.points) + x_sub(d.player_no))
            .attr("y", (d) => y(d.probability))
            .attr("width", x_sub.bandwidth())
            .attr("height", (d) => y(0)-y(d.probability))
            .attr("class", "probability-bars")
            .attr("fill", d => colors(d.player_no))
            .attr("stroke", "white")
            .attr("stroke-width", 0.5)

            // .attr("fill", "#f4afff")
            
        
        

        // AXIS UPDATE

        svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
            .call(g => g.selectAll(".tick line")
                .attr("stroke-dasharray", "3,1")
                .attr("stroke-width", 0.5)
                .attr("stroke-opacity", 0.1)
                .style('pointer-events', 'none'))
            .call(g => g.selectAll(".domain")
                .attr("opacity", 0))

        svg.call(g => g.selectAll(".tick")
            .style("font-size", font_size))
        svg.call(g => g.selectAll(".domain")
            .attr("opacity", 0))

        let new_avg_grp = svg.selectAll('.avg_lines').data(new_avg)
        let new_avg_place = e => x(Math.floor(e)) + x.step()*(e-Math.floor(e)) + x.bandwidth()/2
        new_avg_grp.exit().remove()
        new_avg_grp.transition().duration(1000)
            .select('line')
            .attr("x1", d => new_avg_place(d))
            .attr("x2", d => new_avg_place(d))
            .attr("y1", y(new_y_high))
            .attr("y2", y(0))
            .attr("stroke", "white")
        new_avg_grp.transition().duration(1000).select('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "baseline")
            .attr("dominant-baseline", "baseline")
            .attr("x", d => new_avg_place(d))
            .attr("y", -1)
            .attr("font-size", title_size)
            .attr("fill", (d,i) => colors(i))
            .text(d => d.toFixed(2));
        let new_together = new_avg_grp.enter().append('g').attr('class', 'avg_lines')
        new_together.append('line')
            .attr("x1", d => new_avg_place(d))
            .attr("x2", d => new_avg_place(d))
            .attr("y1", y(new_y_high))
            .attr("y2", y(0))
            .attr("stroke", "white")
        new_together.append('text')
            .attr("text-anchor", "middle")
            .attr("alignment-baseline", "baseline")
            .attr("dominant-baseline", "baseline")
            .attr("x", d => new_avg_place(d))
            .attr("y", -1)
            .attr("font-size", title_size)
            .attr("fill", (d,i) => colors(i))
            .text(d => d.toFixed(2));
        

        // let new_avg_place = x(Math.floor(new_avg)) + x.step()*(new_avg-Math.floor(new_avg)) + x.bandwidth()/2
        // avg_line.transition().duration(1000)
        //     .attr("x1", new_avg_place)
        //     .attr("x2", new_avg_place)
        //     .attr("y1", y(new_y_high))
        //     .attr("y2", y(0))
        // avg_text.transition().duration(1000)
        // .attr("x", new_avg_place)
        // .text(new_avg.toFixed(2));

    }
    return update_func



}

function draw_generic({selector, title, x_title, y_title, data, color} = {}) {
    
    var margin = { top: 20, bottom: 20, left: 20, right: 10 },
            width = 400 - margin.left - margin.right,
            height = 150 - margin.top - margin.bottom

    let is_mobile = window.screen.width < 800

    let font_size = '4pt'
    let title_size = '4.5pt'

    if (is_mobile) {
        height = 180 - margin.top - margin.bottom
        font_size = '6.5pt'
        title_size = '7pt'
    }

    jQuery(selector).empty()

    let cnv = d3.select(selector)
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

    
    // Min max values
    let x_domain = data.map(i => i.count)

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
        )

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text(x_title);

    // Axis-y
    let y_high = Math.max(Math.max(...data.map(i => i.probability)) * 1.1, 0.5)
    let y_low = 0
    var y = d3.scaleLinear().domain([y_low, y_high]).range([height, 0]);
    let yAxis = svg.append('g')
        .attr("transform", "translate(" + width + ",0)")
        .call(d3.axisLeft(y).tickSize(width))
        .call(g => g.selectAll(".tick text"))
        .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

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
        .text(y_title);

    svg.call(g => g.selectAll(".tick")
            .style("font-size", font_size))
    svg.call(g => g.selectAll(".domain")
            .attr("opacity", 0))

    let plot_title = svg.append("text")
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "center")
        .attr("dominant-baseline", "center")
        .attr("x", width / 2)
        .attr("y", -8)
        .attr("font-size", title_size)
        .attr("fill", "white")
        .text(title);

    let holder = svg.append('g')

    let bars = holder.selectAll().data(data)
    let points = holder.selectAll().data(data)
    
    let bar_entries = bars.enter().append("rect")
    bar_entries
        .attr("class", "probability-bars")
        .attr("fill", color)
        .attr("x", (d) => x(d.count))
        .attr("y", (d) => y(d.probability))
        .attr("width", x.bandwidth())
        .attr("height", (d) => y(0)-y(d.probability))

    let point_entries = points.enter().append("text")
    point_entries
        .text((d) => d.points + " Pts")
        .attr("class", "prob-bar-values")
        .attr("x", (d) => x(d.count) + x.bandwidth()/2)
        .attr("text-anchor", "middle")
        .attr("y", (d) => y(d.probability) - 2)
        .attr("alignment-baseline", "baseline")
        .attr("dominant-baseline", "baseline")
        .attr("font-size", font_size)
        .attr("fill", "white")


    let update_func = (new_data, new_name) => {

        let new_y_high = Math.max(Math.max(...new_data.map(i => i.probability)) * 1.1, 0.5)
        y.domain([0, new_y_high])
        yAxis.transition().duration(1000)
            .call(d3.axisLeft(y).tickSize(width))
            .call(g => g.selectAll(".tick text"))
            .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

        plot_title.text(title + (new_name != '' ? ` (${new_name})` : ''))

        bar_entries
            .data(new_data)
            .transition().duration(1000)
            .attr('y', (d) => y(d.probability))
            .attr("height", (d) => y(0)-y(d.probability))

        point_entries
            .data(new_data)
            .transition().duration(1000)
            .text((d) => d.points + " Pts")
            .attr("y", (d) => y(d.probability) - 2)

        // AXIS UPDATE

        svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
            .call(g => g.selectAll(".tick line")
                .attr("stroke-dasharray", "3,1")
                .attr("stroke-width", 0.5)
                .attr("stroke-opacity", 0.1)
                .style('pointer-events', 'none'))
            .call(g => g.selectAll(".domain")
                .attr("opacity", 0))

        svg.call(g => g.selectAll(".tick")
            .style("font-size", font_size))
        svg.call(g => g.selectAll(".domain")
            .attr("opacity", 0))
    }
    return update_func

}



$(document).ready(() => {
    app.calculate() // initial load
})
