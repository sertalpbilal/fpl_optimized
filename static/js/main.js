// Edge fixes

Object.fromEntries = Object.fromEntries || function(arr) {
    return arr.reduce(function(acc, curr) {
        acc[curr[0]] = curr[1];
        return acc;
    }, {});
};

let proxy = "https://cors.alpscode.com"
// let proxy = "https://cors.fploptimized.com"

if (!Array.prototype.flat) {
    Object.defineProperty(Array.prototype, 'flat', {
        value: function(depth = 1, stack = []) {
            for (let item of this) {
                if (item instanceof Array && depth > 0) {
                    item.flat(depth - 1, stack);
                } else {
                    stack.push(item);
                }
            }
            return stack;
        }
    });
}

if (!Promise.allSettled) {
    function allSettled(promises) {
        let wrappedPromises = promises.map(p => Promise.resolve(p)
            .then(
                val => ({ status: 'fulfilled', value: val }),
                err => ({ status: 'rejected', reason: err })));
        return Promise.all(wrappedPromises);
    }
    Promise.allSettled = allSettled
}

let team_codes = {
    3: { name: "Arsenal", short: "ARS" },
    7: { name: "Aston Villa", short: "AVL" },
    91: { name: "Bournemouth", short: "BOU" },
    94: { name: "Brentford", short: "BRE" },
    36: { name: "Brighton", short: "BHA" },
    90: { name: "Burnley", short: "BUR" },
    8: { name: "Chelsea", short: "CHE" },
    31: { name: "Crystal Palace", short: "CRY" },
    11: { name: "Everton", short: "EVE" },
    54: { name: "Fulham", short: "FUL" },
    40: { name: "Ipswich", short: "IPS" },
    13: { name: "Leicester", short: "LEI" },
    2: { name: "Leeds", short: "LEE" },
    14: { name: "Liverpool", short: "LIV" },
    43: { name: "Man City", short: "MCI" },
    1: { name: "Man Utd", short: "MUN" },
    4: { name: "Newcastle", short: "NEW" },
    17: { name: "Nott'm Forest", short: "NFO" },
    45: { name: "Norwich", short: "NOR" },
    49: { name: "Sheffield Utd", short: "SHU" },
    20: { name: "Southampton", short: "SOU" },
    6: { name: "Spurs", short: "TOT" },
    57: { name: "Watford", short: "WAT" },
    35: { name: "West Brom", short: "WBA" },
    21: { name: "West Ham", short: "WHU" },
    39: { name: "Wolves", short: "WOL" },
    102: { name: "Luton", short: "LUT" },
}

let team_short_dict = _.fromPairs(_(team_codes).map((val,key) => [val.short, key]).value())

let season_teams = ["ARS", "AVL", "BOU", "BRE", "BHA", "CHE", "CRY", "EVE", "FUL", "IPS", "LEI", "LIV", "MCI", "MUN", "NEW", "NFO", "SOU", "TOT", "WHU", "WOL"]

let teams_ordered = [
    { name: "Arsenal", short: "ARS" },
    { name: "Aston Villa", short: "AVL" },
    { name: "Bournemouth", short: "BOU", long: "AFC Bournemouth" },
    { name: "Brentford", short: "BRE" },
    { name: "Brighton", short: "BHA", long: "Brighton and Hove Albion" },
    // { name: "Burnley", short: "BUR" },
    { name: "Chelsea", short: "CHE" },
    { name: "Crystal Palace", short: "CRY" },
    { name: "Everton", short: "EVE" },
    { name: "Fulham", short: "FUL" },
    { name: "Ipswich", short: "IPS" },
    { name: "Leicester", short: "LEI", long: "Leicester City" },
    // { name: "Leeds", short: "LEE", long: "Leeds United" },
    { name: "Liverpool", short: "LIV" },
    // { name: "Luton", short: "LUT" },
    { name: "Man City", short: "MCI", long: "Manchester City" },
    { name: "Man Utd", short: "MUN", long: "Manchester United" },
    { name: "Newcastle", short: "NEW" },
    { name: "Nott'm Forest", short: "NFO", long: "Nottingham Forest" },
    // { name: "Norwich", short: "NOR", long: "Norwich City" },
    // { name: "Sheffield Utd", short: "SHU", long: "Sheffield United" },
    { name: "Southampton", short: "SOU" },
    { name: "Spurs", short: "TOT", long: "Tottenham Hotspur" },
    // { name: "Watford", short: "WAT" },
    // { name: "West Brom", short: "WBA", long: "West Bromwich Albion" },
    { name: "West Ham", short: "WHU", long: "West Ham United" },
    { name: "Wolves", short: "WOL", long: "Wolverhampton" }
]

