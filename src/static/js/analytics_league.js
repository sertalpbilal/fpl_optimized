
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
        rp_by_id: {},
        //
        selected_team: undefined,
        //
        processed_league_data_cached: [],
        processed_league_data_cached_last_sort: undefined,
        highlight_circle: undefined,
        all_data_ready: false,
        season_vals: season_vals,
        chip_short: {'wildcard': 'WC', 'freehit': 'FH', 'bboost': 'BB', '3xc': 'TC'},
        season_data_for_gw_cached: [],
        season_data_for_gw_cached_last_sort: undefined
    },
    computed: {
        this_gw_dynamic() {
            if (this.gw !== undefined || _.isEmpty(this.static_data) || !this.all_data_ready) { return parseInt(this.gw.slice(2)) }
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
            if (_.isEmpty(this.static_data)) { return []}
            return this.static_data['elements']
        },
        el_data_by_id() {
            if (_.isEmpty(this.static_data)) { return []}
            return Object.fromEntries((this.static_data['elements']).map(i => [i.id, i]))
        },
        xp_by_id() {
            let xp_data = this.xp_data.map(i => [i.player_id, {xp: i.points_md, xmin: i.xmins_md}])
            return Object.fromEntries(xp_data)
        },
        processed_league_data() {
            if (_.isEmpty(this.league_data) || _.isEmpty(this.el_data_by_id) || _.isEmpty(this.xp_data) || _.isEmpty(this.rp_data) || _.isEmpty(this.rp_by_id) || !this.all_data_ready) { return []}

            let t = this.league_data
            t = t.filter(i => i[1] != null)
            t.forEach((t) => {
                t.info = {}
                let picks = t[1].picks
                let penalty = t[1].entry_history.event_transfers_cost


                let pre_xp = getSum(picks.map(i => i.multiplier * (parseFloat(this.xp_by_id[i.element].xp) || 0) )) - parseInt(penalty)
                let post_gw_picks = autosubbed_team(picks, this.autosub_dict).team
                let post_xp = getSum(post_gw_picks.map(i => i.multiplier * (parseFloat(this.xp_by_id[i.element].xp) || 0) )) - parseInt(penalty)
                let rp = getSum(post_gw_picks.map(i => i.multiplier * (parseFloat((this.rp_by_id[i.element] && this.rp_by_id[i.element].stats.total_points) || 0) || 0))) - parseInt(penalty)
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

            this.processed_league_data_cached = t

            return t
        },
        team_list() {
            if (_.isEmpty(this.processed_league_data)) { return []}
            let teams = this.processed_league_data.map(i => { return {'entry': i[0].entry, 'entry_name': i[0].entry_name, 'player_name': i[0].player_name}})
            return teams
        },
        team_list_sorted_entry_name() {
            return _.orderBy(this.team_list, ['entry_name'], 'asc')
        },
        team_list_sorted_player_name() {
            return _.orderBy(this.team_list, ['player_name'], 'asc')
        },
        selected_entry_ref() {
            if (_.isEmpty(this.processed_league_data_cached)) { return {}}
            if (!this.selected_team) {return {}}
            return this.processed_league_data_cached.find(i => i[0].entry == this.selected_team)
        },
        season_data_for_gw() {
            let v = this.season_vals
            v = v.filter(i => i.gw == this.active_gw)
            v = _.orderBy(v, ['obj_sum'], ['desc'])
            v.forEach((p, index) => {
                p.rank = index+1
                p.total_gw = this.season_vals.filter(i => i.entry == p.entry).length
                p.chip_count = p.chip_sum == '' ? 0 : p.chip_sum.split(' ').length
                p.obj_per_gw = p.total_gw <= 1 ? 0 : p.obj_sum / p.total_gw
                p.chip_sep = p.chip_sum.split(" ")
                p.chip_no = p.chip_gws.split(" ")
                if (p.chip_sep == undefined) {
                    p.chip_sep = []
                }
            })
            this.season_data_for_gw_cached = Object.freeze(v)
            return v
        }
    },
    methods: {
        active_gw_update(val) {
            
            // $("#league_table").DataTable().destroy()
            this.league_data = []
            jQuery("#xp_vs_rp").empty()

            this.active_gw = this.active_gw + parseInt(val)

            let cgw = this.active_gw
            let gw_s = "GW" + cgw

            this.static_data = undefined
            this.league_data = []
            this.fixture_data = []
            this.rp_data = []
            this.xp_data =[]

            let entry = listdates.find(i => i.includes(" " + gw_s + " "))
            let vals = entry.split(" / ")

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
                getXPData_Fernet({season: vals[0], gw: vals[1], date: vals[2].replace(" ", "")}).then((data) => {
                    app.xp_data = data
                })
            ]).then(() => {
                
                app.rp_by_id = rp_by_id_dict(app.fixture_data, app.rp_data)
                app.autosub_dict = generate_autosub_dict(app.el_data, app.rp_by_id)
        
                app.all_data_ready = true

                app.$nextTick(() => {
                    draw_xp_vs_rp()
                    app.refresh_table()
                })
            })

        },
        refresh_table() {

        },
        sortData(e) {
            let tag = e.currentTarget.dataset.tag
            let source = jQuery(e.currentTarget).closest('table').data('source')
            let last_sort = this[source + "_last_sort"]
            let new_order
            let new_value
            if (tag == last_sort){
                new_order = _.orderBy(this[source], tag, 'desc')
                new_value = undefined
            }
            else {
                new_order = _.orderBy(this[source], tag, 'asc')
                new_value = tag
            }
            this[source] = new_order
            this[source + "_last_sort"]  = new_value 
        },
        selectTeam(e) {
            debugger
        }
    }
});


