var app = new Vue({
    el: '#app',
    data: {
        puzzle_order: 0,
        puzzle_date: undefined,
        puzzle_id: undefined,
        raw_data: undefined,
        sol_data: undefined,
        choice: [],
        type_colors: {
            1: "#ff8811",
            2: "#E1A1A7",
            3: "#CBC5EA",
            4: "#87B37A"
        },
        out_selected: null,
        out_gw: null,
        highlight: undefined,
        tries: [],
        errormessage: '',
        submitting: false,
        round_limit: 6,
        solved: false,
        sortOrder: undefined,
        resultText: 'Stats',
        stats: undefined,
        result: undefined,
        show_share_box: false,
        coming_soon: undefined
    },
    computed: {
        data_ready() {
            return (!_.isEmpty(this.raw_data) && !_.isEmpty(this.sol_data))
        },
        season() {
            if (!this.data_ready) { return '' }
            return this.sol_data.info.season
        },
        gws() {
            if (!this.data_ready) { return [] }
            return _.sortBy(_.uniq(this.raw_data.map(i => i.GW)))
        },
        plan_gws() {
            if (!_.isEmpty(this.gws)) {
                return this.gws.slice(1)
            }
            return []
        },
        date_str() {
            if (this.puzzle_date == undefined) { return '' }
            return new Intl.DateTimeFormat().format(this.puzzle_date)
        },
        // player_dict() {
        //     if (!this.data_ready) { return {} }
        //     return Object.fromEntries(_.uniqBy(app.raw_data.map(i => [i.element, {...i}]), 0))
        // }
        player_dict() {
            if (!this.data_ready) { return {} }
            return _(this.raw_data).groupBy('element').mapValues(a => { return {...a[0], 'sum_pts': _.sumBy(a, 'total_points'), 'GW': '', 'entries': a, 'dict': _(a).groupBy('GW').mapValues(j => j[0]).value() } }).value()
        },
        player_list() {
            if (_.isEmpty(this.player_dict)) { return [] }
            let players = Object.values(this.player_dict)
            if (this.sortOrder) {
                return _.orderBy(players, (v) => (v.dict[this.sortOrder] && v.dict[this.sortOrder].total_points) || 0, 'desc')
            } else {
                return _.orderBy(players, ['sum_pts'], ['desc'])
            }

        },
        filtered_players() {
            if (!this.data_ready) { return [] }
            if (!this.out_selected) { return [] }
            let players = this.player_list
            let selected = this.player_dict[this.out_selected]
            return players.filter(i => i.element_type == selected.element_type)
        },
        initial_ids() {
            if (!this.data_ready) { return [] }
            return this.sol_data.output.initial
        },
        initial_sorted() {
            if (!this.data_ready) { return [] }
            let players = this.initial_ids.map(i => this.player_dict[i])
            return _.orderBy(players, ['element_type', 'sum_pts'], ['asc', 'desc'])
        },
        generated_plan() {
            if (!this.data_ready) { return [] }
            let team = _.cloneDeep(this.initial_ids)
            let gameweeks = this.gws
            let itb = 100
            let plan_pts = 0
            let ft = 1
            let current_team = _.cloneDeep(team)
            let values = gameweeks.map(gw => {
                let this_gw_moves = _.cloneDeep(this.choice.filter(j => j.gw == gw))
                this_gw_moves.forEach((e) => {
                    e.player_in = this.getPlayerDetail(e.buy, gw)
                    e.player_out = this.getPlayerDetail(e.sell, gw)
                    e.value_diff = (e.player_out.now_cost / 10 - e.player_in.now_cost / 10)
                })
                let tr_in = this_gw_moves.map(i => i.buy)
                let tr_out = this_gw_moves.map(i => i.sell)
                current_team = _.concat(current_team, tr_in).filter(j => !tr_out.includes(j))
                team_details = current_team.map(j => this.getPlayerDetail(j, gw))
                team_details.forEach((p) => {
                    if (tr_in.includes(p.element)) {
                        p.transfer_in = true
                    }
                    else {
                        p.transfer_in = false
                    }
                })
                itb = _.round(100 - _.sum(current_team.map(i => this.player_dict[i].now_cost / 10)), 1)
                let picks = this.best11(team_details)
                let lineup = picks.lineup
                let bench = picks.bench
                let details = picks.sorted_details
                if (this.plan_gws.includes(gw)) {
                    plan_pts += picks.gw_pts
                }
                ft_to = !this.plan_gws.includes(gw) ? 1 : (ft == 2 ? (tr_out.length <= 1 ? 2 : 1) : (tr_out.length <= 0 ? 2 : 1))

                // team check
                let team_errors = Object.entries(_.countBy(details, 'team_name')).filter(i => i[1] > 3).map(i => i[0])


                let gw_details = {
                    gw: gw,
                    team: details,
                    squad_ids: details.map(i => i.element),
                    lineup: lineup,
                    lineup_ids: lineup.map(i => i.element),
                    bench: bench,
                    bench_ids: bench.map(i => i.element),
                    itb: itb,
                    in: tr_in,
                    out: tr_out,
                    gw_pts: picks.gw_pts,
                    ft_from: ft,
                    ft_to: ft_to,
                    transfers: this_gw_moves,
                    team_errors: team_errors
                }
                ft = ft_to
                current_team = _.cloneDeep(details.map(i => i.element))
                return [gw, gw_details]
            })
            let val_dict = Object.fromEntries(values)
            val_dict['overall'] = { 'total_plan_points': plan_pts }

            return val_dict
        },
        optimal_scores() {
            if (!this.data_ready) { return {} }
            let pt_dict = Object.fromEntries(this.sol_data.output.solution.map(i => [i.gw, i.gw_pts]))
            return pt_dict
        },
        optimal_total() {
            if (!this.data_ready) { return }
            let pts = Object.entries(this.optimal_scores).filter(i => this.plan_gws.includes(parseInt(i[0]))).map(i => i[1])
            return _.sum(pts)
        },
        optimal_in_text() {
            if (!this.data_ready) { return }
            return this.sol_data.output.solution.map(
                i => {
                    return {
                        'in': i.tr_in.map(j => app.player_dict[j].web_name).join(','),
                        'out': i.tr_out.map(j => app.player_dict[j].web_name).join(',')
                    }
                })
        },
        current_status() {
            return {'puzzle_id': this.puzzle_id, 'order': this.puzzle_order, 'status': this.solved, 'tries': this.tries, 'result': this.result}
        },
        stat_summary() {
            if (!this.data_ready) { return {} }
            let stats = this.stats
            if (stats == undefined) {
                return {
                    'played': 0,
                    'won': 0,
                    'won_ratio': 0,
                    'streak': 0,
                    'max_streak': 0,
                    'result_counts': {},
                    'score_ratios': {}
                }
            }
            let played = stats.scores.length
            let won = stats.scores.filter(i => i.result == 'solved').length
            let score_counts = stats.scores.map(i => i.result == 'failed' ? -1 : i.result == 'solved' ? i.tries.length : undefined).filter(i => i !== undefined)
            score_counts = _.countBy(score_counts)
            let score_ratios = _(score_counts).mapValues(i => _.round(i / played * 100,0)).value()
            return {
                'played': played,
                'won': won,
                'won_ratio': _.round(won/played*100, 1),
                'streak': 0,
                'max_streak': 0,
                'result_counts': score_counts,
                'score_ratios': score_ratios
            }
        },
        tries_text() {
            let tries = this.tries

            text = ''
            tries.forEach((t) => {
                text += Object.values(t.squares).map(i => i=='correct' ? "🟩" : i=="below" ? "🟨" : "🟪").join('') + '\n'
            })

            return text
        },
        share_text() {
            let text = `FPL Puzzle #${ this.puzzle_order }: ${ this.result == 'failed' ? "X" : this.tries.length }/6` + '\n\n'
            text += this.tries_text + '\n'
            text += this.url
            return text
        },
        url() {
            return 'fploptimized.com/puzzle.html'
        }
    },
    methods: {
        best11(team) {
            team.forEach((p) => { p.is_captain = false })
            let lineup = []
            let grouped = _(team).groupBy('element_type').mapValues((i) => _.orderBy(i, 'total_points', 'desc')).value()
            Object.keys(element_type).forEach((t) => {
                let min_pick = element_type[t].min
                picks = grouped[t].splice(0, min_pick)
                lineup = _.concat(lineup, picks)
            })
            let remaining = _.orderBy(Object.values(grouped).flat(), 'total_points', 'desc')
            remaining.forEach((r) => {
                if (lineup.length == 11) { return }
                let type_total = lineup.filter(i => i.element_type == r.element_type).length
                if (type_total + 1 > element_type[r.element_type].max) { return }
                lineup = _.concat(lineup, [r])
            })
            let best = _.indexOf(lineup, _.maxBy(lineup, 'total_points'))
            lineup[best].is_captain = true
            lineup = _.orderBy(lineup, ['element_type', 'total_points'], ['asc', 'desc'])
            let bench = team.filter(i => !lineup.map(j => j.element).includes(i.element))
            bench = _.orderBy(bench, ['element_type', 'total_points'], ['asc', 'desc'])
            let gw_pts = _.sum(lineup.map(i => i.is_captain ? 2 * i.total_points : i.total_points))
            return { 'lineup': lineup, 'bench': bench, 'sorted_details': _.orderBy(team, ['total_points'], ['desc']), 'gw_pts': gw_pts }
        },
        cancelSell() {
            this.out_selected = null
            this.out_gw = null
        },
        markSell(element, gw) {
            this.out_selected = parseInt(element)
            this.out_gw = parseInt(gw)
            $('#player-tab').tab('show')
        },
        makeTransfer(element) {
            if (!this.out_selected) { this.cancelSell(); return }
            let in_player = element
            let out_player = this.out_selected
            let tr_gw = this.out_gw
            this.choice.push({
                'gw': tr_gw,
                'sell': out_player,
                'buy': in_player
            })

            // check if existing player is sold in future
            let future_sell = this.choice.find(i => i.gw > tr_gw && i.sell == out_player)
            if (future_sell) {
                future_sell.sell = in_player
            }

            this.checkTransfers()

            this.cancelSell()
            $('#horizon-tab').tab('show')
        },
        getPlayerDetail(element, gw) {
            return this.player_dict[element].dict[gw] || {...this.player_dict[element], 'sum_pts': null, 'total_points': 0, 'GW': gw }
        },
        submitTry() {
            this.submitting = true
            this.errormessage = ''
            let plan = Object.entries(this.generated_plan)

            for (const e of plan) {
                let gw = parseInt(e[0])
                if (!this.plan_gws.includes(gw)) { continue }
                // ITB check
                if (e[1].itb < -0.05) {
                    this.errormessage = `Negative ITB on GW ${e[0]}`
                    this.submitting = false
                    return
                }
                // Team Check
                if (e[1].team_errors.length > 0) {
                    this.errormessage = `Too many players from ${e[1].team_errors.join(', ')} on GW${e[0]}`
                    this.submitting = false
                    return
                }
                // Transfer Check
                if (e[1].out.length > e[1].ft_from) {
                    this.errormessage = `Too many transfers on GW${e[0]}`
                    this.submitting = false
                    return
                }
            }

            // if we reach here, it means all is good!

            let points = plan.map(i => [parseInt(i[0]), i[1].gw_pts])
            let squares = {}
            points.forEach((e) => {
                if (!app.plan_gws.includes(e[0])) { return }
                if (app.optimal_scores[e[0]] > e[1]) {
                    squares[e[0]] = "below"
                } else if (app.optimal_scores[e[0]] == e[1]) {
                    squares[e[0]] = "correct"
                } else {
                    squares[e[0]] = "above"
                }
            })

            let final_points = _.sum(points.filter(i => this.plan_gws.includes(i[0])).map(i => i[1]))
            let optimal_points = this.optimal_total
            let solved = _.round(final_points) >= _.round(optimal_points)

            this.tries.push({
                // 'plan': _.cloneDeep(plan),
                'choice': _.cloneDeep(this.choice),
                'points': Object.fromEntries(plan.map(i => [i[0], i[1].gw_pts])),
                'squares': squares,
                'final_points': final_points,
                'solved': solved
            })

            if (solved) {
                // show popup!
                this.solved = true
                this.resultText = 'You found the optimal!'
                this.result = 'solved'
                this.addResult()
                setTimeout(() => {
                    $('#results-modal').modal('show')
                }, 200)
                return
            }
            else if (this.tries.length >= this.round_limit) {
                // failed: show popup
                this.solved = false
                this.resultText = 'You used all your tries!'
                this.result = 'failed'
                this.addResult()
                setTimeout(() => {
                    $('#results-modal').modal('show')
                }, 200)
                return
            }
            else {
                // save the move
                this.saveMove()
            }

            setTimeout(() => {
                app.submitting = false
            }, 500)

        },
        resetAll() {
            this.choice = []
        },
        addResult() {
            let stats = this.stats
            let r = this.current_status
            if (stats == undefined) {
                stats = {
                    'scores': [r],
                    'today': r
                }
            }
            else {
                stats.scores.push(r)
                stats.today = r
            }
            this.stats = stats
            localStorage.setItem("puzzle_stats", JSON.stringify(stats))
        },
        saveMove() {
            let stats = this.stats
            let r = this.current_status
            if (stats == undefined) {
                stats = {
                    'scores': [],
                    'today': null
                }
            }
            stats['today'] = r
            localStorage.setItem("puzzle_stats", JSON.stringify(stats))
        },
        restoreGame(v) {

        },
        checkTransfers() {
            let choice = _.cloneDeep(this.choice)
            // same player buy/sell
            choice = choice.filter(i => !(i.buy == i.sell))
            // check if each player is in team during transfer
            let team = _.cloneDeep(this.initial_ids)
            for (const gw of this.plan_gws) {
                choice = choice.filter(i => i.gw != gw || (team.includes(i.sell) && !team.includes(i.buy)))
                gw_tr = choice.filter(i => i.gw == gw)
                team = _.concat(team.filter(i => !gw_tr.map(i => i.sell).includes(i)), gw_tr.map(i => i.buy))
            }

            this.$nextTick(() => {
                this.choice = _.cloneDeep(choice)
            })
            
        },
        showSolution() {
            if (!this.data_ready) { return }
            let sol = this.sol_data.output.solution.map(i => i.tr_in.map((j,k) => {return {'gw': i.gw, 'buy': j, 'sell': i.tr_out[k]}})).flat()
            this.choice = sol
            $('#results-modal').modal('hide')
        }
    }
});

