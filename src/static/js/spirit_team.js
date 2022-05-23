var app = new Vue({
    el: '#app',
    data: {
        clubs: [],
        this_gw: gw,
        fixture_data: [],
        fpl_id: undefined,
        fpl_history: undefined
    },
    computed: {
        team_history() {
            let fixture_all = this.fixture_data;
            let clubs = this.clubs;
            let history = {};
            let gw = parseInt((this.this_gw).slice(2))

            let fixture = fixture_all.filter(i => i.event <= gw && i.finished)
            let weeks = _.range(0, gw+1);
            weeks.forEach((week) => {
                let week_data = []
                let games_so_far = fixture.filter(i => i.event <= week)
                let home_games = games_so_far.map(i => ({
                    'team': i.team_h_ref.name,
                    'pts': i.team_h_pts,
                    'gd': i.team_h_goal_diff,
                    'gf': i.team_h_score,
                    'ga': i.team_a_score,
                    'win': (i.team_h_score > i.team_a_score) * 1,
                    'loss': (i.team_a_score > i.team_h_score) * 1,
                    'draw': (i.team_a_score == i.team_h_score) * 1
                }))
                let away_games = games_so_far.map(i => ({
                    'team': i.team_a_ref.name,
                    'pts': i.team_a_pts,
                    'gd': i.team_a_goal_diff,
                    'gf': i.team_a_score,
                    'ga': i.team_h_score,
                    'win': (i.team_a_score > i.team_h_score) * 1,
                    'loss': (i.team_h_score > i.team_a_score) * 1,
                    'draw': (i.team_a_score == i.team_h_score) * 1
                }))
                let dup_games = home_games.concat(away_games)
                clubs.forEach((club) => {
                    let total_points = dup_games.filter(i => i.team == club).map(i => i.pts).reduce((a, b) => a + b, 0);
                    let total_win = dup_games.filter(i => i.team == club).map(i => i.win).reduce((a, b) => a + b, 0);
                    let total_loss = dup_games.filter(i => i.team == club).map(i => i.loss).reduce((a, b) => a + b, 0);
                    let total_draw = dup_games.filter(i => i.team == club).map(i => i.draw).reduce((a, b) => a + b, 0);
                    let total_gd = dup_games.filter(i => i.team == club).map(i => i.gd).reduce((a, b) => a + b, 0);
                    let total_gf = dup_games.filter(i => i.team == club).map(i => i.gf).reduce((a, b) => a + b, 0);
                    let total_ga = dup_games.filter(i => i.team == club).map(i => i.ga).reduce((a, b) => a + b, 0);
                    let total_played = dup_games.filter(i => i.team == club).length;
                    week_data.push({
                        'team': club,
                        total_points,
                        total_gd,
                        total_gf,
                        total_ga,
                        total_win,
                        total_draw,
                        total_loss,
                        total_played
                    })
                })
                week_data = _.orderBy(week_data, ["total_points", "total_gd", "total_gf", "team"], ['desc', 'desc', 'desc', 'asc'])
                history[week] = week_data;
            })

            return history;
        },
        team_positions() {
            let vals = this.team_history;
            let gameweeks = Object.keys(vals);
            // let history = [];
            let history = {};
            let clubs = this.clubs;
            clubs.forEach((club) => {
                let team_hist = history[club] = [];
                gameweeks.forEach((week) => {
                    let position = vals[week].findIndex(i => i.team == club)
                    let team_data = vals[week][position]
                    team_hist.push({ week, 'position': position + 1, ...team_data })
                })
            })
            return history
        },
        fpl_all_week_ranks() {
            if (this.fpl_history == undefined) { return []}
            let user_rank = this.fpl_history.current.map(i => i.overall_rank)
            if (is_active){
                user_rank.pop()
            }
            return user_rank
        },
        spirit_team() {
            if (this.fpl_id == undefined) { return undefined }
            if (this.fpl_history == undefined) { return undefined }
            let user_rank = this.fpl_all_week_ranks
            let clubs = this.clubs
            let stats = clubs.map((club, index) => {
                
                let team_rank = app.team_positions[club].map(i => i.position) // .slice(1)
                if (team_rank.length > user_rank.length) {
                    team_rank.shift()
                }
                let input = _.zip(team_rank, user_rank.slice(0, team_rank.length))
                r = regression.linear(input)
                if (r.equation[0] < 0) {
                    r.final_r2 = -r.r2;
                }
                else {
                    r.final_r2 = r.r2;
                }
                return { "club": club, "short": teams_ordered[index].short, "r": r, "user_hist": user_rank, "team_rank": team_rank }
            })
            let matches = _.orderBy(stats, "r.final_r2", ["desc"])

            this.$nextTick(() => {
                redraw_graph(matches[0])
            })

            return matches
        }
    },
    methods: {
        saveFixture(fixture) {
            fixture.forEach((f) => {
                if (f.finished) {
                    if (f.team_h_score > f.team_a_score) {
                        f.team_h_pts = 3;
                        f.team_a_pts = 0; 
                    }
                    if (f.team_h_score == f.team_a_score) { 
                        f.team_h_pts = 1;
                        f.team_a_pts = 1; 
                    }
                    if (f.team_h_score < f.team_a_score) { 
                        f.team_h_pts = 0;
                        f.team_a_pts = 3; 
                    }
                    f.team_h_goal_diff = f.team_h_score - f.team_a_score;
                    f.team_a_goal_diff = f.team_a_score - f.team_h_score;
                } else {
                    f.team_h_pts = 0;
                    f.team_a_pts = 0;
                    f.team_h_goal_diff = f.team_a_goal_diff = 0;
                }

                f.team_h_ref = teams_ordered[f.team_h - 1];
                f.team_a_ref = teams_ordered[f.team_a - 1];
            })

            this.fixture_data = fixture;
            this.clubs = teams_ordered.map(i => i.name);
        },
        enterTeam() {
            this.fpl_history = undefined
            let el = document.querySelector("#teamID_input")
            this.fpl_id = parseInt(el.value)
            fetch_fpl_history()
        },
        submitTeam(e) {
            if (e.keyCode === 13) {
                this.enterTeam()
            }
        },
    }
});