let pl_team_colors = {
    "ARS": ['#EF0107', '#FFFFFF'],
    "AVL": ['#95BFE5', '#670E36'],
    "BRE": ['#FFFFFF', '#e30613'],
    "BHA": ['#FFFFFF', '#40a8ff'],
    "BUR": ['#6C1D45', '#99D6EA'],
    "CHE": ['#034694', '#D1D3D4'],
    "CRY": ['#1B458F', '#D16475'],
    "EVE": ['#003399', '#FFFFFF'],
    "LEI": ['#003090', '#FDBE11'],
    "LEE": ['#FFFFFF', '#0030b9'],
    "LIV": ['#C8102E', '#0bcdc3'],
    "MCI": ['#6CABDD', '#1C2C5B'],
    "MUN": ['#DA291C', '#FBE122'],
    "NEW": ['#241F20', '#FFFFFF'],
    "NOR": ['#FFF200', '#00A650'],
    "SOU": ['#ed1a3b', '#FFFFFF'],
    "TOT": ['#132257', '#FFFFFF'],
    "WAT": ['#FBEE23', '#ED2127'],
    "WHU": ['#7A263A', '#F3D459'],
    "WOL": ['#FDB913', '#231F20'],
    "FUL": ['#000000', '#FFFFFF'],
    "BOU": ['#DA291C', '#EFDBB2'],
    "NFO": ['#E53233', '#FFFFFF'],
    "LUT": ['#F78F1E', '#002D62'],
    "SHU": ['#EE2737', '#000000']

}

let element_type = {
    1: { name: "Goalkeeper", "short": "GK", "id": 1, "min": 1, "max": 1, "cnt": 2 },
    2: { name: "Defender", "short": "DF", "id": 2, "min": 3, "max": 5, "cnt": 5 },
    3: { name: "Midfielder", "short": "MD", "id": 3, "min": 2, "max": 5, "cnt": 5 },
    4: { name: "Forward", "short": "FW", "id": 4, "min": 1, "max": 3, "cnt": 3 }
}

let stat_types = {
    goals_scored: { name: "Goals", icon: "fas fa-futbol" },
    assists: { name: "Assists", icon: "fas fa-hands-helping" },
    bonus: { name: "Bonus", icon: "fas fa-coins" },
    bps: { name: "BPS" },
    own_goals: { name: "Own Goals", icon: "far fa-grimace" },
    penalties_missed: { name: "Penalties Missed", icon: "far fa-thumbs-down" },
    penalties_saved: { name: "Penalties Saved", icon: "fas fa-chess-rook" },
    saves: { name: "Saves", icon: "far fa-hand-paper" },
    red_cards: { name: "Red Cards", icon: "fas fa-door-closed" },
    yellow_cards: { name: "Yellow Cards", icon: "fas fa-door-open" },
    bps_provisional: { name: "BPS (Live)", icon: "fas fa-calculator" }
}

