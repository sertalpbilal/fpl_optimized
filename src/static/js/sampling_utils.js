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
        default:
            let new_value = compactFormatter.format(value);
            return new_value !== "NaN" ? ("Top " + new_value) : value;
    }
}

function reverse_sample_name(value) {
    switch (value) {
        case "Sample - Overall":
            return "Overall";
        case "Sample - Top 100":
            return 100;
        case "Sample - Top 1K":
            return 1000;
        case "Sample - Top 10K":
            return 10000;
        case "Sample - Top 100K":
            return 100000;
        case "Sample - Top 1M":
            return 1000000;
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
        if (info.autosub) {
            let original_mult = i.multiplier;
            i.multiplier = 0;
            if (i.is_captain) {
                i.is_captain = false;
                let vc = lineup.find(j => j.is_vice_captain && autosub_dict[j.element].autosub == false);
                if (vc && vc.multiplier > 0) {
                    vc.is_captain = true;
                    vc.is_vice_captain = false;
                    vc.multiplier = original_mult;
                    cap_replacements.push([id, vc.element])
                }
            }
            let target_pos = info.element_type;
            let current_cnt = team_picks.filter(j => j.multiplier > 0 && autosub_dict[j.element].element_type == target_pos).length;
            if (element_type[target_pos].min > current_cnt || target_pos == "1") {
                // only this type
                let player_to_enter = bench.find(j => autosub_dict[j.element].element_type == target_pos && autosub_dict[j.element].autosub == false)
                if (player_to_enter) {
                    player_to_enter.multiplier = 1;
                    bench = bench.filter(i => i.element != player_to_enter.element)
                    sub_replacements.push([id, player_to_enter.element])
                }
            } else {
                // anyone on bench
                let player_to_enter = bench.find(j => autosub_dict[j.element].element_type != "1" && autosub_dict[j.element].autosub == false)
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

function get_ownership_by_type(ownership_source, fpl_data, sample_data, autosubs) {

    let teams = [];
    if (sample_data == undefined) {
        ownership_source = "Official FPL API";
    } else if (Object.keys(sample_data).length == 0) {
        ownership_source = "Official FPL API";
    }

    switch (ownership_source) {
        case "Official FPL API":
            return { data: fpl_data };
        case "Sample - Overall":
            teams = sample_data["Overall"].filter(i => i.team != undefined)
            break;
        case "Sample - Top 1M":
            teams = sample_data["1000000"].filter(i => i.team !== undefined);
            break;
        case "Sample - Top 100K":
            teams = sample_data["100000"].filter(i => i.team !== undefined);
            break;
        case "Sample - Top 10K":
            teams = sample_data["10000"].filter(i => i.team !== undefined);
            break;
        case "Sample - Top 1K":
            teams = sample_data["1000"].filter(i => i.team !== undefined);
            break;
        case "Sample - Top 100":
            teams = sample_data["100"].filter(i => i.team !== undefined);
            break;
            // case "Sample - Ahead":
            //     teams = this.sample_data["Overall"].filter(i => i.team != undefined).filter(i => i.team.summary_overall_rank <= this.team_data.entry_history.overall_rank);
            //     break;
        default:
            break;
    }

    let el_copy = _.cloneDeep(fpl_data);
    let sub_replacements = [];
    let cap_replacements = [];

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