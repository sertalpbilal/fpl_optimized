var app = new Vue({
    el: '#app',
    data: {
        this_gw: gw,
        is_active: is_active,
        fpl_id: undefined,
        fpl_history: undefined,
        fpl_average: undefined,
        range: 3,
        base: 0.45,
        gifstyle: "spongebob"
    },
    computed: {
        is_ready() {
            return this.fpl_id !== undefined && this.fpl_history !== undefined
        },
        manager_ratings() {
            if (!this.is_ready) { return undefined; }
            const range = this.range
            const keys = this.fpl_history.current.map(i => i.event).slice(-range)
            const manager_values = Object.fromEntries(this.fpl_history.current.map(i => [i.event, i.points]))
            const average_values = this.fpl_average
            const ratios = []
            const mults = []
            const last_gw = Math.max(...keys)
            let score = 0;
            let divider = 0;
            keys.forEach(week => {
                let multiplier = Math.pow(this.base, last_gw - week)
                let manager_ratio = Math.min(1, manager_values[week] / (2*average_values[week]))
                score = score + multiplier * manager_ratio
                divider = divider + multiplier
                mults.push(multiplier)
                ratios.push(manager_ratio)
            })
            const forecast = score/divider;
            return {ratios, forecast, keys, manager_values, average_values, mults};
        },
        final_tier() {
            return Math.floor(this.manager_ratings.forecast * 5) + 1
        },
        tier_text() {
            let text = {
                1: "Terrible Form",
                2: "Unlucky Form",
                3: "Casual Form",
                4: "Good Form",
                5: "Great Form - Ready to attack GW!"
            }
            return text[this.final_tier]
        }
    },
    methods: {
        enterTeam() {
            let el = document.querySelector("#teamID_input")
            if (el.value.length == 0) { return }
            this.fpl_history = undefined
            this.fpl_id = parseInt(el.value)
            el.value = ""
            fetch_fpl_history()
        },
        submitTeam(e) {
            if (e.keyCode === 13) {
                this.enterTeam()
            }
        },
        openParamModal() {
            $("#paramModal").modal('show')
        },
        refresh_graph() {
            draw_ratings()
        }
    }
});

async function fetch_fpl_history() {
    return get_team_history(app.fpl_id).then((data) => {
        app.fpl_history = data;
        app.$nextTick(() => {
            draw_ratings()
        })
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_fpl_averages() {
    return get_fpl_main_data().then((data) => {
        app.fpl_average = Object.fromEntries(data.events.filter(i  => i.average_entry_score > 0).map(i => [i.id, i.average_entry_score]))
    }).catch((e) => {
        console.log("Error", e)
    })
}



async function draw_ratings() {
    
    let c = document.querySelector("#canvas")
    c.innerHTML = ""

    var margin = { top: 5, right: 35, bottom: 20, left: 35 },
        width = 250 - margin.left - margin.right,
        height = 180 - margin.top - margin.bottom;

    let cnv = d3.select("#canvas")
        .append("svg")
        .attr("id", "canvas-graph")
        .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
        .attr('class', 'pull-center')
        .style('display', 'block')
        .style('padding-bottom', '10px');

    let svg = cnv.append('g').attr('class', 'svg-actual').attr('transform', 'translate(43,4)');
    let grayrect = svg.append('g');
    grayrect.append('rect').attr('fill', '#5a5d5c').attr('width', width).attr('height', height);

    data = app.manager_ratings

    let x_low = Math.min(...data.keys)-0.5
    let x_high = Math.max(...data.keys)+1+0.5

    let y_high = 1
    let y_low = 0

    // Axis-x
    var x = d3.scaleLinear().domain([x_low, x_high]).range([0, width]);
    svg.append('g')
        .call(
            d3.axisBottom(x).ticks(data.keys.length + 1)
            .tickSize(height)
        );

    var y = d3.scaleLinear().domain([y_low, y_high]).range([height, 0]);
    svg.append('g').attr("transform", "translate(" + width + ",0)").call(d3.axisLeft(y).tickSize(width).tickFormat((d) => d*100 + '%'));

    svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white"))
        .call(g => g.selectAll(".tick line")
            .attr("stroke-dasharray", "4,2")
            .attr("stroke", "#f1f1f1")
            .attr("stroke-width", 0.5)
            .attr("opacity", 0.1)
            .style('pointer-events', 'none'))
        .call(g => g.selectAll(".domain")
            .attr("opacity", 0));

    // Title - x
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("x", width / 2)
        .attr("y", height + 17)
        .attr("font-size", "4pt")
        .attr("fill", "white")
        .text("GW");

    // Title - y1
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(-90)")
        .attr("x", -height / 2)
        .attr("y", -20)
        .attr("font-size", "5pt")
        .attr("fill", "white")
        .text("Performance");

    svg.call(s => s.selectAll(".tick").attr("font-size", "4pt"));

    svg.append('path')
        .datum(data.ratios)
        .attr("fill", "none")
        .attr("stroke", "#3BB9E2")
        .attr("stroke-opacity", 1)
        .attr("stroke-width", 1)
        .style('pointer-events', 'none')
        .attr("d", d3.line()
            .x((d,i) => x(data.keys[i]))
            .y((d) => y(d))
        );

    const forecast_rates = data.ratios.slice(-1).concat(data.forecast)
    const next_gw = parseInt(data.keys.slice(-1))+1
    const forecast_gw = data.keys.slice(-1).concat(next_gw)

    svg.append('path')
        .datum(forecast_rates)
        .attr("fill", "none")
        .attr("stroke", "#A6CE51")
        .attr("stroke-opacity", 0.8)
        .style("stroke-dasharray", "5,1")
        .attr("stroke-width", 1)
        .style('pointer-events', 'none')
        .attr("d", d3.line()
            .x((d,i) => x(forecast_gw[i]))
            .y((d) => y(d))
        );

    // scatter
    svg.selectAll()
       .data(data.ratios)
       .enter()
       .append('circle')
       .attr('r', 3)
       .attr('cx', (d,i) => x(data.keys[i]))
       .attr('cy', (d) => y(d))
       .attr('fill', '#3BB9E2')
    
    svg.selectAll()
       .data([data.forecast])
       .enter()
       .append('circle')
       .attr('r', 3)
       .attr('cx', (d) => x(next_gw))
       .attr('cy', (d) => y(d))
       .attr('fill', '#A6CE51')
       .attr('opacity', 1)


    // svg.selectAll()
    //    .data(data.ratios)
    //    .enter()
    //    .append('rect')
    //    .attr('width', 20)
    //    .attr('height', 10)
    //    .attr('x', (d,i) => x(data.keys[i])-10)
    //    .attr('y', (d) => y(d) + 5)
    //    .attr('fill', 'black')
    //    .attr('opacity', 0.3)

    // svg.selectAll()
    //    .data(data.ratios)
    //    .enter()
    //    .append('text')
    //    .attr("text-anchor", "middle")
    //    .attr("alignment-baseline", "middle")
    //    .attr('x', (d,i) => x(data.keys[i]))
    //    .attr('y', (d) => y(d) + 10)
    //    .attr("font-size", "4pt")
    //    .attr("fill", "white")
    //    .text((d, i) => d);


}



$(document).ready(() => {
    Promise.all([
        fetch_fpl_averages()
    ]).then((values) => {
        app.$nextTick(() => {
            console.log('READY!')
        })
    })
    .catch((error) => {
        console.error("An error has occured: " + error);
    });
})