let player_stat_types = {
    "minutes": {'name': "Minutes", 'pp': true},
    "clean_sheets": {'name': "Clean Sheets", 'pp': false},
    "goals_scored": {'name': "Goals", 'pp': true},
    "assists": {'name': "Assists", 'pp': true},
    "bonus": {'name': "Bonus", 'pp': true},
    "saves": {'name': "Saves", 'pp': true},
    "penalties_saved": {'name': "Penalties Saved", 'pp': false},
    "goals_conceded": {'name': "Goals Conceded", 'pp': true},
    "own_goals": {'name': "Own Goals", 'pp': false},
    "yellow_cards": {'name': "Yellow Cards", 'pp': false},
    "red_cards": {'name': "Red Cards", 'pp': false},
    "penalties_missed": {'name': "Penalties Missed", 'pp': false}
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

function getAvg(arr) {
    return arr.reduce((a, b) => a + b, 0) / Math.max(arr.length, 1);
}

function getMin(arr) {
    return Math.min(...arr)
}

function getMax(arr) {
    return Math.max(...arr)
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

function get_fpl_main_data() {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/bootstrap-static/`,
            dataType: "json",
            async: true,
            success: function(data) {
                resolve(data);
            },
            error: function() {
                console.log("Cannot get FPL main data");
                reject("No data");
            }
        });
    });
}

async function read_cached_static(req_season) {
    return $.ajax({
        type: "GET",
        url: `data/${req_season}/static.json`,
        async: true,
        dataType: "json",
        success: (data) => {
            return data
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

function get_entire_fixture() {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/fixtures/`,
            dataType: "json",
            async: true,
            success: function(data) {
                resolve(data);
            },
            error: function() {
                console.log("Cannot get fixture");
                reject("No data");
            }
        });
    });
};

function get_fixture(gw) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/fixtures/?event=${gw}`,
            dataType: "json",
            async: true,
            success: function(data) {
                let filtered_games = data.filter(i => i.event == gw);
                resolve(filtered_games);
            },
            error: function() {
                console.log("Cannot get fixture");
                reject("No data");
            }
        });
    });
}

function get_sample_data(season, target_gw) {

    let regular_sample = new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `sample/${season}/${target_gw}/fpl_sampled.json`,
            dataType: "json",
            async: true,
            success: function(data) {
                resolve(data);
            },
            error: function() {
                console.log("GW" + target_gw + " has no sample data");
                reject("No data");
            }
        });
    })

    let prime_sample = new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `sample/${season}/${target_gw}/top_managers.json`,
            dataType: "json",
            async: true,
            success: function(data) {
                resolve(data);
            },
            error: function() {
                console.log("GW" + target_gw + " has no sample data");
                reject("No data");
            }
        });
    });

    let plank_sample = new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `sample/${season}/${target_gw}/plank_managers.json`,
            dataType: "json",
            async: true,
            success: function(data) {
                resolve(data);
            },
            error: function() {
                console.log("GW" + target_gw + " has no sample data");
                reject("No data");
            }
        });
    });

    let promises = [regular_sample, prime_sample, plank_sample]

    return Promise.allSettled(promises)
}

function get_cached_element_data({ season, gw, date }) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `data/${season}/${gw}/${date}/input/element.csv`,
            dataType: "text",
            async: true,
            success: function(data) {
                tablevals = data.split('\n').map(i => i.split(','));
                keys = tablevals[0];
                values = tablevals.slice(1);
                let el_data = values.map(i => _.zipObject(keys, i));
                resolve(el_data);
            },
            error: function(xhr, status, error) {
                console.log(error);
                console.error(xhr, status, error);
                reject("No data");
            }
        });
    });
}

function get_team_info(team_id) {
    return new Promise((resolve, reject) => {
        if (team_id == "-1") { reject("Invalid team ID"); }
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/entry/${team_id}/`,
            async: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'X-Requested-With': 'XMLHttpRequest',
                'Referrer-Policy': 'no-referrer-when-downgrade'
            },
            success: function(data) {
                resolve(data);
            },
            error: function(xhr, status, error) {
                reject("Cannot get team info")
            }
        });
    });
}


