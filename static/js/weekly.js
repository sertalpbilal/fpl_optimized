var app = new Vue({
    el: '#app',
    data: {
        season: season,
        gw: gw,
        date: date,
        listdates: listdates,
        solutions: {
            'no_limit_best_11': [],
            'limited_best_15': [],
            'limited_best_15_weighted': [],
            'limited_best_15_bb': [],
            'limited_best_differential': [],
            'limited_best_set_and_forget': []
        }
    },
    methods: {
        setSolution: function(key, vals) {
            this.solutions[key] = _.cloneDeep(vals);
        },
        get_field_solution(name) {
            let pos_ctr = { 1: 1, 2: 1, 3: 1, 4: 1, 'B': 1 }
            sol = this.solutions[name]
            sol.forEach(
                function(i) {
                    let cnt = sol.filter(j => j.element_type == i.element_type).filter(j => !j.starting_lineup || j.starting_lineup == "1").length;
                    i.xP = parseFloat(i.points_md);
                    if (!i.starting_lineup || i.starting_lineup == "1") {
                        i.x = 122 / (cnt + 1) * pos_ctr[parseInt(i.element_type)] - 17;
                        i.y = (parseInt(i.element_type) - 1) * 35 + 3;
                        pos_ctr[parseInt(i.element_type)] += 1;
                    } else {
                        i.x = 122 / 5 * pos_ctr['B'] - 17;
                        pos_ctr['B'] += 1;
                        i.y = 138.5;
                    }
                    i.is_captain = (i.is_captain == "True");
                    i.team_name = team_codes[parseInt(i.team_code)];
                    i.now_cost_str = (parseFloat(i.now_cost) / 10).toFixed(1);
                    i.selected_by_percent = parseFloat(i.selected_by_percent) || -1;
                })
            return sol;
        },
        get_solution_with_details(name) {
            let data = this.get_field_solution(name);
            let cost = data.map(i => i.now_cost).reduce((a, b) => parseFloat(a) + parseFloat(b), 0);
            let lineup_xp = data.filter(j => !j.starting_lineup || j.starting_lineup == "1").map(i => i.xP * parseInt(i.multiplier)).reduce((a, b) => a + b, 0);
            let bench_xp = data.filter(j => j.starting_lineup == "0").map(i => i.xP).reduce((a, b) => a + b, 0);
            let weighted_xp = lineup_xp + 0.1 * bench_xp;
            let bb_xp = lineup_xp + 1 * bench_xp;
            let avg_own = data.map(i => i.selected_by_percent).reduce((a, b) => a + b, 0);
            if (avg_own <= 0) { avg_own = "-" } else { avg_own = (avg_own / data.length).toFixed(2) + "%"; }
            return { data: data, cost: (cost / 10).toFixed(1), lineup_xp: lineup_xp.toFixed(2), weighted_xp: weighted_xp.toFixed(2), bb_xp: bb_xp.toFixed(2), avg_own: avg_own };
        },
        refresh_results() {
            season = this.season;
            gw = this.gw;
            date = this.date;
            load_all();
        },
        close_date() {
            $("#dateModal").modal('hide');
        }
    },
    computed: {
        field_solution_1: function() {
            return this.get_solution_with_details("no_limit_best_11");
        },
        field_solution_2: function() {
            return this.get_solution_with_details("limited_best_15");
        },
        field_solution_3: function() {
            return this.get_solution_with_details("limited_best_15_weighted");
        },
        field_solution_4: function() {
            return this.get_solution_with_details("limited_best_15_bb");
        },
        field_solution_5: function() {
            return this.get_solution_with_details("limited_best_differential");
        },
        field_solution_6: function() {
            return this.get_solution_with_details("limited_best_set_and_forget");
        },
        seasongwdate: {
            get: function() {
                return this.season + " / " + this.gw + " / " + this.date;
            },
            set: function(value) {
                let v = value.split(' / ');
                this.season = v[0];
                this.gw = v[1];
                this.date = v[2];
                this.refresh_results();
            }
        }
    }
})

function load_solution_from_file(name) {
    $.ajax({
        type: "GET",
        url: `data/${season}/${gw}/${date}/output/${name}.csv`,
        dataType: "text",
        success: function(data) {
            tablevals = data.split('\n').map(i => i.split(','));
            keys = tablevals[0];
            values = tablevals.slice(1);
            values_filtered = values.filter(i => i.length > 1);
            let squad = values_filtered.map(i => _.zipObject(keys, i));
            app.setSolution(name, squad);
        },
        error: function(xhr, status, error) {
            app.setSolution(name, []);
        }
    });
}

function load_all() {
    load_solution_from_file("no_limit_best_11");
    load_solution_from_file("limited_best_15");
    load_solution_from_file("limited_best_15_weighted");
    load_solution_from_file("limited_best_15_bb");
    load_solution_from_file("limited_best_differential");
    load_solution_from_file("limited_best_set_and_forget");
}

load_all();

// $.ajax({
//     type: "GET",
//     url: `data/${season}/${gw}/${date}/output/no_limit_best_11.csv`,
//     dataType: "text",
//     success: function(data) {
//         tablevals = data.split('\n').map(i => i.split(','));
//         keys = tablevals[0];
//         values = tablevals.slice(1);
//         values_filtered = values.filter(i => i.length > 1);
//         let squad = values_filtered.map(i => _.zipObject(keys, i));
//         app.setSolution('unlimited_best_11', squad);
//     }
// });


//         $('#unlimited_best_11_canvas').load('static/images/field.svg', function() {
//             $('#unlimited_best_11_canvas').find('svg').addClass('field mx-auto d-block');
//             let x = SVG("#unlimited_best_11_canvas > svg");
//             // let d = x.bbox();
//             $.ajax({
//                 type: "GET",
//                 url: `data/${season}/${gw}/${date}/output/no_limit_best_11.csv`,
//                 dataType: "text",
//                 success: function(data) {
//                     tablevals = data.split('\n').map(i => i.split(','));
//                     keys = tablevals[0];
//                     values = tablevals.slice(1);
//                     let squad = values.map(i => _.zipObject(keys, i));
//                     app.setSolution('unlimited_best_11', squad);
//                 }
//             });
//         });
//     }
// });


// field_svg = '';
// jersey_svg = '';

// function set_field_svg(v) {
//     field_svg = v;
// }

// function set_jersey_svg(v) {
//     jersey_svg = v;
// }

// $.ajax({
//     type: "GET",
//     url: `static/images/jersey.svg`,
//     async: false,
//     dataType: "text",
//     success: function(jsvg) {
//         set_jersey_svg(jsvg);
//     }
// });

// $.ajax({
//     type: "GET",
//     url: `static/images/field.svg`,
//     async: false,
//     dataType: "text",
//     success: function(fsvg) {
//         set_field_svg(fsvg);
//     }
// });