async function read_challenge_sol(name) {
    return read_local_file(`data/puzzle/${name}_sol.json`).then((d) => {
        app.sol_data = Object.freeze(d)
    })
}
async function read_challenge_input(name) {
    return read_local_file(`data/puzzle/${name}_values.csv`).then((d) => {
        let values = Object.freeze($.csv.toObjects(d))
        values.forEach((v) => {
            v.now_cost = parseInt(v.now_cost)
            v.element = parseInt(v.element)
            v.GW = parseInt(v.GW)
            v.total_points = parseInt(v.total_points)
        })
        app.raw_data = values
    })
}

Vue.component('player-bar', {
    props: {
        data: { type: Object },
        highlight: false,
        teamerror: false
    },
    methods: {
        markSell(element, gw) {
            app.out_selected = parseInt(element)
            app.out_gw = parseInt(gw)
            $('#player-tab').tab('show')
        }
    },
    template: `<div :class="['player-border player-pos-' + data.element_type, {'puzzle-highlight': highlight}]" @mouseover="app.highlight=data.element" @mouseleave="app.highlight=undefined">
        <div class="d-flex flex-column p-1 text-small" style="position: relative;">
            <div class="text-left font-weight-bold l100">{{ data.web_name }} <i class="fas fa-copyright captain-c" v-if="data.is_captain"></i> {{ data.transfer_in ? "✨" : "" }}</div>
            <div class="row l100 no-wrap bisque">
                <div class="col-6 font-italic text-left" :class="{'puzzle-error': teamerror}">{{ data.team_name }}</div>
                <div class="col-3 text-left">£{{ data.now_cost/10 }}</div>
                <div class="col-3 text-left">{{ data.sum_pts || data.total_points }}</div>
            </div>
            <button v-if="data.GW != '' && !data.transfer_in" class="m-0 p-0 btn btn-sm text-small puzzle-transfer-button" @click="markSell(data.element, data.GW)"><i class="fas fa-times"></i></button>
        </div>
        
    </div>`
})