function get_team_history(team_id) {
    return new Promise((resolve, reject) => {
        if (team_id == "-1") { reject("Invalid team ID"); }
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/entry/${team_id}/history/`,
            dataType: 'json',
            async: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'X-Requested-With': 'XMLHttpRequest',
                'Referrer-Policy': 'no-referrer-when-downgrade'
            },
            success: function(data) {
                resolve(data);
            },
            error: function(xhr, status, error) {
                reject("Cannot get team info")
            }
        });
    });
}


function get_team_picks({ gw, team_id, force_last_gw }) {
    return new Promise((resolve, reject) => {
        if (team_id == "-1") { reject("Team ID not valid"); }
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/entry/${team_id}/event/${gw}/picks/`,
            dataType: 'json',
            async: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': "X-Requested-With",
                'Access-Control-Allow-Methods': 'GET',
                'X-Requested-With': 'XMLHttpRequest',
                'Referrer-Policy': 'no-referrer-when-downgrade'
            },
            success: function(data) {
                resolve({ body: data, is_last_gw: false })
            },
            error: function(xhr, status, error) {
                if (force_last_gw) {
                    let last_gw = "" + (parseInt(gw) - 1);

                    $.ajax({
                        type: "GET",
                        url: `${proxy}/fantasy.premierleague.com/api/entry/${team_id}/event/${last_gw}/picks/`,
                        dataType: 'json',
                        async: true,
                        headers: {
                            'Access-Control-Allow-Origin': '*',
                            'Access-Control-Allow-Methods': 'GET',
                            'X-Requested-With': 'XMLHttpRequest',
                            'Referrer-Policy': 'no-referrer-when-downgrade'
                        },
                        success: function(data) {
                            resolve({ body: data, is_last_gw: true })
                        },
                        error: function(xhr, status, error) {
                            reject("Cannot get picks for last GW")
                        }
                    });
                } else {
                    reject("Cannot get picks for this GW")
                }
            }
        });
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

function getXPData({ season, gw, date }) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `data/${season}/${gw}/${date}/input/element_gameweek.csv`,
            dataType: "text",
            async: true,
            success: (data) => {
                tablevals = data.split('\n').map(i => i.split(','));
                keys = tablevals[0];
                values = tablevals.slice(1);
                let xp_data = values.map(i => _.zipObject(keys, i));
                let filtered_data = xp_data.filter(i => i.event == gw.slice(2))
                resolve(filtered_data);
            },
            error: function(xhr, status, error) {
                reject("Could not get XP data");
            }
        });
    });
}

function getXPData_Fernet({season, gw, date}) {
    if (season == "2020-21") {
        return getXPData({season, gw, date})
    }
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `data/${season}/${gw}/${date}/input/element_gameweek.csv-encrypted`,
            dataType: "text",
            async: true,
            success: (data) => {
                var secret = new fernet.Secret('symZ1LvXcAtjllNsDmhSp-GT1gDNPXw0P5eijrU8ogQ=');
                var token = new fernet.Token({
                    secret: secret,
                    token: data,
                    ttl: 0
                })
                let raw = token.decode();
                let csvdata = $.csv.toObjects(raw)
                resolve(csvdata.filter(i => i.event == gw.slice(2)))
            },
            error: ()  => {
                reject("Could not get XP data");
            }
        });
    })
}


function getDetailedData({season, gw, date}) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `data/${season}/${gw}/${date}/input/detailed-fplreview-free-planner.csv-encrypted`,
            dataType: "text",
            async: true,
            success: (data) => {
                var secret = new fernet.Secret('symZ1LvXcAtjllNsDmhSp-GT1gDNPXw0P5eijrU8ogQ=');
                var token = new fernet.Token({
                    secret: secret,
                    token: data,
                    ttl: 0
                })
                let raw = token.decode();
                let csvdata = $.csv.toObjects(raw)
                resolve(csvdata)
            },
            error: ()  => {
                reject("Could not get detailed data");
            }
        });
    })
}

function getSeasonProjection({season}) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `data/${season}/season_projection.csv`,
            dataType: "text",
            async: true,
            success: (data) => {
                let csvdata = $.csv.toObjects(data)
                resolve(csvdata)
            },
            error: ()  => {
                reject("Could not get detailed data");
            }
        });
    })
}


async function read_cached_xp(req_season) {
    return $.ajax({
        type: "GET",
        url: `data/${req_season}/xp.csv`,
        async: true,
        dataType: "text",
        success: (data) => {
            return data
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}


function getRPData(gw) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `${proxy}/fantasy.premierleague.com/api/event/${gw}/live/`,
            dataType: "json",
            async: true,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET',
                'X-Requested-With': 'XMLHttpRequest',
                'Referrer-Policy': 'no-referrer-when-downgrade'
            },
            success: function(data) {
                resolve(data.elements);
            },
            error: function(xhr, status, error) {
                reject("Error when getting live RP data");
            }
        });
    });
}