function draw_xp_vs_rp() {

    return new Promise((resolve, reject) => {

        if (_.isEmpty(app.processed_league_data)) { resolve("Not ready"); }

        var margin = { top: 20, bottom: 20, left: 20, right: 10 },
            width = 400 - margin.left - margin.right,
            height = 240 - margin.top - margin.bottom

        jQuery("#xp_vs_rp").empty()

        let cnv = d3.select("#xp_vs_rp")
            .append("svg")
            .attr("id", "xp_vs_rp_svg")
            .attr("viewBox", `0 0  ${(width + margin.left + margin.right)} ${(height + margin.top + margin.bottom)}`)
            .style('display', 'block')
            .style('min-width', '300px')

        cnv.append("defs").append("SVG:clipPath")
            .attr("id", "clip1")
            .append("SVG:rect")
            .attr("width", width )
            .attr("height", height )
            .attr("x", 0)
            .attr("y", 0);

        let svg = cnv.append('g').attr('class', 'svg-actual').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
        let content = svg.append('g').attr('clip-path', 'url(#clip1)')
        let grayrect = content.append('g').attr('class', 'brush');
        grayrect.append('rect').attr('fill', '#5a5d5c').attr('width', width).attr('height', height).attr("stroke", "white").attr("stroke-width", "0.5");

        let data = app.processed_league_data

        
        // Min max values
        let x_high = Math.max(...data.map(i => i.info.post_xp)) * 1.1
        let x_low = 0.5

        // Axis-x
        var x = d3.scaleLinear()
            .domain([x_low, x_high])
            .range([0, width]);
        let xAxis = svg.append("g")
            .attr("opacity", 1)
            .call(d3.axisBottom(x)
                .tickSize(height)
            )
            .call(g => g.selectAll(".tick line")
                .attr("stroke-opacity", 0.1)
                .attr("stroke-width", 0.5)
                .attr("stroke-dasharray", "3,1")
                .style('pointer-events', 'none')
                )
            // .call(g => g.selectAll(".tick text").attr("dy", 11)
            // );

        // Add X axis label:
        svg.append("text")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height + 15)
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text("Expected/Projected Points");

        // Axis-y
        let y_high = Math.max(...data.map(i => i.info.rp)) * 1.1
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
            .attr("font-size", "4pt")
            .attr("fill", "white")
            .text("Realized Points");

        // Title
        // svg.append("text")
        //     .attr("text-anchor", "middle")
        //     .attr("alignment-baseline", "center")
        //     .attr("dominant-baseline", "center")
        //     .attr("x", width / 2)
        //     .attr("y", -15)
        //     .attr("font-size", "4.5pt")
        //     .attr("fill", "white")
        //     .text("Expected Points versus Effective Ownership (Log)");

        let if_mobile = window.screen.width < 700

        let dblclick_ctr = null
        let delete_ctr = () => { dblclick_ctr = null }

        // ANIMATION ON SELECT
        let updateChart = (e, d) => {

            debugger

            let extent = e.selection

            if (!e.sourceEvent) { return }

            grayrect.call(brush.move, null)

            let scale = 1

            if (!extent) {
                if (!dblclick_ctr) { return dblclick_ctr = setTimeout(delete_ctr, 350) }
                x.domain([x_low, x_high])
                y.domain([y_low, y_high])
            }
            else {
                x.domain([x.invert(extent[0][0]), x.invert(extent[1][0])])
                y.domain([y.invert(extent[1][1]), y.invert(extent[0][1])])
                scale = Math.min(
                    (width) / (extent[1][0] - extent[0][0]),
                    (height) / (extent[1][1] - extent[0][1]),
                    )
            }


            xAxis.transition().duration(1000)
                .call(d3.axisBottom(x)
                    .tickSize(height)
                )
                .call(g => g.selectAll(".tick line")
                    .attr("stroke-opacity", 0.1)
                    .attr("stroke-width", 0.5)
                    .attr("stroke-dasharray", "3,1")
                    .style('pointer-events', 'none')
                )
                
            yAxis.transition().duration(1000)
                .call(d3.axisLeft(y).tickSize(width))
                .call(g => g.selectAll(".tick text"))
                .call(g => g.selectAll(".tick:first-of-type line").style("display", "none"))

            svg.call(g => g.selectAll(".tick text")
                .attr("fill", "white"))
                .call(g => g.selectAll(".tick line")
                    .attr("stroke-dasharray", "3,1")
                    .attr("stroke-width", 0.5)
                    .attr("stroke-opacity", 0.1)
                    .style('pointer-events', 'none'))
                .call(g => g.selectAll(".domain")
                    .attr("opacity", 0))
                .call(g => g.selectAll(".tick").attr("font-size", "4pt"));

            managers.selectAll("circle")
                .transition().duration(1000)
                .attr("cx", (d) => x(d.info.post_xp))
                .attr("cy", (d) => y(d.info.rp))
                // .attr("r", (d) => scale * (if_mobile ? 3.5 : 2))

            svg.selectAll(".manager_text").transition().duration(1000)
                .attr("x", function() {
                    debugger
                    let a = d3.select(this)
                    let mid = a.node().dataset['mid']
                    return x(app.processed_league_data.find(i => i[0].entry == mid).info.post_xp)
                })
                .attr("y", function() {
                    debugger
                    let a = d3.select(this)
                    let mid = a.node().dataset['mid']
                    return y(app.processed_league_data.find(i => i[0].entry == mid).info.rp) - 5
                })
                

        }

        let brush = d3.brush()
            .extent([[0,0], [width,height]])
            // .on("brush", brushed)
            .on("end", updateChart)

        grayrect.call(brush)



        

        svg.call(s => s.selectAll(".tick").attr("font-size", "4pt"));

        let managers = content.selectAll()
            .data(data)
            .enter()

        let mouseover = (e) => {
            e.stopPropagation()
            let pid = e.currentTarget.dataset['id']
            let entry = data.find(i => i[0].entry == pid)
            $(".hovertext").remove()
            let t = d3.select(e.target)
            svg.append("text")
                .attr("class", "hovertext")
                .attr("text-anchor", "middle")
                .attr("alignment-baseline", "center")
                .attr("dominant-baseline", "center")
                .attr("x", t.attr("cx"))
                .attr("y", parseFloat(t.attr("cy")) - 5)
                .attr("font-size", "3pt")
                .style("pointer-events", "none")
                .attr("fill", "white")
                .text(entry[0].entry_name);
        }

        // let toggleClick = (e) => {
        //     e.stopPropagation()
        //     let pid = e.currentTarget.dataset['id']
        //     let entry = app.element_data_combined[pid]
        //     let t = d3.select(e.target)
        //     if ($("#p-" + entry.id).length == 0) {
        //         svg.append("text")
        //             .attr("id", "p-" + entry.id )
        //             .attr("text-anchor", "middle")
        //             .attr("alignment-baseline", "center")
        //             .attr("dominant-baseline", "center")
        //             .attr("x", t.attr("cx"))
        //             .attr("y", parseFloat(t.attr("cy")) - 5)
        //             .attr("font-size", "3pt")
        //             .style("pointer-events", "none")
        //             .attr("fill", "white")
        //             .text(entry.name);
        //     }
        //     else {
        //         $("#p-" + entry.id).remove()
        //     }
        // }

        let color_it = (mid, toggle=false) => {
            let existing = d3.select(".selected-circle").node()
            if (existing){ existing.classList.remove("selected-circle") }
            let selected = d3.select(`*[data-id="${mid}"]`)
            selected.node().classList.add("selected-circle")
            selected.raise()

            if (!toggle) {
                jQuery(".manager_text").remove()
            }

            if ($("#p-" + mid).length == 0) {
                svg.append("text")
                    .attr("id", "p-" + mid )
                    .attr("class", "manager_text")
                    .attr("text-anchor", "middle")
                    .attr("alignment-baseline", "center")
                    .attr("dominant-baseline", "center")
                    .attr("data-mid", mid)
                    .attr("x", selected.attr("cx"))
                    .attr("y", parseFloat(selected.attr("cy")) - 5)
                    .attr("font-size", "3pt")
                    .style("pointer-events", "none")
                    .attr("fill", "white")
                    .text(data.find(i => i[0].entry == mid)[0].entry_name);
            }
            else if (toggle) {
                $("#p-" + mid).remove()
            }
        } 

        let mouseleave = (e) => {
            e.stopPropagation()
            $(".hovertext").remove()
        }

        let mouseclick = (e) => {
            e.stopPropagation()
            let mid = e.currentTarget.dataset['id']
            app.selected_team = mid

            // highlight
            color_it(mid=mid, toggle=true)
        }

        managers
            .append("circle")
            .attr("class", "analytics_circles")
            .attr("cx", (d) => x(d.info.post_xp))
            .attr("cy", (d) => y(d.info.rp))
            .attr("r", if_mobile ? 3.5 : 2)
            .attr("data-id", (d) => d[0].entry)
            .on("mouseover", mouseover)
            .on("click", mouseclick)
            .on("mouseleave", mouseleave)
            ;


        app.highlight_circle = (e) => {
            let team_id = e.target.value
            color_it(team_id, toggle=false)
        }

        if (app.selected_team) {
            app.highlight_circle({'target': {'value': app.selected_team}})
        }

        resolve()

    });
}

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

        app.all_data_ready = true

        app.$nextTick(() => {
            draw_xp_vs_rp()
            app.refresh_table()
        })
    })
})