Vue.component('transfer-bar', {
    props: {
        data: { type: Object }
    },
    methods: {
        deleteSell() {
            app.choice = app.choice.filter(i => !(i.sell == this.data.sell && i.buy == this.data.buy && i.gw == this.data.gw))
                // replace in future sells
            let match = app.choice.find(i => i.gw > this.data.gw && i.sell == this.data.buy)
            if (match) {
                match.sell = this.data.sell
            }
            app.checkTransfers()
        }
    },
    template: `<div :class="'player-border player-pos-' + data.player_in.element_type">
        <div class="d-flex flex-column p-1 text-small" style="position: relative;">
            <div class="text-left font-weight-bold l100">{{ data.player_out.web_name }} → {{ data.player_in.web_name }} <i class="fas fa-copyright captain-c" v-if="data.is_captain"></i> {{ data.transfer_in ? "✨" : "" }}</div>
            <div class="row l100 no-wrap bisque">
                <div class="col-6 font-italic text-left"></div>
                <div class="col-3 text-left">£{{ data.value_diff > 0 ? "+" : "" }}{{ _.round(data.value_diff,1) }}</div>
                <div class="col-3 text-left"></div>
            </div>
            <button class="m-0 p-0 btn btn-sm text-small puzzle-transfer-button" @click="deleteSell"><i class="fas fa-times"></i></button>
        </div>
        
    </div>`
})