function getSeasonRPData(max_gw=38) {
    return new Promise((resolve, reject) => {
        let calls = []
        for (gw = 1; gw <= max_gw; gw++) {
            let current_gw = gw;
            let call = getRPData(gw)
                .then((data) => {
                    let d = {gw: current_gw, 'data': data.filter(i => i.stats.minutes !=0).map(i => {return {'id': i.id, 'e': i.explain}})}
                    return(d)
                })
                .catch((e) => {
                    // ignore
                })
            calls.push(call)
        }

        Promise.allSettled(calls).then((data) => {
            let combined = data.filter(i => i.status == 'fulfilled').map(i => i.value).map(i => [i.gw, i.data])
            let all_rp = Object.fromEntries(combined)
            resolve(all_rp)
        }).catch((e) => {
            reject(e)
        })
    })
    
}

function read_local_file(url) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: url,
            async: true,
            success: function(data) {
                resolve(data);
            },
            error: function() {
                reject("No data");
            }
        });
    });
}


function read_local_file_Fernet(url) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: url,
            dataType: "text",
            async: true,
            success: (data) => {
                var secret = new fernet.Secret('symZ1LvXcAtjllNsDmhSp-GT1gDNPXw0P5eijrU8ogQ=');
                var token = new fernet.Token({
                    secret: secret,
                    token: data,
                    ttl: 0
                })
                let raw = token.decode();
                resolve(raw)
            },
            error: ()  => {
                reject("Could not get XP data");
            }
        });
    })
}

async function read_cached_rp(req_season) {
    return $.ajax({
        type: "GET",
        url: `data/${req_season}/points.json?ts=${ts}`,
        async: true,
        dataType: "json",
        success: (data) => {
            return data
        },
        error: (xhr, status, error) => {
            console.log(error);
            console.error(xhr, status, error);
        }
    });
}

function get_analytics_data({season, gw}) {
    return new Promise((resolve, reject) => {
        $.ajax({
            type: "GET",
            url: `sample/${season}/${gw}/analytics_league.json`,
            dataType: "json",
            async: true,
            success: (data) => {
                resolve(data)
            },
            error: ()  => {
                reject("Could not find league data");
            }
        });
    })
}

let rank_formatter = Intl.NumberFormat('en');

function formatted_rank(value) {
    return rank_formatter.format(value)
}

function modify_time(origin, hour) {
    let t0 = new Date(origin);
    t0.setHours(t0.getHours() + hour);
    return t0.getTime();
}

function getScreenCoords(x, y, ctm) {
    var xn = ctm.e + x * ctm.a + y * ctm.c;
    var yn = ctm.f + x * ctm.b + y * ctm.d;
    return { x: xn, y: yn };
}

function convertToJS(value) {
    if (value == "true") {
        return true;
    } else if (value == "false") {
        return false;
    } else {
        return value;
    }
}

function millisecondsToStr(milliseconds) {
    let temp = milliseconds / 1000;
    const
        days = Math.floor((temp %= 31536000) / 86400),
        hours = Math.floor((temp %= 86400) / 3600),
        minutes = Math.floor((temp %= 3600) / 60),
        seconds = temp % 60;

    if (days || hours || seconds || minutes) {
        return (days ? days + " days " : "") +
            (hours ? hours + " hours " : "") +
            (minutes ? minutes + " minutes " : "") +
            Number.parseFloat(seconds).toFixed(0) + " seconds";
    }

    return "< 1 second";
}

function exportTableToCSV(selector, filename) {
    var csv = [];
    var rows = document.querySelectorAll(selector + " tr");
    
    for (var i = 0; i < rows.length; i++) {
        var row = [], cols = rows[i].querySelectorAll("td, th");
        for (var j = 0; j < cols.length; j++) 
            row.push(cols[j].innerText);
        csv.push(row.join(","));        
    }
    downloadCSV(csv.join("\n"), filename);
}

