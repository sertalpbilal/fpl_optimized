let compactFormatter = Intl.NumberFormat('en', { notation: 'compact' });

function sample_compact_number(value) {
    switch (value) {
        case "Overall":
            return "Overall";
        case "100":
            return "Top 100";
        case "1000":
            return "Top 1K";
        case "10000":
            return "Top 10K";
        case "100000":
            return "Top 100K";
        case "1000000":
            return "Top 1M";
        case "Prime":
            return "Prime";
        case "Plank":
            return "Plank";
        default:
            let new_value = compactFormatter.format(value);
            return new_value !== "NaN" ? ("Top " + new_value) : value;
    }
}

function reverse_sample_name(value) {
    switch (value) {
        case "Sample - Overall":
            return "Overall";
        case "Sample - Plank":
            return "Plank"
        case "FPL Data":
            return "Official FPL API"
        case "Sample - Top 100":
        case "Top 100":
            return 100;
        case "Sample - Top 1K":
        case "Top 1K":
            return 1000;
        case "Sample - Top 10K":
        case "Top 10K":
            return 10000;
        case "Sample - Top 100K":
        case "Top 100K":
            return 100000;
        case "Sample - Top 1M":
        case "Top 1M":
            return 1000000;
        case "Sample - Prime":
        case "Prime":
            return "Prime";
        default:
            return value;
    }
}

function autosubbed_team(team_picks, autosub_dict) {

    let sub_replacements = []
    let cap_replacements = []
    let split_team = _.groupBy(team_picks, (i) => i.multiplier > 0)
    let lineup = split_team[true]
    let bench = split_team[false] || []
    for (let i of lineup) {
        let id = i.element;
        let info = autosub_dict[id];
        if (info === undefined) {
            continue;
        }
        if (info.autosub) {
            let original_mult = i.multiplier;
            i.multiplier = 0;
            if (i.is_captain) {
                i.is_captain = false;
                let vc = lineup.find(j => j.is_vice_captain && autosub_dict[j.element].autosub == false);
                if (vc && vc.multiplier > 0) {
                    vc.is_captain = true;
                    vc.is_vice_captain = false;
                    if (vc.multiplier <= 1) {
                        vc.multiplier = original_mult;
                    }
                    cap_replacements.push([id, vc.element])
                }
            }
            let target_pos = info.element_type;
            let current_cnt = team_picks.filter(j => j.multiplier > 0 && (autosub_dict[j.element] && autosub_dict[j.element].element_type == target_pos)).length;
            if (element_type[target_pos].min > current_cnt || target_pos == "1") {
                // only this type
                let player_to_enter = bench.find(j => autosub_dict[j.element] && autosub_dict[j.element].element_type == target_pos && autosub_dict[j.element].autosub == false)
                if (player_to_enter) {
                    player_to_enter.multiplier = 1;
                    bench = bench.filter(i => i.element != player_to_enter.element)
                    sub_replacements.push([id, player_to_enter.element])
                }
            } else {
                // anyone on bench
                let player_to_enter = bench.find(j => autosub_dict[j.element] && autosub_dict[j.element].element_type != "1" && autosub_dict[j.element].autosub == false)
                if (player_to_enter) {
                    player_to_enter.multiplier = 1;
                    bench = bench.filter(i => i.element != player_to_enter.element)
                    sub_replacements.push([id, player_to_enter.element])
                }
            }
        }
    }
    return { 'team': team_picks, 'sub_replacement': sub_replacements, 'cap_replacement': cap_replacements };
}

function prepare_fixture_data(data) {

    data.forEach((game, index) => {
        game.start_dt = new Date(game.kickoff_time);
        game.end_dt = new Date(game.start_dt.getTime() + (105 * 60 * 1000));
        game.node_info = { start: (game.start_dt).getTime(), end: game.end_dt.getTime(), content: 'Game' }
    })

    data.sort((a, b) => { return a.node_info.start - b.node_info.start });

    data.forEach((game, index) => {
        game.duration = 105 * 60 * 1000;
        game.team_h_name = teams_ordered[game.team_h - 1].name;
        game.team_a_name = teams_ordered[game.team_a - 1].name;
        game.label = teams_ordered[game.team_h - 1].name + " vs " + teams_ordered[game.team_a - 1].name;
        let order = 0;
        data.slice(0, index).forEach((game2) => {
            if ((game.start_dt >= game2.start_dt && game.start_dt <= game2.end_dt) ||
                (game.end_dt >= game2.start_dt && game.end_dt <= game2.end_dt)) {
                if (game2.order == order) {
                    order += 1;
                }
            }
        })
        game.order = order;
    })

    return data;
}


