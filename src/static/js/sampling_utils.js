let compactFormatter = Intl.NumberFormat('en', { notation: 'compact' });

function sample_compact_number(value) {
    let new_value = compactFormatter.format(value);
    return new_value !== "NaN" ? ("Top " + new_value) : value;
}

function get_ownership_by_type(ownership_source, fpl_data, sample_data) {

    let teams = [];
    if (Object.keys(sample_data).length == 0) { ownership_source = "Official FPL API"; }

    switch (ownership_source) {
        case "Official FPL API":
            return fpl_data;
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
        } else {
            e.selected_by_percent = 0;
            e.effective_ownership = 0;
        }

    });
    return el_copy;
}