function downloadCSV(csv, filename) {
    var csvFile;
    var downloadLink;

    csvFile = new Blob([csv], {type: "text/csv"});

    downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    setTimeout(() => {
        downloadLink.remove()
    }, 500)
}

function saveAs(uri, filename) {
    var link = document.createElement('a');
    if (typeof link.download === 'string') {
        link.href = uri;
        link.download = filename;
        //Firefox requires the link to be in the body
        document.body.appendChild(link);
        //simulate click
        link.click();
        //remove the link when done
        document.body.removeChild(link);
    } else {
        window.open(uri);
    }
}


function createTeamFromList(sorted, picks, cap, vice_cap, tc, el_dict, xp_data) {
    if (sorted) {
        let team = {}
        team['picks'] = []
        picks.forEach((v,i) => {
            team.picks.push({
                'element': v,
                'multiplier': v == cap ? (tc == 1 ? 3 : 2) : i <= 10 ? 1 : 0,
                'is_captain': v == cap,
                'is_vice_captain': v == vice_cap,
                'position': i+1
            })
        })

        let have_cap = team.picks.find(i => i.is_captain)
        if (have_cap == undefined) {
            let e = team.picks.find(i => !i.is_vice_captain && i.multiplier > 0)
            e.is_captain = true
            e.multiplier = 2
        }

        let have_vcap = team.picks.find(i => i.is_vice_captain)
        if (have_vcap == undefined) {
            let e = team.picks.find(i => !i.is_captain && i.multiplier > 0)
            e.is_vice_captain = true
        }

        return _.cloneDeep(team)
    }
    else {
        let team = {}
        team['picks'] = []
        // id, element_type, name, xp, xmin_threshold, xp_if_plays
        let picks_with_xp = picks.map(i => [i, el_dict[i].element_type, el_dict[i].web_name, parseFloat( xp_data[i] && xp_data[i][0] || 0 ), parseFloat( xp_data[i] && xp_data[i][1] || 0 ), parseFloat( xp_data[i] && xp_data[i][2] || 0 )])
        let ordered_picks = _.orderBy(picks_with_xp, ['4', '5'], ['desc', 'desc'])
        // 1) sort by if played over 60 + points per scenario
        let position_bounds = {
            // 1: {'min': 1, 'max': 1},
            2: {'min': 3, 'max': 5},
            3: {'min': 2, 'max': 5},
            4: {'min': 1, 'max': 3}
        }

        let main_gk;
        let bench_gk;
        let lineup = [];
        let bench = [];

        main_gk = ordered_picks.filter(i => i[1] == 1)[0][0]
        bench_gk = ordered_picks.filter(i => i[1] == 1)[1][0]

        for (let pos in position_bounds) {
            if (pos == 1) { continue }
            let picked = ordered_picks.filter(i => i[1] == pos).slice(0, position_bounds[pos].min)
            picked.forEach((i) => lineup.push(i[0]))
        }
        // 2) then use averages for remaining players
        let remaining = _.orderBy(ordered_picks.filter(i => !lineup.includes(i[0]) && i[1] != 1), '3', 'desc')
        for (let i=lineup.length; i<10; i++) {
            lineup.push(remaining.shift()[0])
        }
        bench = remaining.map(i => i[0])

        cap = ordered_picks[0][0]
        vice_cap = ordered_picks[0][1] == 1 && ordered_picks[1][1] == 1 ? ordered_picks[2][0] : ordered_picks[1][0]
        let squad = [main_gk].concat(lineup).concat([bench_gk]).concat(bench)

        squad.forEach((v,i) => {
            team.picks.push({
                'element': v,
                'multiplier': v == cap ? 2 : i <= 10 ? 1 : 0,
                'is_captain': v == cap,
                'is_vice_captain': v == vice_cap,
                'position': i+1
            })
        })

        return _.cloneDeep(team)
    }
}


function read_xp_storage() {
    let raw_data = window.localStorage.getItem('xp_storage')
    if (raw_data) {
        let json_data = JSON.parse(raw_data)
        return json_data
    }
    return undefined
}