function get_points(fixture) {
    // if (fixture.)
}

async function fetch_fpl_fixture() {
    return get_entire_fixture().then((data) => {
        app.saveFixture(data);
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function fetch_fpl_history() {
    return get_team_history(app.fpl_id).then((data) => {
        app.fpl_history = data;
    }).catch((e) => {
        console.log("Error", e)
    })
}

async function redraw_graph(match) {
    
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

    let svg = cnv.append('g').attr('class', 'svg-actual').attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');
    let grayrect = svg.append('g');
    grayrect.append('rect').attr('fill', '#5a5d5c').attr('width', width).attr('height', height);

    let x_high = match.team_rank.length;
    let x_low = 1;

    let pred = match.r.points.map(i => i[1]);

    let y_high = Math.min(...(pred.concat(match.user_hist)), 1)
    let y_low = Math.max(...(pred.concat(match.user_hist)))

    // Axis-x
    var x = d3.scaleLinear().domain([x_low, x_high]).range([0, width]);
    svg.append('g')
        .call(
            d3.axisBottom(x).ticks(x_high)
            .tickSize(height)
        );

    var y = d3.scaleLinear().domain([y_low, y_high]).range([height, 0]);
    svg.append('g').attr("transform", "translate(" + width + ",0)").call(d3.axisLeft(y).tickSize(width));

    // Second y-axis
    var y2 = d3.scaleLinear().domain([20, 1]).range([height, 0]);
    svg.append('g').attr("transform", "translate(" + width + ",0)").call(d3.axisRight(y2).ticks(20).tickSize(0));

    // axis_functions[graph_id].y = y;

    svg.call(g => g.selectAll(".tick text")
            .attr("fill", "white")
            .attr("class", "spirit-ticks"))
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
        .attr("y", -30)
        .attr("font-size", "4pt")
        .attr("fill", "#3BB9E2")
        .text("User Rank");
    
    // Title - y2
    svg.append("text")
        .attr("text-anchor", "middle")
        .attr("transform", "rotate(90)")
        .attr("x", height / 2)
        .attr("y", -width - 20)
        .attr("font-size", "4pt")
        .attr("fill", "#A6CE51")
        .text("Team Position");

    svg.call(s => s.selectAll(".tick").attr("font-size", "4pt"));

    svg.append('path')
        .datum(match.user_hist)
        .attr("fill", "none")
        .attr("stroke", "#3BB9E2")
        .attr("stroke-opacity", 0.8)
        .style("stroke-dasharray", "2,0.2")
        .attr("stroke-width", 1)
        .style('pointer-events', 'none')
        .attr("d", d3.line()
            .x((d,i) => x(i+1))
            .y((d) => y(d))
        );

    svg.append('path')
        .datum(match.team_rank)
        .attr("fill", "none")
        .attr("stroke", "#A6CE51")
        .attr("stroke-opacity", 0.8)
        .style("stroke-dasharray", "2,0.2")
        .attr("stroke-width", 1)
        .style('pointer-events', 'none')
        .attr("d", d3.line()
            .x((d,i) => x(i+1))
            .y((d) => y2(d))
        );

}

$(document).ready(() => {
    Promise.all([
            fetch_fpl_fixture()
        ]).then((values) => {
            app.$nextTick(() => {
                console.log('READY!')
            })
        })
        .catch((error) => {
            console.error("An error has occured: " + error);
        });
})