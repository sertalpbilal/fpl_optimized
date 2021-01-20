let team_codes = {
    3: { name: "Arsenal", short: "ARS" },
    7: { name: "Aston Villa", short: "AVL" },
    36: { name: "Brighton", short: "BHA" },
    90: { name: "Burnley", short: "BUR" },
    8: { name: "Chelsea", short: "CHE" },
    31: { name: "Crystal Palace", short: "CRY" },
    11: { name: "Everton", short: "EVE" },
    54: { name: "Fulham", short: "FUL" },
    13: { name: "Leicester", short: "LEI" },
    2: { name: "Leeds", short: "LEE" },
    14: { name: "Liverpool", short: "LIV" },
    43: { name: "Man City", short: "MCI" },
    1: { name: "Man Utd", short: "MUN" },
    4: { name: "Newcastle", short: "NEW" },
    49: { name: "Sheffield Utd", short: "SHU" },
    20: { name: "Southampton", short: "SOU" },
    6: { name: "Spurs", short: "TOT" },
    35: { name: "West Brom", short: "WBA" },
    21: { name: "West Ham", short: "WHU" },
    39: { name: "Wolves", short: "WOL" }
}

let teams_ordered = [
    { name: "Arsenal", short: "ARS" },
    { name: "Aston Villa", short: "AVL" },
    { name: "Brighton", short: "BHA" },
    { name: "Burnley", short: "BUR" },
    { name: "Chelsea", short: "CHE" },
    { name: "Crystal Palace", short: "CRY" },
    { name: "Everton", short: "EVE" },
    { name: "Fulham", short: "FUL" },
    { name: "Leicester", short: "LEI" },
    { name: "Leeds", short: "LEE" },
    { name: "Liverpool", short: "LIV" },
    { name: "Man City", short: "MCI" },
    { name: "Man Utd", short: "MUN" },
    { name: "Newcastle", short: "NEW" },
    { name: "Sheffield Utd", short: "SHU" },
    { name: "Southampton", short: "SOU" },
    { name: "Spurs", short: "TOT" },
    { name: "West Brom", short: "WBA" },
    { name: "West Ham", short: "WHU" },
    { name: "Wolves", short: "WOL" }
]

let element_type = {
    1: { name: "Goalkeeper", "short": "GK", "id": 1, "min": 1, "max": 1 },
    2: { name: "Defender", "short": "DF", "id": 2, "min": 3, "max": 5 },
    3: { name: "Midfielder", "short": "MD", "id": 3, "min": 2, "max": 5 },
    4: { name: "Forward", "short": "FW", "id": 4, "min": 1, "max": 3 }
}

function rounded(val, digits = 2) {
    if (val === undefined || val === "") {
        return "-";
    } else {
        return parseFloat(val).toFixed(digits);
    }
}

function getWithSign(val, digits = 2) {
    if (val === undefined) {
        return "";
    }
    if (val >= 0) {
        return "+" + parseFloat(val).toFixed(digits);
    } else {
        return val.toFixed(digits);
    }
}

function getSum(arr) {
    return arr.reduce((a, b) => a + b, 0)
}

const downloadToFile = (content, filename, contentType) => {
    const a = document.createElement('a');
    const file = new Blob([content], { type: contentType });

    a.href = URL.createObjectURL(file);
    a.download = filename;
    document.body.append(a);
    setTimeout(function() {
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, 100);


};

function get_fixture(gw, callback) {
    $.ajax({
        type: "GET",
        url: 'https://cors.alpscode.com/fantasy.premierleague.com/api/fixtures/',
        dataType: "json",
        success: function(data) {
            let filtered_games = data.filter(i => i.event == gw);
            callback(undefined, filtered_games);
        },
        error: function() {
            console.log("Cannot get fixture");
            callback("No data", undefined);
        }
    });
}

function get_sample_data(target_gw, callback) {

    $.ajax({
        type: "GET",
        url: `sample/${target_gw}/fpl_sampled.json`,
        dataType: "json",
        success: function(data) {
            callback(undefined, data);
        },
        error: function() {
            console.log("GW" + target_gw + " has no sample data");
            callback("No data", undefined);
        }
    });

}

function get_cached_element_data({ season, gw, date }, callback) {
    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/input/element.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            let el_data = values.map(i => _.zipObject(keys, i));
            callback(undefined, el_data);
        },
        error: function(xhr, status, error) {
            console.log(error);
            console.error(xhr, status, error);
            callback("No data", undefined);
        }
    });
}

function get_team_info(team_id, callback) {
    if (app.team_id == "-1") { callback("Team ID not valid", undefined); }
    // 

    $.ajax({
        type: "GET",
        url: `https://cors.alpscode.com/fantasy.premierleague.com/api/entry/${team_id}/`,
        contentType: 'text/plain',
        dataType: 'text',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let teaminfo = JSON.parse(data);
            callback(undefined, teaminfo)
        },
        error: function(xhr, status, error) {
            callback("Cannot get team info", undefined)
        }
    });
}

function get_team_picks({ gw, team_id, force_last_gw, next_gw }, callback) {

    if (app.team_id == "-1") { callback("Team ID not valid", undefined); }

    $.ajax({
        type: "GET",
        url: `https://cors.alpscode.com/fantasy.premierleague.com/api/entry/${team_id}/event/${gw}/picks/`,
        contentType: 'text/plain',
        dataType: 'text',
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET',
            'X-Requested-With': 'XMLHttpRequest'
        },
        success: function(data) {
            let teamvals = JSON.parse(data);
            callback(undefined, { body: teamvals, is_last_gw: false })
        },
        error: function(xhr, status, error) {
            if (force_last_gw && gw == next_gw) {
                let last_gw = "" + (parseInt(gw) - 1);

                $.ajax({
                    type: "GET",
                    url: `https://cors.alpscode.com/fantasy.premierleague.com/api/entry/${team_id}/event/${last_gw}/picks/`,
                    contentType: 'text/plain',
                    dataType: 'text',
                    headers: {
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'GET',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    success: function(data) {
                        let teamvals = JSON.parse(data);
                        callback(undefined, { body: teamvals, is_last_gw: true })
                    },
                    error: function(xhr, status, error) {
                        callback("Cannot get picks for last GW", undefined)
                    }
                });
            } else {
                callback("Cannot get picks for this GW", undefined)
            }
        }
    });


}

function teamInfoDetails(team_info, field) {
    try {
        switch (field) {
            case "last_gw_rank_overall":
                return team_info.leagues.classic.find(i => i.name == "Overall").entry_last_rank;
            case "current_rank":
                return team_info.leagues.classic.find(i => i.name == "Overall").entry_rank;
        }
    } catch {
        return "-"
    }
}

let rank_formatter = Intl.NumberFormat('en');

function formatted_rank(value) {
    return rank_formatter.format(value)
}