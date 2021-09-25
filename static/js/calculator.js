
var app = new Vue({
    el: '#app',
    data: {
        first_draw: true,
        player_name: '',
        player_position: 3,
        player_play: 100,
        player_goal: 40,
        player_assist: 28,
        player_cs: 39,
        colors: ["#40c8de", "#ff9650", "#97b070"], // goal, assist, cs
        point_rates: {
            1: {'goal': 6, 'assist': 3, 'cs': 4, '2gc': -1},
            2: {'goal': 6, 'assist': 3, 'cs': 4, '2gc': -1},
            3: {'goal': 5, 'assist': 3, 'cs': 1, '2gc': 0},
            4: {'goal': 4, 'assist': 3, 'cs': 0, '2gc': 0},
        },
        expected_points: 0,
        goal_rate: 0,
        assist_rate: 0,
        gc_rate: 0,
        goal_probs: [],
        assist_probs: [],
        gc_probs: [],
        goal_points: 0,
        assist_points: 0,
        cs_points: 0,
        gc_points: 0,
        csgc_points: 0, // Clean sheet + GC
        active_rates: {},
        point_probs: {},
        graph_updates: {},
        printed_name: '',
        point_combinations: []
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
            if (this.player_goal >= 100) { this.player_goal = 99 }
            if (this.player_goal < 0) { this.player_goal = 0 }

            if (this.player_assist >= 100) { this.player_assist = 99 }
            if (this.player_assist < 0) { this.player_assist = 0 }

            if (this.player_cs > 100) { this.player_cs = 100 }
            if (this.player_cs <= 0) { this.player_cs = 1 }

            this.printed_name = this.player_name

            // then
            this.goal_rate = this.percentage_to_lambda(this.player_goal/100)
            this.assist_rate = this.percentage_to_lambda(this.player_assist/100)
            this.gc_rate = this.percentage_to_lambda((100-this.player_cs)/100)

            this.goal_probs = this.get_poisson_probs(this.goal_rate)
            this.assist_probs = this.get_poisson_probs(this.assist_rate)
            this.gc_probs = this.get_poisson_probs(this.gc_rate)

            let point_rates = this.point_rates[this.player_position]
            this.active_rates = point_rates

            this.goal_points = this.goal_rate * point_rates['goal']
            this.assist_points = this.assist_rate * point_rates['assist']
            this.cs_points = this.gc_probs[0] * point_rates['cs']
            this.gc_points = this.gc_probs.map((v,i) => point_rates['2gc'] * v * Math.floor(i/2)).reduce((a,b) => a+b,0)
            this.csgc_points = this.cs_points + this.gc_points

            this.expected_points = this.goal_points + this.assist_points + this.csgc_points

            let goal_data = _.range(0,11).map(g => { return {'count': g, 'points': point_rates['goal']*g, 'probability': this.goal_probs[g] * 100}})
            let assist_data = _.range(0,11).map(g => { return {'count': g, 'points': point_rates['assist']*g, 'probability': this.assist_probs[g] * 100}})
            let cs_data = [
                {'count': 'Yes', 'points': point_rates['cs'], 'probability': this.gc_probs[0] * 100},
                {'count': 'No', 'points': 0, 'probability': (1-this.gc_probs[0]) * 100}
            ]
            let gc_data = _.range(0,11).map(g => { return {'count': g, 'points': point_rates['2gc']*(Math.floor(g/2)), 'probability': this.gc_probs[g] * 100}})

            if (this.first_draw) {
                this.graph_updates['goal'] = draw_generic({selector: "#goal_prob_graph", title: "Goal Probability vs Count" , x_title: "Goals Scored", y_title: "Probability %", data: goal_data, color: this.colors[0]})
                this.graph_updates['assist'] = draw_generic({selector: "#assist_prob_graph", title: "Assist Probability vs Count", x_title: "Assists Made", y_title: "Probability %", data: assist_data, color: this.colors[1]})
                this.graph_updates['cs'] = draw_generic({selector: "#cs_prob_graph", title: "Clean Sheet Probability", x_title: "Clean Sheet", y_title: "Probability %", data: cs_data, color: this.colors[2]})
                this.graph_updates['gc'] = draw_generic({selector: "#gc_prob_graph", title: "Goals Conceded Probability vs Count", x_title: "Goals Conceded", y_title: "Probability %", data: gc_data, color: this.colors[2]})

                
            }
            else {
                this.graph_updates['goal'](goal_data, this.printed_name)
                this.graph_updates['assist'](assist_data, this.printed_name)
                this.graph_updates['cs'](cs_data, this.printed_name)
                this.graph_updates['gc'](gc_data, this.printed_name)
            }

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
            
            if (this.first_draw) {
                this.graph_updates['total'] = draw_ev_graph(all_combinations, this.expected_points, this.printed_name)
            }
            else {
                this.graph_updates['total'](all_combinations, this.expected_points, this.printed_name)
            }

            this.point_combinations = all_combinations

            this.first_draw = false

        },
        percentage_to_lambda(p) {
            // converts P(k>0) info to Poisson lambda
            return -Math.log(1-p)
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
    }
})