function days_between(date1, date2) {
    const oneDay = 24 * 60 * 60 * 1000
    return Math.round((date2 - date1) / oneDay)
}

function initialize(puzzle_id, puzzle_order, puzzle_date) {
    
    calls = [
        read_challenge_sol(puzzle_id),
        read_challenge_input(puzzle_id)
    ]

    Promise.allSettled(calls).then(() => {
            app.puzzle_id = puzzle_id
                // check storage
            let stats = JSON.parse(localStorage.getItem("puzzle_stats"))
            app.stats = stats
            
            let solved_before 
            if (stats !== null) {
                solved_before = stats.scores.find(i => i.order == app.puzzle_order && i.puzzle_id == app.puzzle_id)
                if (stats.today && stats.today.puzzle_id == app.puzzle_id) {
                    app.tries = _.cloneDeep(stats.today.tries)
                    app.result = stats.today.result
                }
                else if (solved_before)  {
                    app.tries = _.cloneDeep(solved_before.tries)
                    app.result = solved_before.result
                }
            }
            
            app.puzzle_order = puzzle_order
            app.puzzle_date = puzzle_date
        })
        .catch((error) => {
            console.error("An error has occurred: " + error);
        });
}

$(document).ready(() => {

    let first_day = new Date("2022-03-31 12:00")
    let demo_mode = false
    let puzzle_id

    let url = window.location.search
    const params = new URLSearchParams(url)

    if (demo_mode || params.get('demo') == 1) {
        puzzle_id = 'n7yMv'
        initialize(puzzle_id, -1, new Date())
    } else {
        
        if (params.get('id') && params.get('unlock') == 1) {
            read_local_file(`data/puzzle/order.json`).then((d) => {
                let order = parseInt(params.get('id')) % d.length
                puzzle_id = d[order]
                let date = new Date(first_day.getTime() + order * 24 * 60 * 60 * 1000)
                initialize(puzzle_id, order, date)
            })
        }
        else {
            let today = new Date()
            
            let btw = days_between(first_day, today)
            if (btw < 0) { app.coming_soon = 1; return }
            read_local_file(`data/puzzle/order.json`).then((d) => {
                let order = btw % d.length
                puzzle_id = d[order]
                initialize(puzzle_id, order, today)
            })
        }
    }
})