function get_provisional_bonus(gw_fixture) {
    let bonus_players = {};

    gw_fixture.forEach((game) => {
        let bps_provisional = {};

        if (game.started && !game.finished) {
            try {
                let bps_stats = game.stats.find(i => i.identifier == "bps")
                let all_players = bps_stats.h.concat(bps_stats.a)
                let sorted_groups = Object.entries(_.groupBy(all_players, i => i.value)).sort((a, b) => b[0] - a[0]).slice(0, 3)
                sorted_groups.forEach((cat, i) => {
                    let bonus = 3 - i;
                    cat[1].forEach((p) => {
                        bonus_players[p.element] = bonus;
                    });
                })
            } catch (err) {}
        }
    })

    return bonus_players;
}

function rp_by_id_dict(fixture, rp_data) {
    rp_data.forEach((p) => {
        try {
            p.games_finished = p.explain.map(i => {
                let f = fixture.find(j => j.id == i.fixture)
                if (f == undefined) { return true }
                return f.finished_provisional
            }).every(i => i);
            if (p.games_finished && p.stats.minutes == 0) {
                p.autosub = true;
            } else {
                p.autosub = false;
            }
        } catch (e) {
            console.log("Player game_finished error", e)
        }
    })
    let rp_obj = Object.fromEntries(_.cloneDeep(rp_data.map(i => [i.id, i])));
    if (!_.isEmpty(this.provisional_bonus) && !_.isEmpty(rp_obj)) {
        Object.entries(this.provisional_bonus).forEach(entry => {
            const [key, value] = entry;
            rp_obj[key].stats.total_points += value;
        })
    }
    return rp_obj;
}

function generate_autosub_dict(el_data, rp_by_id) {
    let autosubs = [];
    el_data.forEach((e) => {
        autosubs.push([e.id, { element_type: e.element_type, autosub: rp_by_id[e.id] ? rp_by_id[e.id].autosub : false }]);
    })
    let autosub_dict = Object.fromEntries(autosubs);
    return autosub_dict;
}

function get_ownership_by_type(ownership_source, fpl_data, sample_data, autosubs) {

    let teams = [];
    if (sample_data == undefined) {
        ownership_source = "Official FPL API";
    } else if (Object.keys(sample_data).length == 0) {
        ownership_source = "Official FPL API";
    }

    let tag = reverse_sample_name(ownership_source)
    if (tag == "Official FPL API") {
        return {data: fpl_data}
    }
    
    if (tag in sample_data) {
        teams = sample_data[tag].filter(i => i.team != undefined)
    }
    else {
        teams = sample_data['Overall'].filter(i => i.team != undefined)
    }
    

    let el_copy = _.cloneDeep(fpl_data);
    let sub_replacements = [];
    let cap_replacements = [];

    teams = teams.filter(i => i.data != null)

    if (!_.isEmpty(autosubs)) {
        teams = _.cloneDeep(teams);
        teams.forEach((team) => {
            let edits = autosubbed_team(team.data.picks, autosubs);
            team.data.picks = edits.team;
            sub_replacements = sub_replacements.concat(edits.sub_replacement)
            cap_replacements = cap_replacements.concat(edits.cap_replacement)
        })
    }

    let all_players = teams.map(i => i.data.picks).flat();
    let grouped_players = _.groupBy(all_players, (i) => i.element);

    el_copy.forEach((e) => {
        // let this_player_picks = all_players.filter(i => i.element == e.id);
        let this_player_picks = grouped_players[e.id];
        if (this_player_picks !== undefined) {
            let cnt = this_player_picks.length;
            e.selected_by_percent = cnt / teams.length * 100;
            let sum_of_multiplier = getSum(this_player_picks.map(i => i.multiplier));
            e.effective_ownership = sum_of_multiplier / teams.length * 100;
            let captain_count = this_player_picks.filter(i => i.multiplier > 1.5).length;
            e.captain_percentage = captain_count / teams.length * 100;
        } else {
            e.selected_by_percent = 0;
            e.effective_ownership = 0;
            e.captain_percentage = 0;
        }

    });
    return { data: el_copy, sub_replacement: sub_replacements, cap_replacement: cap_replacements };
}

async function get_latest_sample_data(season, gw) {
    return new Promise((resolve, reject) => {
        get_sample_data(season, gw.slice(2)).then(data => {
            if (data[0].status == 'rejected') {
                get_sample_data(season, parseInt(gw.slice(2))-1).then((data) => {
                    if (data[0].status == 'rejected') {
                        reject("no data")
                    }
                    else {
                        let sample_data = data[0].value
                        if (data[1].status != 'rejected') {
                            sample_data['Prime'] = data[1].value
                        }
                        if (data[2].status != 'rejected') {
                            sample_data['Plank'] = data[2].value
                        }
                        resolve({gw: parseInt(gw.slice(2))-1, data: sample_data})
                    }
                })
            }
            else {
                let sample_data = data[0].value
                if (data[1].status != 'rejected') {
                    sample_data['Prime'] = data[1].value
                }
                if (data[2].status != 'rejected') {
                    sample_data['Plank'] = data[2].value
                }
                resolve({gw: gw.slice(2), data: sample_data})
            }
        })
    })
}