function draw_ev_graph(data, avg_value, name) {

    

    var margin = { top: 15, bottom: 20, left: 20, right: 10 },
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

    
    // Min max values
    let x_high = Math.max(...data.map(i=>i.points))
    let x_low = Math.min(...data.map(i=>i.points))
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

    // Add X axis label:
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 20)
        .attr("font-size", font_size)
        .attr("fill", "white")
        .text("Points");

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
        .text("Point Probability Distribution" + (name != '' ? ` (${name})` : ''));

    let holder = svg.append('g')

    let bars = holder.selectAll().data(data)
    // let points = holder.selectAll().data(data)
    
    let bar_entries = bars.enter().append("rect")
    bar_entries
        .attr("class", "probability-bars")
        .attr("fill", "white")
        .attr("x", (d) => x(d.points))
        .attr("y", (d) => y(d.probability))
        .attr("width", x.bandwidth())
        .attr("height", (d) => y(0)-y(d.probability))

    let avg_grp = svg.append('g')
    let avg_place = x(Math.floor(avg_value)) + x.step()*(avg_value-Math.floor(avg_value)) + x.bandwidth()/2
    let avg_line = avg_grp.append('line')
            .attr("x1", avg_place)
            .attr("x2", avg_place)
            .attr("y1", y(y_high))
            .attr("y2", y(y_low))
            .attr("stroke", "#ffe400")
    let avg_text = avg_grp.append('text')
        .attr("text-anchor", "middle")
        .attr("alignment-baseline", "baseline")
        .attr("dominant-baseline", "baseline")
        .attr("x", avg_place)
        .attr("y", -1)
        .attr("font-size", title_size)
        .attr("fill", "#ffe400")
        .text(avg_value.toFixed(2));

    let update_func = (new_data, new_avg, new_name) => {

        let new_x_high = Math.max(...new_data.map(i=>i.points))
        let new_x_low = Math.min(...new_data.map(i=>i.points))
        let new_x_domain = _.range(new_x_low, new_x_high+1)

        ev_title.text("Point Probability Distribution" + (new_name != '' ? ` (${new_name})` : ''));

        x.domain(new_x_domain)
        xAxis.transition().duration(1000)
            .call(d3.axisBottom(x).tickSize(0))

        let new_y_high = Math.max(Math.max(...new_data.map(i => i.probability)) * 1.1, 0.5)
        y.domain([0, new_y_high])
        yAxis.transition().duration(1000)
            .call(d3.axisLeft(y).tickSize(width))
            .call(g => g.selectAll(".tick text"))
            .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"));

            // bar_entries
            // .data(new_data)
            // .transition().duration(1000)
            // .attr('y', (d) => y(d.probability))
            // .attr("height", (d) => y(0)-y(d.probability))

            // bar_entries.remove()

        let new_bars = holder.selectAll("rect").data(new_data)
        new_bars.exit().remove()
        new_bars.enter().append("rect")
            .attr("x", (d) => x(d.points))
            .attr("y", (d) => y(d.probability))
            .attr("width", x.bandwidth())
            .attr("height", (d) => y(0)-y(d.probability))
            .attr("class", "probability-bars")
            .attr("fill", "white")

            // .attr("fill", "#f4afff")
            
        
        new_bars.transition().duration(1000)
            .attr("x", (d) => x(d.points))
            .attr('y', (d) => y(d.probability))
            .attr("width", x.bandwidth())
            .attr("height", (d) => y(0)-y(d.probability))

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

        let new_avg_place = x(Math.floor(new_avg)) + x.step()*(new_avg-Math.floor(new_avg)) + x.bandwidth()/2
        avg_line.transition().duration(1000)
            .attr("x1", new_avg_place)
            .attr("x2", new_avg_place)
            .attr("y1", y(new_y_high))
            .attr("y2", y(0))
        avg_text.transition().duration(1000)
        .attr("x", new_avg_place)
        .text(new_avg.toFixed(2));

    }
    return update_func



}

function draw_generic({selector, title, x_title, y_title, data, color} = {}) {
    
    var margin = { top: 15, bottom: 20, left: 20, right: 10 },
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
